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
  MIN_SESSION_DURATION_CLEANUP = 4 * 60 * 1000  # 4 minutes en millisecondes
  MIN_EVENT_COUNT_CLEANUP = 400

  property db : DB::Database
  getter current_session_id : String?
  @event_queue : Channel(JSON::Any)
  @processing : Bool = false
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
    # cleanup_invalid_sessions # <--- ASSUREZ-VOUS QUE CETTE LIGNE EST COMMENTÉE
    spawn process_event_queue
    # puts "=== Initialisation du PoieticRecorder avec DB: #{db_path} ==="

    # === NETTOYAGE AU DÉMARRAGE ===
    puts "--- RECORDER: initialize --- Lancement du nettoyage initial des sessions."
    cleanup_invalid_sessions # Décommentez cet appel
    
    spawn process_event_queue
    puts "--- RECORDER: initialize --- Initialisation du PoieticRecorder terminée."
  end

  private def private_setup_database
    @db.exec "CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      event_count INTEGER DEFAULT 0,
      user_count INTEGER DEFAULT 0,
      first_user_uuid TEXT
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

  def get_sessions(page = 1, limit = 20, year = nil, month = nil, min_duration = nil, max_duration = nil, min_users = nil, max_users = nil)
    offset = (page - 1) * limit
    sessions = [] of Hash(String, JSON::Any)
    total_sessions = 0

    # Construire les conditions WHERE dynamiquement
    where_conditions = [] of String
    params = [] of (String | Int32 | Int64)

    # Filtrage par année
    if year && year >= 2015
      where_conditions << "strftime('%Y', datetime(start_time/1000, 'unixepoch')) = ?"
      params << year.to_s
    end

    # Filtrage par mois (seulement si année spécifiée)
    if month && year && year >= 2015 && month >= 1 && month <= 12
      where_conditions << "strftime('%m', datetime(start_time/1000, 'unixepoch')) = ?"
      params << month.to_s.rjust(2, '0')
    end

    # Filtrage par durée (en secondes)
    if min_duration
      where_conditions << "(end_time - start_time) >= ?"
      params << (min_duration * 1000).to_i64  # Convertir en millisecondes
    end

    if max_duration
      where_conditions << "(end_time - start_time) <= ?"
      params << (max_duration * 1000).to_i64  # Convertir en millisecondes
    end

    # Filtrage par nombre d'utilisateurs
    if min_users
      where_conditions << "user_count >= ?"
      params << min_users.to_i32
    end

    if max_users
      where_conditions << "user_count <= ?"
      params << max_users.to_i32
    end

    # Construire la clause WHERE
    where_clause = where_conditions.empty? ? "" : "WHERE " + where_conditions.join(" AND ")

    # Obtenir le nombre total de sessions avec filtres
    count_query = "SELECT COUNT(*) FROM sessions #{where_clause}"
    total_sessions = @db.query_one(count_query, args: params, as: Int32)

    # Obtenir les sessions pour la page courante avec filtres
    sessions_query = "SELECT 
         s.id, 
         s.start_time, 
         s.end_time,
         s.event_count,
         s.user_count,
         s.first_user_uuid
       FROM sessions s
     #{where_clause}
       ORDER BY start_time DESC
     LIMIT ? OFFSET ?"
    
    # Ajouter limit et offset aux paramètres
    query_params = params + [limit, offset]

    @db.query(sessions_query, args: query_params) do |rs|
      rs.each do
        session = {
          "id" => JSON::Any.new(rs.read(String)),
          "start_time" => JSON::Any.new(rs.read(Int64)),
          "end_time" => rs.read(Int64?).try { |t| JSON::Any.new(t) } || JSON::Any.new(nil),
          "event_count" => JSON::Any.new(rs.read(Int32)),
          "user_count" => JSON::Any.new(rs.read(Int32)),
          "first_user_uuid" => rs.read(String?).try { |uid| JSON::Any.new(uid) } || JSON::Any.new(nil)
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
    return if @current_session_id

    new_id = "session_#{Time.utc.to_unix_ms}"
    puts "--- RECORDER: PoieticRecorder#start_new_session --- Tentative de création de session avec ID: #{new_id}"

    begin
      @db.transaction do |tx|
        tx.connection.exec(
          "INSERT INTO sessions (id, start_time) VALUES (?, ?)",
          new_id, Time.utc.to_unix_ms
        )
        puts "--- RECORDER: PoieticRecorder#start_new_session --- INSERT dans sessions RÉUSSI pour ID: #{new_id}"

        tx.connection.exec(
          "INSERT INTO events (session_id, timestamp, event_type, event_data)
           VALUES (?, ?, 'session_start', ?)",
          new_id,
          Time.utc.to_unix_ms,
          JSON.build { |json| json.object { json.field "type", "session_start" } }
        )
        puts "--- RECORDER: PoieticRecorder#start_new_session --- INSERT de l'événement session_start RÉUSSI pour ID: #{new_id}"
      end
      @current_session_id = new_id # Assigner seulement si la transaction réussit
      puts "--- RECORDER: PoieticRecorder#start_new_session --- @current_session_id mis à #{new_id}"
    rescue ex
      puts "--- RECORDER: PoieticRecorder#start_new_session --- ERREUR lors de la création de la session #{new_id}: #{ex.message}"
      @current_session_id = nil # S'assurer qu'il est nil en cas d'erreur
    end
  end

  # Appelé quand le dernier utilisateur se déconnecte ou quand le serveur s'arrête
  def end_current_session
    puts "--- RECORDER: PoieticRecorder#end_current_session --- Début."
    original_session_id_to_end = @current_session_id
    
    unless current_session_id = @current_session_id
      puts "--- RECORDER: PoieticRecorder#end_current_session --- ERREUR: current_session_id est nil. Sortie."
      return
    end
    
    puts "--- RECORDER: PoieticRecorder#end_current_session --- Session ID à terminer: #{current_session_id}"

    # Attendre un court instant pour s'assurer que tous les événements sont traités
    # sleep(200.milliseconds) # Vous pouvez commenter/décommenter ceci pour voir si ça a un impact

    # Calculer event_count et user_count pour la session qui se termine
    event_count_for_session = 0
    user_ids_for_session = Set(String).new

    begin
      @db.query("SELECT event_type, event_data FROM events WHERE session_id = ?", current_session_id) do |rs|
        rs.each do
          event_count_for_session += 1
          
          event_type_str = rs.read(String)  # Lire la colonne event_type
          event_data_str = rs.read(String)  # Lire la colonne event_data
          
          puts "--- RECORDER DEBUG: event_type_str: #{event_type_str}, event_data_str avant parse: #{event_data_str}" # Log modifié
          
          begin
            event_data_json = JSON.parse(event_data_str) # Parser event_data_str
            if user_id = event_data_json["user_id"]?.try(&.as_s?)
              # Exclure les observateurs du comptage des utilisateurs si nécessaire
              # Utiliser event_data_json["type"] ou event_type_str selon votre besoin
              current_event_type = event_data_json["type"]?.try(&.as_s?) || event_type_str
              unless current_event_type && (current_event_type == "observer_joined" || current_event_type == "observer_left")
                user_ids_for_session.add(user_id)
              end
            end
          rescue ex_parse : JSON::ParseException
            puts "--- RECORDER: PoieticRecorder#end_current_session --- ERREUR JSON.parse pour event_data: '#{event_data_str}'. Erreur: #{ex_parse.message}"
            # Décidez si vous voulez quand même compter cet événement ou non
            # event_count_for_session pourrait déjà être incrémenté.
            # user_ids_for_session ne sera pas mis à jour pour cet événement.
          end
        end
      end
    rescue ex_query # Exception pour la requête DB elle-même
      puts "--- RECORDER: PoieticRecorder#end_current_session --- ERREUR lors de la requête DB des événements: #{ex_query.message}"
    end
    
    user_count_for_session = user_ids_for_session.size

    puts "--- RECORDER: PoieticRecorder#end_current_session --- Calculs avant UPDATE: Session ID: #{current_session_id}, Event count: #{event_count_for_session}, User count: #{user_count_for_session}, End time à écrire: #{Time.utc.to_unix_ms}"
    
    begin
      @db.exec(
        "UPDATE sessions SET end_time = ?, event_count = ?, user_count = ? WHERE id = ?",
        Time.utc.to_unix_ms, event_count_for_session, user_count_for_session, current_session_id
      )
      puts "--- RECORDER: PoieticRecorder#end_current_session --- UPDATE de la table sessions RÉUSSI pour session ID: #{current_session_id}."
    rescue ex
      puts "--- RECORDER: PoieticRecorder#end_current_session --- ERREUR lors de l'UPDATE de la table sessions pour ID #{current_session_id}: #{ex.message}"
    end
    
    @current_session_id = nil
    puts "--- RECORDER: PoieticRecorder#end_current_session --- Terminé. @current_session_id mis à nil. ID de session traité: #{original_session_id_to_end}"
    
    # === NETTOYAGE DE LA SESSION ACHEVÉE (et des autres si nécessaire) ===
    puts "--- RECORDER: end_current_session --- Lancement du nettoyage des sessions après la fin de la session #{original_session_id_to_end}."
    cleanup_invalid_sessions # Décommentez cet appel
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

      # Nouveaux paramètres de filtrage
      year = env.params.query["year"]?.try(&.to_i)
      month = env.params.query["month"]?.try(&.to_i)
      min_duration = env.params.query["min_duration"]?.try(&.to_i)
      max_duration = env.params.query["max_duration"]?.try(&.to_i)
      min_users = env.params.query["min_users"]?.try(&.to_i)
      max_users = env.params.query["max_users"]?.try(&.to_i)

      data = get_sessions(page, limit, year, month, min_duration, max_duration, min_users, max_users)
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
      file_param = env.params.url["file"].split("?").first
      env.response.headers["Content-Type"] = "text/css"
      begin
        file_content = FileStorage.get("css/#{file_param}")
        file_content.gets_to_end
      rescue ex
        env.response.status_code = 404
        "File not found: css/#{file_param}"
      end
    end

    # Routes pour les JS
    get "/js/:file" do |env|
      file_param = env.params.url["file"].split("?").first
      env.response.headers["Content-Type"] = "application/javascript"
      begin
        file_content = FileStorage.get("js/#{file_param}")
        file_content.gets_to_end
      rescue ex
        env.response.status_code = 404
        "File not found: js/#{file_param}"
      end
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
    puts "--- RECORDER: cleanup_invalid_sessions --- Début du nettoyage des sessions invalides."
    
    max_retries = 5
    retry_count = 0
    retry_delay = 1.0.seconds

    while retry_count < max_retries
      begin
        @db.transaction do |tx|
          sessions_to_delete = [] of String
          # Critère 1: Durée < MIN_SESSION_DURATION_CLEANUP (et session terminée)
          # Critère 2: event_count < MIN_EVENT_COUNT_CLEANUP (et session terminée)
          query = <<-SQL
            SELECT id FROM sessions
            WHERE end_time IS NOT NULL 
            AND (
                   ((end_time - start_time) < ?)
                OR (event_count < ?)
            )
          SQL
          
          tx.connection.query(query, MIN_SESSION_DURATION_CLEANUP, MIN_EVENT_COUNT_CLEANUP) do |rs_sessions_to_delete|
            rs_sessions_to_delete.each do
              sessions_to_delete << rs_sessions_to_delete.read(String)
            end
          end

          if sessions_to_delete.empty?
            puts "--- RECORDER: cleanup_invalid_sessions --- Aucune session à nettoyer selon les critères."
          else
            puts "--- RECORDER: cleanup_invalid_sessions --- Sessions à supprimer (ID): #{sessions_to_delete.join(", ")}"
            placeholders = sessions_to_delete.map { "?" }.join(",")
            
            delete_events_sql = "DELETE FROM events WHERE session_id IN (#{placeholders})"
            tx.connection.exec(delete_events_sql, args: sessions_to_delete.map { |id| id.as(DB::Any) })
            puts "--- RECORDER: cleanup_invalid_sessions --- Événements supprimés pour les sessions identifiées."

            delete_sessions_sql = "DELETE FROM sessions WHERE id IN (#{placeholders})"
            tx.connection.exec(delete_sessions_sql, args: sessions_to_delete.map { |id| id.as(DB::Any) })
            puts "--- RECORDER: cleanup_invalid_sessions --- Sessions supprimées de la table 'sessions'."
          end
        end
        puts "--- RECORDER: cleanup_invalid_sessions --- Nettoyage terminé avec succès."
        return 
      
      rescue ex : SQLite3::Exception
        if ex.message.try(&.includes?("database is locked"))
          retry_count += 1
          if retry_count < max_retries
            puts "--- RECORDER: cleanup_invalid_sessions --- Base de données verrouillée, nouvelle tentative dans #{retry_delay} secondes (#{retry_count}/#{max_retries})"
            sleep(retry_delay)
            retry_delay *= 1.5
          else
            puts "--- RECORDER: cleanup_invalid_sessions --- ERREUR CRITIQUE: Impossible d'accéder à la base de données après #{max_retries} tentatives. Abandon du nettoyage."
            # puts ex.message # Déjà inclus dans le message ci-dessus
            return 
          end
        else
          puts "--- RECORDER: cleanup_invalid_sessions --- ERREUR SQLite3 pendant le nettoyage: #{ex.message}"
          return 
        end
      rescue ex 
        puts "--- RECORDER: cleanup_invalid_sessions --- ERREUR INATTENDUE pendant le nettoyage: #{ex.message}"
        return 
      end
    end
    if retry_count >= max_retries
        puts "--- RECORDER: cleanup_invalid_sessions --- Nettoyage non complété à cause de verrous persistants sur la base de données."
    end
  end

  # Ajouter une méthode pour forcer le nettoyage
  # def force_cleanup
  #   cleanup_invalid_sessions #
  # end

  def set_first_user_for_session(session_id : String, user_uuid : String)
    puts "=== Recorder: Tentative de MAJ first_user_uuid = #{user_uuid} pour session #{session_id} ==="
    begin
      @db.exec(
        "UPDATE sessions SET first_user_uuid = ? WHERE id = ?",
        user_uuid, session_id
      )
      puts "=== Recorder: first_user_uuid MIS A JOUR pour session #{session_id} avec #{user_uuid} ==="
    rescue ex
      puts "=== Recorder ERREUR lors de la MAJ de first_user_uuid pour session #{session_id}: #{ex.message} ==="
    end
  end
end