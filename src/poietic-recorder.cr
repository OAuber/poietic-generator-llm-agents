require "db"
require "sqlite3"
require "json"
require "http/web_socket"
require "uuid"
require "kemal"
require "./file_storage"

class PoieticRecorder
  DEFAULT_DB_PATH = "db/recorder.db"
  # CACHE_DURATION = 5 * 60  # 5 minutes en secondes # Commenté car on ne cache plus la liste paginée complète

  # Constantes pour les critères de nettoyage
  MIN_SESSION_DURATION = 3 * 60 * 1000  # 3 minutes en millisecondes
  MIN_PARTICIPANTS = 2

  property db : DB::Database
  @event_queue : Channel(JSON::Any)
  @processing : Bool = false
  @current_session_id : String?
  @players : Hash(String, HTTP::WebSocket)
  # @sessions_cache : Array(Hash(String, JSON::Any))? # Supprimé, on ne cache plus la liste complète
  # @last_cache_update : Time? # Supprimé

  def initialize(db_path : String = DEFAULT_DB_PATH)
    # Créer le dossier de la base de données si nécessaire
    Dir.mkdir_p(File.dirname(db_path))
    
    # Configuration de la base de données avec WAL
    db_url = "sqlite3:#{db_path}?timeout=5000&mode=wal&journal_mode=wal"
    @db = DB.open(db_url)
    @db.exec("PRAGMA foreign_keys = ON")
    
    # Initialisation des autres propriétés
    @event_queue = Channel(JSON::Any).new(1000)
    @current_session_id = nil
    @players = {} of String => HTTP::WebSocket
    # @sessions_cache = nil # Supprimé
    # @last_cache_update = nil # Supprimé
    
    # Configuration et démarrage
    private_setup_database
    # ensure_test_session
    # cleanup_invalid_sessions # <--- COMMENTER POUR TEST
    spawn process_event_queue
    # puts "=== Initialisation du PoieticRecorder avec DB: #{db_path} ==="
  end

  private def private_setup_database
    @db.exec "CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      event_count INTEGER DEFAULT 0,
      user_count INTEGER DEFAULT 0
    )"

    @db.exec "CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    )"
  end

  private def process_event_queue
    @processing = true
    while @processing
      begin
        event_data = @event_queue.receive
        save_event(event_data)
      rescue ex
        # puts "Erreur dans la file d'événements: #{ex.message}"
      end
    end
  end

  def record_event(event_data : JSON::Any)
    return unless @current_session_id

    # puts "=== Recording event ==="
    # puts "=== Type: #{event_data["type"]?} ==="
    # puts "=== Data: #{event_data.to_json} ==="

    # S'assurer que l'événement a un timestamp
    timestamp = event_data["timestamp"]?.try(&.as_i64?) || Time.utc.to_unix_ms

    @db.transaction do |tx|
      tx.connection.exec(
        "INSERT INTO events (session_id, timestamp, event_type, event_data)
         VALUES (?, ?, ?, ?)",
        @current_session_id,
        timestamp,
        event_data["type"]?.try(&.as_s?) || "unknown",
        event_data.to_json
      )
    end
    # puts "=== Événement sauvegardé pour la session #{@current_session_id} ==="
  end

  private def save_event(event_data : JSON::Any)
    if @current_session_id.nil?
      # puts "=== ERREUR : Tentative de sauvegarde d'événement sans session active ==="
      return
    end

    # puts "=== Sauvegarde d'un événement ==="
    # puts "=== Type: #{event_data["type"]?} ==="
    # puts "=== Timestamp présent: #{event_data["timestamp"]?} ==="

    timestamp = event_data["timestamp"]?.try(&.as_i64?) || Time.utc.to_unix_ms

    @db.transaction do |tx|
      tx.connection.exec(
        "INSERT INTO events (session_id, timestamp, event_type, event_data)
         VALUES (?, ?, ?, ?)",
        @current_session_id,
        timestamp,
        event_data["type"]?.try(&.as_s?) || "unknown",
        event_data.to_json
      )
    end
    # puts "=== Événement sauvegardé pour la session #{@current_session_id} ==="
  end

  # Ancienne méthode mise en commentaire ou à supprimer
  # private def update_sessions_cache
  #   puts "=== Mise à jour du cache des sessions ==="
  #   sessions = [] of Hash(String, JSON::Any)
  #   @db.query(
  #     "SELECT 
  #        s.id, 
  #        s.start_time, 
  #        s.end_time,
  #        s.event_count,
  #        s.user_count
  #      FROM sessions s
  #      ORDER BY start_time DESC"
  #   ) do |rs|
  #     rs.each do
  #       session = {
  #         "id" => JSON::Any.new(rs.read(String)),
  #         "start_time" => JSON::Any.new(rs.read(Int64)),
  #         "end_time" => rs.read(Int64?).try { |t| JSON::Any.new(t) } || JSON::Any.new(nil),
  #         "event_count" => JSON::Any.new(rs.read(Int32)),
  #         "user_count" => JSON::Any.new(rs.read(Int32))
  #       }
  #       sessions << session
  #     end
  #   end
  #   @sessions_cache = sessions
  #   @last_cache_update = Time.utc
  #   puts "=== Cache des sessions mis à jour avec #{sessions.size} sessions ==="
  # end

  def get_sessions(page = 1, limit = 20) # Valeurs par défaut pour page et limit
    offset = (page - 1) * limit
    sessions = [] of Hash(String, JSON::Any)
    total_sessions = 0

    # Obtenir le nombre total de sessions
    total_sessions = @db.query_one("SELECT COUNT(*) FROM sessions", as: Int32)

    # Obtenir les sessions pour la page courante
    @db.query(
      "SELECT 
         s.id, 
         s.start_time, 
         s.end_time,
         s.event_count,
         s.user_count
       FROM sessions s
       ORDER BY start_time DESC
       LIMIT ? OFFSET ?",
      limit, offset
    ) do |rs|
      rs.each do
        session = {
          "id" => JSON::Any.new(rs.read(String)),
          "start_time" => JSON::Any.new(rs.read(Int64)),
          "end_time" => rs.read(Int64?).try { |t| JSON::Any.new(t) } || JSON::Any.new(nil),
          "event_count" => JSON::Any.new(rs.read(Int32)),
          "user_count" => JSON::Any.new(rs.read(Int32))
        }
        sessions << session
      end
    end
    
    # Retourner les sessions paginées et le nombre total
    { "sessions" => sessions, "total_sessions" => total_sessions, "page" => page, "limit" => limit }
  end

  def get_recent_events(limit = 20)
    return [] of Hash(String, JSON::Any) unless @current_session_id

    events = [] of Hash(String, JSON::Any)
    @db.query(
      "SELECT timestamp, event_type, event_data
       FROM events
       WHERE session_id = ?
       ORDER BY timestamp DESC
       LIMIT ?",
      @current_session_id,
      limit
    ) do |rs|
      rs.each do
        events << {
          "timestamp" => JSON::Any.new(rs.read(Int64)),
          "event_type" => JSON::Any.new(rs.read(String)),
          "event_data" => JSON::Any.new(rs.read(String))
        }
      end
    end

    # puts "Événements récents trouvés : #{events.size}"
    events
  end

  def cleanup
    end_current_session
    @processing = false
  end

  def get_stats
    if @current_session_id
      current_stats = @db.query_one(
        "SELECT COUNT(*) as event_count, MAX(timestamp) as last_event
         FROM events
         WHERE session_id = ?",
        @current_session_id,
        as: {Int64, Int64?}
      )

      # puts "Stats de la session courante : #{current_stats[0]} événements, dernier à #{current_stats[1]}"

      {
        "total_events" => JSON::Any.new(current_stats[0]),
        "total_sessions" => JSON::Any.new(1_i64),
        "last_event" => current_stats[1].try { |t| JSON::Any.new(t) } || JSON::Any.new(nil)
      }
    else
      # puts "Pas de session courante, stats à zéro"
      {
        "total_events" => JSON::Any.new(0_i64),
        "total_sessions" => JSON::Any.new(0_i64),
        "last_event" => JSON::Any.new(nil)
      }
    end
  end

  def connect_to_main_server
    # Utiliser localhost en dev, l'IP du serveur en prod
    uri = URI.parse("ws://#{host}:3001/record")
    uri.query = HTTP::Params.encode({"token" => "secret_token_123"})

    socket = HTTP::WebSocket.new(uri)

    socket.on_message do |message|
      begin
        event_data = JSON.parse(message)
        # puts "=== WebSocket: Reçu événement de type: #{event_data["type"]?} ==="
        record_event(event_data)
        # puts "=== WebSocket: Événement enregistré: #{event_data["type"]?} ==="
      rescue ex
        # puts "Erreur lors du traitement du message WebSocket: #{ex.message}"
        # puts ex.backtrace.join("\n")
      end
    end

    socket.on_close do
      # puts "Déconnecté du serveur principal"
      sleep 5.seconds
      spawn { connect_to_main_server }
    end

    begin
      # puts "Tentative de connexion au serveur principal..."
      socket.run
    rescue ex
      # puts "Erreur de connexion: #{ex.message}"
      sleep 5.seconds
      spawn { connect_to_main_server }
    end
  end

  def create_session
    session_id = Time.utc.to_unix_ms.to_s
    @db.exec(
      "INSERT INTO sessions (id, start_time) VALUES (?, ?)",
      session_id, Time.utc.to_unix_ms
    )
    session_id
  end

  def close_session(session_id)
    @db.exec(
      "UPDATE sessions SET end_time = ? WHERE id = ?",
      Time.utc.to_unix_ms, session_id
    )
  end

  # Appelé quand le premier utilisateur se connecte
  def start_new_session
    # @sessions_cache = nil  # Invalider le cache # Plus pertinent si on ne cache plus la liste complète
    return if @current_session_id

    @current_session_id = "session_#{Time.utc.to_unix_ms}"
    # puts "=== Création d'une nouvelle session : #{@current_session_id} ==="

    @db.transaction do |tx|
      tx.connection.exec(
        "INSERT INTO sessions (id, start_time) VALUES (?, ?)",
        @current_session_id, Time.utc.to_unix_ms
      )

      # Enregistrer l'événement de début de session directement
      tx.connection.exec(
        "INSERT INTO events (session_id, timestamp, event_type, event_data)
         VALUES (?, ?, 'session_start', ?)",
        @current_session_id,
        Time.utc.to_unix_ms,
        JSON.build { |json| json.object { json.field "type", "session_start" } }
      )
    end
  end

  # Appelé quand le dernier utilisateur se déconnecte ou quand le serveur s'arrête
  def end_current_session
    # @sessions_cache = nil  # Invalider le cache # Plus pertinent
    return unless current_session_id = @current_session_id

    # Attendre un court instant pour s'assurer que tous les événements sont traités
    sleep(200.milliseconds)

    # Calculer event_count et user_count pour la session qui se termine
    event_count_for_session = 0
    user_ids_for_session = Set(String).new

    @db.query("SELECT event_type, event_data FROM events WHERE session_id = ?", current_session_id) do |rs|
      rs.each do
        event_count_for_session += 1
        event_data_json = JSON.parse(rs.read(String))
        if user_id = event_data_json["user_id"]?.try(&.as_s?)
          # Exclure les observateurs du comptage des utilisateurs si nécessaire
          event_type = event_data_json["type"]?.try(&.as_s?)
          unless event_type && (event_type == "observer_joined" || event_type == "observer_left")
            user_ids_for_session.add(user_id)
          end
        end
      end
    end
    user_count_for_session = user_ids_for_session.size

    puts "=== Fin de la session : #{current_session_id} ==="
    puts "    Event count: #{event_count_for_session}, User count: #{user_count_for_session}"
    @db.exec(
      "UPDATE sessions SET end_time = ?, event_count = ?, user_count = ? WHERE id = ?",
      Time.utc.to_unix_ms, event_count_for_session, user_count_for_session, current_session_id
    )
    @current_session_id = nil
    
    # Lancer le nettoyage après la fin de la session
    # cleanup_invalid_sessions # Garder commenté pour l'instant
  end

  def get_current_session
    return nil unless @current_session_id

    result = @db.query_one?(
      "SELECT
        id,
        start_time,
        end_time,
        (SELECT COUNT(*) FROM events WHERE session_id = sessions.id) as event_count
       FROM sessions
       WHERE id = ?",
      @current_session_id
    ) do |rs|
      {
        "id" => JSON::Any.new(rs.read(String)),
        "start_time" => JSON::Any.new(rs.read(Int64)),
        "end_time" => rs.read(Int64?).try { |t| JSON::Any.new(t) } || JSON::Any.new(nil),
        "event_count" => JSON::Any.new(rs.read(Int64))
      }
    end

    # puts "Session courante : #{result.try(&.to_json) || "aucune"}"
    result
  end

  def get_session_events(session_id : String)
    events = [] of Hash(String, JSON::Any)

    # puts "=== Getting events for session #{session_id} ==="
    # puts "=== Requête SQL: SELECT timestamp, event_data FROM events WHERE session_id = ? ORDER BY timestamp ==="

    @db.query("SELECT timestamp, event_data FROM events WHERE session_id = ? ORDER BY timestamp", session_id) do |rs|
      rs.each do
        timestamp = rs.read(Int64)
        event_str = rs.read(String)
        event_json = JSON.parse(event_str)

        # puts "=== Lu événement: type=#{event_json["type"]?}, timestamp=#{timestamp} ==="

        # S'assurer que le timestamp est présent dans l'événement
        event_data = event_json.as_h
        event_data["timestamp"] = JSON::Any.new(timestamp)

        events << event_data
      end
    end

    # puts "=== Nombre total d'événements lus: #{events.size} ==="
    # puts "=== Types d'événements trouvés: #{events.map { |e| e["type"] }.uniq.join(", ")} ==="
    # puts "=== Dernier événement: #{events.last?.try &.inspect} ==="
    events
  end

  private def update_initial_state(state, event)
    user_id = event["user_id"].as_s
    if pos = event["position"]?
        positions = state["user_positions"].as_h
        # Créer un tableau JSON::Any pour la position
        position_array = JSON::Any.new([
          JSON::Any.new(pos[0].as_i.to_i64),
          JSON::Any.new(pos[1].as_i.to_i64)
        ] of JSON::Any)
        positions[user_id] = position_array
        state["user_positions"] = JSON::Any.new(positions)
    end
    if color = event["color"]?
        colors = state["user_colors"].as_h
        colors[user_id] = JSON::Any.new(color.as_s)
        state["user_colors"] = JSON::Any.new(colors)
    end
  end

  private def update_cell_state(state, event)
    user_id = event["user_id"].as_s
    sub_x = event["sub_x"].as_i
    sub_y = event["sub_y"].as_i
    color = event["color"].as_s

    sub_states = state["sub_cell_states"].as_h
    user_cells = sub_states[user_id]?.try(&.as_h) || Hash(String, JSON::Any).new
    user_cells["#{sub_x},#{sub_y}"] = JSON::Any.new(color)
    sub_states[user_id] = JSON::Any.new(user_cells)
    state["sub_cell_states"] = JSON::Any.new(sub_states)
  end

  private def calculate_grid_size(user_count : Int32)
    return 1 if user_count == 0
    max_position = (Math.sqrt(user_count - 1).ceil.to_i)
    2 * max_position + 1
  end

  def record_initial_state(initial_state : JSON::Any)
    return unless @current_session_id

    # Enregistrer l'état initial global
    record_event(JSON.parse({
      "type": "initial_state",
      "timestamp": Time.utc.to_unix_ms,
      "grid_size": initial_state["grid_size"],
      "user_colors": initial_state["user_colors"],
    }.to_json))

    # Enregistrer la position de chaque utilisateur
    initial_state["grid_state"]["user_positions"].as_h.each do |user_id, position|
      record_event(JSON.parse({
        "type": "user_position",
        "timestamp": Time.utc.to_unix_ms,
        "user_id": user_id,
        "position": position,
      }.to_json))
    end

    # Enregistrer l'état initial de chaque cellule
    initial_state["sub_cell_states"].as_h.each do |user_id, cells|
      cells.as_h.each do |coords, color|
        x, y = coords.split(",").map(&.to_i)
        record_event(JSON.parse({
          "type": "cell_update",
          "timestamp": Time.utc.to_unix_ms,
          "user_id": user_id,
          "sub_x": x,
          "sub_y": y,
          "color": color,
          "initial": true
        }.to_json))
      end
    end
  end

  def add_player(socket : HTTP::WebSocket)
    player_id = "player_#{UUID.random}"
    @players[player_id] = socket
    # puts "=== Player #{player_id} connecté ==="
    player_id
  end

  def remove_player(player_id : String)
    if @players.delete(player_id)
      # puts "=== Player #{player_id} déconnecté ==="
    end
  end

  def start_server(port : Int32)
    # puts "=== Démarrage du serveur recorder sur le port #{port} ==="

    # Configuration Kemal
    Kemal.config.port = port
    Kemal.config.env = "production"
    Kemal.config.host_binding = "0.0.0.0"

    # Configuration CORS
    before_all do |env|
      # puts "=== Requête reçue sur le recorder: #{env.request.method} #{env.request.path} ==="
      env.response.headers["Access-Control-Allow-Origin"] = "*"
      env.response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
      env.response.headers["Access-Control-Allow-Headers"] = "*"
    end

    # Routes pour le player
    get "/api/player/sessions" do |env|
      page = env.params.query["page"]?.try(&.to_i) || 1
      limit = env.params.query["limit"]?.try(&.to_i) || 20 # Default 20 items per page
      limit = Math.min(limit, 100) # Max 100 items per page

      data = get_sessions(page, limit)
      env.response.content_type = "application/json"
      data.to_json
    end

    get "/api/player/sessions/:id/events" do |env|
      session_id = env.params.url["id"]
      # puts "=== Récupération des événements pour la session #{session_id} ==="
      env.response.content_type = "application/json"
      events = get_session_events(session_id)
      # puts "=== Nombre d'événements trouvés: #{events.size} ==="
      # puts "=== Premier événement: #{events.first.inspect} ==="
      # puts "=== Dernier événement: #{events.last.inspect} ==="
      events.to_json
    end

    get "/" do |env|
      file = FileStorage.get("player.html")
      file.gets_to_end
    end

    # Routes pour les CSS
    get "/css/:file" do |env|
      file = env.params.url["file"]
      env.response.headers["Content-Type"] = "text/css"
      file = FileStorage.get("css/#{file}")
      file.gets_to_end
    end

    # Routes pour les JS
    get "/js/:file" do |env|
      file = env.params.url["file"]
      env.response.headers["Content-Type"] = "application/javascript"
      file = FileStorage.get("js/#{file}")
      file.gets_to_end
    end

    # Démarrer le serveur
    Kemal.run
  end

  def ensure_test_session
    count = @db.query_one("SELECT COUNT(*) FROM sessions", as: Int64)
    if count == 0
      # puts "=== Création d'une session de test ==="
      session_id = UUID.random.to_s
      start_time = Time.utc.to_unix_ms
      @db.exec(
        "INSERT INTO sessions (id, start_time) VALUES (?, ?)",
        session_id, start_time
      )
      # puts "=== Session de test créée: #{session_id} ==="
    end
  end

  def handle_initial_state(session_id : String, data : JSON::Any)
    # puts "=== Enregistrement de l'état initial ==="
    # puts "=== Session: #{session_id} ==="
    # puts "=== Data reçue: #{data.inspect} ==="

    initial_state = {
      type: "initial_state",
      timestamp: Time.utc.to_unix_ms,
      grid_size: data["grid_size"]? || 3,
      user_positions: data["user_positions"]? || {} of String => Array(Int32),
      user_colors: data["user_colors"]? || {} of String => String,
      sub_cell_states: data["sub_cell_states"]? || {} of String => Hash(String, String)
    }

    # puts "=== État initial à sauvegarder: #{initial_state.inspect} ==="

    save_event(
      session_id,
      "initial_state",
      initial_state.to_json
    )
  end

  def save_event(session_id : String, event_type : String, event_data : String)
    # puts "=== Sauvegarde d'un événement ==="
    # puts "=== Type: #{event_type} ==="
    # puts "=== Data: #{event_data} ==="

    @db.exec(
      "INSERT INTO events (session_id, timestamp, event_type, event_data) VALUES (?, ?, ?, ?)",
      session_id, Time.utc.to_unix_ms, event_type, event_data
    )
  end

  def record_user_left(user_id : String)
    return unless current_session_id = @current_session_id

    event = JSON.parse({
      type: "user_left",
      timestamp: Time.utc.to_unix_ms,
      user_id: user_id
    }.to_json)

    # Sauvegarder directement l'événement sans passer par la file
    save_event(current_session_id, "user_left", event.to_json)
  end

  def record_zoom_update(grid_size : Int32, grid_state : String, user_colors : Hash(String, String))
    return unless current_session_id = @current_session_id

    event = JSON.parse({
      type: "zoom_update",
      timestamp: Time.utc.to_unix_ms,
      grid_size: grid_size,
      grid_state: grid_state,
      user_colors: user_colors
    }.to_json)

    save_event(current_session_id, "zoom_update", event.to_json)
  end

  private def cleanup_invalid_sessions
    # @sessions_cache = nil  # Invalider le cache avant le nettoyage
    puts "=== Début du nettoyage des sessions invalides ==="
    
    max_retries = 5
    retry_count = 0
    retry_delay = 1.0  # secondes

    while retry_count < max_retries
      begin
        @db.transaction do |tx|
          # 1. Supprimer d'abord les événements orphelins
          puts "=== Suppression des événements orphelins (tentative #{retry_count + 1}/#{max_retries}) ==="
          tx.connection.exec(
            "DELETE FROM events WHERE session_id NOT IN (SELECT id FROM sessions)"
          )

          # 2. Supprimer les sessions trop courtes ou inactives
          puts "=== Suppression des sessions invalides ==="
          tx.connection.exec(
            "DELETE FROM events WHERE session_id IN (
               SELECT id FROM sessions 
               WHERE ((end_time - start_time) < ? AND end_time IS NOT NULL)
               OR (
                 end_time IS NULL 
                 AND (? - start_time) > ? 
                 AND (
                   SELECT COUNT(DISTINCT json_extract(event_data, '$.user_id'))
                   FROM events 
                   WHERE session_id = sessions.id
                   AND json_extract(event_data, '$.type') NOT IN ('observer_joined', 'observer_left')
                 ) < ?
               )
             )",
            MIN_SESSION_DURATION,
            Time.utc.to_unix_ms,
            MIN_SESSION_DURATION,
            MIN_PARTICIPANTS
          )

          # 3. Supprimer les sessions sans événements de dessin dans une requête séparée
          puts "=== Suppression des sessions sans dessin ==="
          tx.connection.exec(
            "DELETE FROM events WHERE session_id IN (
               SELECT s.id 
               FROM sessions s
               WHERE NOT EXISTS (
                 SELECT 1 
                 FROM events e 
                 WHERE e.session_id = s.id
                 AND json_extract(e.event_data, '$.type') = 'cell_update'
                 AND json_extract(e.event_data, '$.initial') IS NULL
               )
             )"
          )

          # 4. Nettoyer les sessions sans événements
          puts "=== Nettoyage final des sessions sans événements ==="
          tx.connection.exec(
            "DELETE FROM sessions WHERE id NOT IN (
               SELECT DISTINCT session_id FROM events
             )"
          )
        end
        puts "=== Nettoyage des sessions terminé avec succès ==="
        return  # Sortir de la boucle si tout s'est bien passé
      rescue ex : SQLite3::Exception
        if ex.message.try(&.includes?("database is locked"))
          retry_count += 1
          if retry_count < max_retries
            puts "=== Base de données verrouillée, nouvelle tentative dans #{retry_delay} secondes (#{retry_count}/#{max_retries}) ==="
            sleep(retry_delay.seconds)  # Utilisation de Time::Span
            retry_delay *= 1.5  # Augmenter progressivement le délai
          else
            puts "=== ERREUR : Impossible d'accéder à la base de données après #{max_retries} tentatives ==="
            puts ex.message
          end
        else
          puts "=== ERREUR pendant le nettoyage des sessions: #{ex.message} ==="
          puts ex.backtrace.join("\n")
          break  # Sortir de la boucle pour les autres types d'erreurs
        end
      rescue ex
        puts "=== ERREUR pendant le nettoyage des sessions: #{ex.message} ==="
        puts ex.backtrace.join("\n")
        break  # Sortir de la boucle pour les autres types d'erreurs
      end
    end
  end

  # Ajouter une méthode pour forcer le nettoyage
  def force_cleanup
    cleanup_invalid_sessions
  end
end