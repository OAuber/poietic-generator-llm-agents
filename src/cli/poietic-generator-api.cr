require "kemal"
require "uuid"
require "json"
require "../poietic-recorder"
require "../file_storage"

class Grid
  property user_positions : Hash(String, Tuple(Int32, Int32))
  property sub_cell_states : Hash(String, Hash(Tuple(Int32, Int32), String))
  # property initial_colors : Hash(String, Array(String)) # Supprimé

  def initialize
    @user_positions = Hash(String, Tuple(Int32, Int32)).new
    @sub_cell_states = Hash(String, Hash(Tuple(Int32, Int32), String)).new
    # @initial_colors = Hash(String, Array(String)).new # Supprimé
  end

  def set_user_position(user_id : String, position : Tuple(Int32, Int32))
    @user_positions[user_id] = position
    # @initial_colors[user_id] = generate_initial_colors(user_id) unless @initial_colors.has_key?(user_id) # Supprimé
    @sub_cell_states[user_id] ||= Hash(Tuple(Int32, Int32), String).new
  end

  def get_user_position(user_id : String)
    @user_positions[user_id]?  # Ajout du ? pour retourner nil si la clé n'existe pas
  end

  def to_json(json : JSON::Builder)
    json.object do
      json.field "user_positions" do
        json.object do
          @user_positions.each do |user_id, position|
            json.field user_id do
              json.array do
                json.number position[0]
                json.number position[1]
              end
            end
          end
        end
      end
      # Le champ "initial_colors" n'est plus nécessaire ici car il est supprimé de la classe
      # Si vous aviez une sérialisation pour initial_colors, elle serait retirée.
    end
  end

  def remove_user(user_id : String)
    @user_positions.delete(user_id)
    @sub_cell_states.delete(user_id)
    # @initial_colors.delete(user_id) # Supprimé
  end

  def find_next_available_position : Tuple(Int32, Int32)
    return {0, 0} if @user_positions.empty?

    spiral_positions = generate_spiral_positions(@user_positions.size + 1)
    spiral_positions.find { |pos| !@user_positions.values.includes?(pos) } || {0, 0}
  end

  def update_sub_cell(user_id : String, sub_x : Int32, sub_y : Int32, color : String)
    if position = @user_positions[user_id]?
      @sub_cell_states[user_id] ||= Hash(Tuple(Int32, Int32), String).new
      @sub_cell_states[user_id][{sub_x, sub_y}] = color
    end
  end

  def get_sub_cell_states(user_id : String)
    @sub_cell_states[user_id]? || Hash(Tuple(Int32, Int32), String).new
  end

  private def generate_spiral_positions(count : Int32)
    positions = [{0, 0}]
    return positions if count == 1

    x = y = 0
    dx = 1
    dy = 0
    steps = 0
    step_size = 1

    (count - 1).times do
      x += dx
      y += dy
      positions << {x, y}
      steps += 1

      if steps == step_size
        steps = 0
        dx, dy = -dy, dx  # Rotation de 90 degrés
        step_size += 1 if dy == 0  # Augmente la taille du pas après un tour complet
      end
    end

    positions
  end

  def effective_size
    return 1 if @user_positions.empty?
    max_position = @user_positions.values.map { |pos| [pos[0].abs, pos[1].abs].max }.max
    next_odd(2 * max_position + 1)
  end

  private def next_odd(n : Int32) : Int32  # Ajout du type de retour explicite
    n.even? ? n + 1 : n
  end

  # private def generate_initial_colors(user_id : String) ... (Méthode entièrement supprimée)
  # private def hue_to_rgb(p : Float64, q : Float64, t : Float64) : Float64 ... (Méthode entièrement supprimée)
  # private def hsl_to_hex(h : Float64, s : Float64, l : Float64) : String ... (Méthode entièrement supprimée)
end

class Session
  INACTIVITY_TIMEOUT = 180.seconds       # Timeout général pour tous les clients
  LLM_INACTIVITY_TIMEOUT = 420.seconds   # Timeout spécifique pour les clients LLM (type=bot) - 7 minutes pour génération longue
  RECONNECTION_TIMEOUT = 15.seconds       # Temporairement réduit de 180.seconds

  property users : Hash(String, HTTP::WebSocket)
  property observers : Hash(String, HTTP::WebSocket)
  property grid : Grid
  property user_colors : Hash(String, String)
  property last_activity : Hash(String, Time)
  property last_heartbeat : Hash(String, Time)
  property recorders : Array(HTTP::WebSocket)
  property pending_disconnects : Hash(String, Time)
  property llm_clients : Set(String)  # Identifie les clients LLM (type=bot)

  def initialize
    @users = Hash(String, HTTP::WebSocket).new
    @observers = Hash(String, HTTP::WebSocket).new
    @grid = Grid.new
    @user_colors = Hash(String, String).new
    @last_activity = Hash(String, Time).new
    @last_heartbeat = Hash(String, Time).new
    @recorders = [] of HTTP::WebSocket
    @pending_disconnects = Hash(String, Time).new
    @llm_clients = Set(String).new
  end

  def add_user(socket : HTTP::WebSocket, forced_id : String? = nil) : String
    user_id = forced_id
    # puts "--- add_user --- Debut. forced_id: #{forced_id}" # LOG AJOUTÉ

    # 1. Si reconnexion dans le délai de grâce
    if user_id && @pending_disconnects.has_key?(user_id)
      # puts "--- add_user --- Cas 1: Reconnexion depuis pending_disconnects pour user_id: #{user_id}" # LOG AJOUTÉ
      @pending_disconnects.delete(user_id)
      @users[user_id] = socket
      @last_heartbeat[user_id] = Time.utc
      send_initial_state(user_id)
      broadcast_new_user(user_id)
      broadcast_zoom_update
      # puts "Connexion avec user_id=#{user_id} (pending=#{@pending_disconnects.has_key?(user_id)})"
      return user_id
    end

    # 1bis. Si user_id déjà utilisé (connexion concurrente ou reconnexion rapide avant fermeture de l'ancienne socket)
    if user_id && @users.has_key?(user_id)
      # puts "--- add_user --- Cas 1bis: user_id déjà dans @users: #{user_id}. Fermeture ancienne socket." # LOG AJOUTÉ
      old_socket = @users[user_id]
      begin
        old_socket.close
      rescue ex
        # ignore
      end
      @pending_disconnects[user_id] = Time.utc
      @users.delete(user_id)
      @last_activity.delete(user_id)
      @last_heartbeat.delete(user_id)
      
      @pending_disconnects.delete(user_id) # On le retire aussitôt pour le réassigner
      @users[user_id] = socket
      @last_heartbeat[user_id] = Time.utc
      send_initial_state(user_id)
      broadcast_new_user(user_id)
      broadcast_zoom_update
      # puts "Connexion avec user_id=#{user_id} (pending=force_reconnect)"
      return user_id
    end

    # 2. Nouvelle connexion (ou user_id obsolète)
    original_user_id_if_forced = user_id # Garder une trace si un ID forcé était fourni mais non reconnu
    user_id = UUID.random.to_s # Génère un nouvel ID
    # puts "--- add_user --- Cas 2: Nouvelle connexion ou forced_id non reconnu ('#{original_user_id_if_forced}'). Nouvel user_id généré: #{user_id}" # LOG AJOUTÉ
    
    # === AJOUT : Déclencher start_new_session du recorder si c'est le PREMIER utilisateur de CETTE session API ===
    was_session_empty = @users.empty? # Vérifier AVANT d'ajouter le nouvel utilisateur

    @users[user_id] = socket
    @last_activity[user_id] = Time.utc
    @last_heartbeat[user_id] = Time.utc
    position = @grid.find_next_available_position
    @grid.set_user_position(user_id, position)
    @grid.sub_cell_states[user_id] = Hash(Tuple(Int32, Int32), String).new

    if was_session_empty # Si la session API était vide avant cet utilisateur
      # puts "--- API: Session#add_user --- Premier utilisateur pour cette session API. Appel de API.recorder.start_new_session."
      API.recorder.start_new_session 
      # Maintenant, le recorder devrait avoir un @current_session_id.
      # La logique pour set_first_user_for_session viendra après send_initial_state
    end
        
    send_initial_state(user_id) # Ceci doit venir après start_new_session pour que session_start_time soit correct
    
    # La logique pour set_first_user_uuid doit utiliser le user_id réel de CETTE session
    if was_session_empty && (current_recorder_session_id = API.recorder.current_session_id)
         API.recorder.set_first_user_for_session(current_recorder_session_id, user_id) # Utiliser user_id (le nouveau)
    end

    broadcast_new_user(user_id)
    broadcast_zoom_update
    user_id
  end

  def add_observer(socket : HTTP::WebSocket) : String
    observer_id = "observer_#{UUID.random}"
    @observers[observer_id] = socket
    send_initial_state(observer_id)
    observer_id
  end

  def remove_observer(observer_id : String)
    @observers.delete(observer_id)
    # puts "=== Observer removed: #{observer_id} ==="
  end

  def send_initial_state(user_id : String)
    grid_size = calculate_grid_size
    current_time = Time.utc.to_unix_ms

    session_start_time = API.recorder.get_current_session.try(&.["start_time"].as_i64) || current_time

    # N'ENVOIE PAS les sub_cell_states du nouvel utilisateur
    base_state = {
      type: "initial_state",
      timestamp: current_time,
      session_start_time: session_start_time,
      grid_size: grid_size,
      grid_state: @grid.to_json,
      sub_cell_states: serialize_sub_cell_states(user_id) # <-- exclut le user_id courant
    }

    if user_id.starts_with?("observer_")
      @observers[user_id].send(base_state.to_json)
    else
      client_state = base_state.merge({my_user_id: user_id})
      @users[user_id].send(client_state.to_json)

      # Enregistrement pour le recorder
      recorder_state = {
        type: "initial_state",
        timestamp: current_time,  # Utiliser le même timestamp
        grid_size: grid_size,
        user_positions: @grid.user_positions.transform_values { |pos| [pos[0], pos[1]] },
        sub_cell_states: serialize_sub_cell_states(user_id)
      }

      API.recorder.record_event(JSON.parse(recorder_state.to_json))
    end
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
    }.to_json
    broadcast(new_user_message)
  end

  def calculate_grid_size
    @grid.effective_size
  end

  def broadcast_initial_state(user)
    # puts "=== Envoi de l'état initial ==="
    state = {
      type: "initial_state",
      timestamp: Time.utc.to_unix_ms,  # Ajout du timestamp ici
      grid_size: calculate_grid_size,
      user_positions: @grid.user_positions.transform_values { |pos| [pos[0], pos[1]] },
      sub_cell_states: serialize_sub_cell_states
    }# 
    # puts "=== État initial: #{state.inspect} ==="
    broadcast(state.to_json)
  end

  def remove_user(user_id : String)
    # puts "--- API: Session#remove_user --- Appelé pour user_id: #{user_id}"
    if position = @grid.get_user_position(user_id)
      API.recorder.record_user_left(user_id)
      broadcast_user_left(user_id, position) # Assurez-vous que c'est le bon appel ici
      @grid.remove_user(user_id)
      @users.delete(user_id)
      @last_activity.delete(user_id)
      @last_heartbeat.delete(user_id)
      @pending_disconnects.delete(user_id)
      # puts "--- API: Session#remove_user --- Utilisateur #{user_id} retiré. Utilisateurs restants: #{@users.size}"
      broadcast_zoom_update
      if @users.empty?
        # puts "--- API: Session#remove_user --- Plus d'utilisateurs. Appel de API.recorder.end_current_session."
        API.recorder.end_current_session
      end
    else
      # puts "--- API: Session#remove_user --- Utilisateur #{user_id} non trouvé dans la grille. Retrait simple."
      @users.delete(user_id)
      @pending_disconnects.delete(user_id)
    end
    # Retirer aussi de llm_clients si présent
    @llm_clients.delete(user_id)
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      timestamp: Time.utc.to_unix_ms,
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      sub_cell_states: serialize_sub_cell_states
    }

    # Enregistrer explicitement dans le recorder
    API.recorder.record_event(JSON.parse(zoom_update_message.to_json))

    # Puis broadcaster aux clients et observers
    message = zoom_update_message.to_json
    broadcast(message)
    send_to_observers(message)
  end

  def broadcast_user_left(user_id : String, position : Tuple(Int32, Int32))
    message = {
      type: "user_left",
      user_id: user_id,
      position: position,
      timestamp: Time.utc.to_unix_ms
    }.to_json

    broadcast(message)
  end

  def broadcast(message)
    # Broadcast aux utilisateurs réguliers
    @users.each do |user_id, socket|
      begin
        socket.send(message)
      rescue ex
        # puts "Error sending to user #{user_id}: #{ex.message}"
      end
    end

    # Broadcast aux observateurs (maintenant sans risque de déconnexion)
    @observers.each do |observer_id, socket|
      begin
        socket.send(message)
      rescue ex
        # puts "Error sending to observer #{observer_id}: #{ex.message}"
      end
    end
  end

  def send_to_observers(message)
    @observers.each do |observer_id, socket|
      begin
        socket.send(message)
      rescue ex
        # puts "Error sending to observer #{observer_id}: #{ex.message}"
      end
    end
  end

  # Modifiez ces méthodes pour envoyer les mises à jour aux observateurs
  def handle_cell_update(user_id : String, sub_x : Int32, sub_y : Int32, color : String)
    @last_activity[user_id] = Time.utc
    @last_heartbeat[user_id] = Time.utc
    @grid.update_sub_cell(user_id, sub_x, sub_y, color)
    update_message = {
      type: "cell_update",
      user_id: user_id,
      sub_x: sub_x,
      sub_y: sub_y,
      color: color,
      timestamp: Time.utc.to_unix_ms
    }.to_json
    broadcast(update_message)
    # Enregistrer l'événement dans le recorder
    API.recorder.record_event(JSON.parse(update_message))
  end

  def handle_heartbeat(user_id : String)
    @last_heartbeat[user_id] = Time.utc
    @last_activity[user_id] = Time.utc  # 🔧 CRITIQUE: Mettre à jour last_activity pour éviter la déconnexion
    puts "[DEBUG] Heartbeat reçu pour #{user_id[0..7]}..., last_activity mis à jour"
  end

  def handle_disconnect(user_id : String)
    # puts "handle_disconnect: ajout de #{user_id} à pending_disconnects"
    @pending_disconnects[user_id] = Time.utc
    # NE PAS retirer de @users ici (il reste visible)
  end

  def broadcast_new_user(new_user_id : String)
    new_user_message = {
      type: "new_user",
      user_id: new_user_id,
      position: @grid.get_user_position(new_user_id),
    }.to_json
    broadcast(new_user_message)
    send_to_observers(new_user_message)
  end

  def broadcast_user_left(user_id : String)
    begin
      @users.each do |id, socket|
        next if socket.closed?  # Vérifier si le socket est fermé
        socket.send({
          type: "user_left",
          user_id: user_id
        }.to_json)
      end
    rescue ex
      # puts "Erreur lors de la diffusion du départ d'un utilisateur: #{ex.message}"
    end
  end

  def serialize_sub_cell_states(exclude_user_id : String? = nil)
    @grid.sub_cell_states.each_with_object({} of String => Hash(String, String)) do |(user_id, user_sub_cells), hash|
      next if exclude_user_id && user_id == exclude_user_id
      hash[user_id] = user_sub_cells.transform_keys { |key| "#{key[0]},#{key[1]}" }
    end
  end

  def broadcast_zoom_update
    zoom_update_message = {
      type: "zoom_update",
      grid_size: calculate_grid_size,
      grid_state: @grid.to_json,
      sub_cell_states: serialize_sub_cell_states
    }.to_json
    broadcast(zoom_update_message)
    send_to_observers(zoom_update_message)
  end

  def update_user_activity(user_id : String)
    @last_activity[user_id] = Time.utc
  end

  def check_inactivity
    now = Time.utc
    @last_activity.each do |user_id, last_active|
      # Utiliser le timeout spécifique pour les clients LLM
      timeout = @llm_clients.includes?(user_id) ? LLM_INACTIVITY_TIMEOUT : INACTIVITY_TIMEOUT
      if now - last_active > timeout
        remove_user(user_id)
        @last_heartbeat.delete(user_id)
      end
    end
  end

  def check_pending_disconnects
    now = Time.utc
    to_delete = [] of String
    @pending_disconnects.each do |user_id, disconnect_time|
      if now - disconnect_time > RECONNECTION_TIMEOUT
        # puts "check_pending_disconnects: suppression définitive de #{user_id}"
        remove_user(user_id)
        @last_heartbeat.delete(user_id)
        to_delete << user_id
      end
    end
    to_delete.each { |user_id| @pending_disconnects.delete(user_id) }
  end

  private def broadcast_to_recorders(message : String)
    @recorders.each do |recorder|
      begin
        recorder.send(message)
      rescue ex
        # puts "Erreur d'envoi au recorder: #{ex.message}"
        @recorders.delete(recorder)
      end
    end
  end
end

module PoieticGenerator
  @@current_session = Session.new

  def self.current_session
    @@current_session
  end
end

# Au début du fichier, après les requires
class PoieticGeneratorApi
  property sockets : Array(HTTP::WebSocket)
  property observers : Array(HTTP::WebSocket)
  property recorders : Array(HTTP::WebSocket)
  property recorder : PoieticRecorder
  property grid : Grid
  property last_activity : Hash(String, Time)

  def initialize
    @sockets = [] of HTTP::WebSocket
    @observers = [] of HTTP::WebSocket
    @recorders = [] of HTTP::WebSocket
    @recorder = PoieticRecorder.new
    @grid = Grid.new
    @last_activity = Hash(String, Time).new
  end

  def calculate_grid_size
    Math.sqrt(@sockets.size).ceil.to_i
  end

  def broadcast(message : String)
    @sockets.each do |socket|
      begin
        socket.send(message)
      rescue ex
        # puts "Erreur d'envoi: #{ex.message}"
        @sockets.delete(socket)
      end
    end
  end

  private def broadcast_to_recorders(message : String)
    @recorders.each do |recorder|
      begin
        recorder.send(message)
      rescue ex
        # puts "Erreur d'envoi au recorder: #{ex.message}"
        @recorders.delete(recorder)
      end
    end
  end
end

# Créer l'instance de l'API
API = PoieticGeneratorApi.new

# Headers communs pour toutes les routes
before_all do |env|
  env.response.headers.merge!({
    "Cache-Control" => "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma" => "no-cache",
    "Expires" => "0",
    "Last-Modified" => Time.utc.to_rfc2822,
    "ETag" => Random.new.hex(8),
    "Vary" => "*"
  })
end

["", "monitoring", "viewer", "viewer2", "viewer3", "bot", "addbot", "ai-player", "ai-player-v2"].each do |page|
  get "/#{page}" do |env|
    env.response.headers["Content-Type"] = "text/html"
    file = FileStorage.get("#{page.empty? ? "index" : page}.html")
    file.gets_to_end
  end
end

# Route générique pour CSS
get "/css/:file" do |env|
  file = env.params.url["file"].split("?").first
  env.response.headers["Content-Type"] = "text/css"
  file = FileStorage.get("css/#{file}")
  file.gets_to_end
end

# Route générique pour JavaScript
get "/js/:file" do |env|
  file = env.params.url["file"].split("?").first
  env.response.headers["Content-Type"] = "application/javascript"
  file = FileStorage.get("js/#{file}")
  file.gets_to_end
end

# Route pour les bots JavaScript
get "/js/bots/:file" do |env|
  file = env.params.url["file"].split("?").first
  env.response.headers["Content-Type"] = "application/javascript"
  file = FileStorage.get("js/bots/#{file}")
  file.gets_to_end
end

# Route pour les adaptateurs LLM
get "/js/llm-adapters/:file" do |env|
  file = env.params.url["file"].split("?").first
  env.response.headers["Content-Type"] = "application/javascript"
  file = FileStorage.get("js/llm-adapters/#{file}")
  file.gets_to_end
end

# Route spécifique pour le manuel LLM
get "/MANUEL_PRATIQUE_LLM.md" do |env|
  env.response.headers["Content-Type"] = "text/markdown; charset=utf-8"
  begin
    file = FileStorage.get("MANUEL_PRATIQUE_LLM.md")
    file.gets_to_end
  rescue ex
    env.response.status_code = 404
    "File not found: MANUEL_PRATIQUE_LLM.md (#{ex.message})"
  end
end

# Routes pour les manuels spécifiques par modèle
get "/MANUEL_ANTHROPIC.md" do |env|
  env.response.headers["Content-Type"] = "text/markdown; charset=utf-8"
  begin
    file = FileStorage.get("MANUEL_ANTHROPIC.md")
    file.gets_to_end
  rescue ex
    env.response.status_code = 404
    "File not found: MANUEL_ANTHROPIC.md (#{ex.message})"
  end
end

get "/MANUEL_OPENAI.md" do |env|
  env.response.headers["Content-Type"] = "text/markdown; charset=utf-8"
  begin
    file = FileStorage.get("MANUEL_OPENAI.md")
    file.gets_to_end
  rescue ex
    env.response.status_code = 404
    "File not found: MANUEL_OPENAI.md (#{ex.message})"
  end
end

get "/MANUEL_OLLAMA.md" do |env|
  env.response.headers["Content-Type"] = "text/markdown; charset=utf-8"
  begin
    file = FileStorage.get("MANUEL_OLLAMA.md")
    file.gets_to_end
  rescue ex
    env.response.status_code = 404
    "File not found: MANUEL_OLLAMA.md (#{ex.message})"
  end
end

# Redirection des anciennes routes bot vers les nouvelles
get "/bot/css/:file" do |env|
  env.redirect "/css/#{env.params.url["file"]}"
end

get "/bot/js/bots/:file" do |env|
  env.redirect "/js/bots/#{env.params.url["file"]}"
end

# Route pour les images
get "/images/:file" do |env|
  file = env.params.url["file"]
  env.response.headers["Content-Type"] = MIME.from_filename(file)
  file = FileStorage.get("images/#{file}")
  file.gets_to_end
end

ws "/updates" do |socket, context|
  user_id_param = context.request.query_params["user_id"]?
  mode = context.request.query_params["mode"]?
  connection_type = context.request.query_params["type"]?
  is_observer = mode == "full" && connection_type == "observer"
  is_llm_bot = connection_type == "bot"

  # puts "Tentative de connexion WS: user_id_param=#{user_id_param}, mode=#{mode}, type=#{connection_type}, is_observer=#{is_observer}, is_llm_bot=#{is_llm_bot}"
  # puts "État actuel (avant add_user/add_observer): PoieticGenerator.current_session.users.keys: #{PoieticGenerator.current_session.users.keys}, pending_disconnects: #{PoieticGenerator.current_session.pending_disconnects.keys}"

  user_id_for_socket = "" 

  if is_observer
    user_id_for_socket = PoieticGenerator.current_session.add_observer(socket)
    # puts "Observer connecté: #{user_id_for_socket}"
  else
    user_id_for_socket = PoieticGenerator.current_session.add_user(socket, user_id_param)
  end
  
  # Marquer le client comme LLM si c'est un bot
  if is_llm_bot
    PoieticGenerator.current_session.llm_clients.add(user_id_for_socket)
  end
  
  user_id_for_message_handling = user_id_for_socket 

  socket.on_message do |message|
    begin
      parsed_message = JSON.parse(message)
      if parsed_message["type"] == "cell_update" && !is_observer
        PoieticGenerator.current_session.update_user_activity(user_id_for_message_handling)
        PoieticGenerator.current_session.handle_cell_update(
          user_id_for_message_handling,
          parsed_message["sub_x"].as_i,
          parsed_message["sub_y"].as_i,
          parsed_message["color"].as_s
        )
      elsif parsed_message["type"] == "heartbeat"
        PoieticGenerator.current_session.handle_heartbeat(user_id_for_message_handling)
        socket.send({type: "pong"}.to_json)
      end
    rescue ex
      # puts "Error processing message for #{user_id_for_message_handling}: #{ex.message}"
    end
  end

  socket.on_close do
    if is_observer
      PoieticGenerator.current_session.remove_observer(user_id_for_socket)
    else
      # puts "WebSocket fermé pour user_id=#{user_id_for_socket}"
      PoieticGenerator.current_session.handle_disconnect(user_id_for_socket)
    end
  end
end

spawn do
  loop do
    #puts "--- API TÂCHE FOND --- Vérification activité/déconnexions ---"
    sleep 2.seconds # <<< MODIFIEZ CECI (par exemple, revenez à 2 secondes)
    begin
      PoieticGenerator.current_session.check_inactivity
      PoieticGenerator.current_session.check_pending_disconnects
    rescue ex
      # puts "!!! API TÂCHE FOND EXCEPTION: #{ex.message} !!!"
      # puts ex.backtrace 
    end
  end
end
# =============================================================================

ws "/record" do |socket, context|
  # puts "=== Nouvelle connexion WebSocket sur /record ==="

  token = context.ws_route_lookup.params["token"]?
  unless token == "secret_token_123"
    socket.close
    next
  end

  API.sockets << socket
  if API.sockets.size == 1
    # puts "=== Premier utilisateur connecté, démarrage d'une nouvelle session ==="
    API.recorder.start_new_session
  end

  API.recorders << socket
  # puts "=== Recorder authentifié et connecté (total users: #{API.sockets.size}) ==="

  socket.on_close do
    API.sockets.delete(socket)
    API.recorders.delete(socket)

    if API.sockets.empty?
      # puts "=== Dernier utilisateur déconnecté, fin de la session ==="
      API.recorder.end_current_session
    end
    # puts "=== Socket closed (remaining users: #{API.sockets.size}) ==="
  end
end

# Routes du recorder
get "/api/stats" do |env|
  env.response.content_type = "application/json"
  API.recorder.get_stats.to_json
end

get "/api/sessions" do |env|
  env.response.content_type = "application/json"
  API.recorder.get_sessions.to_json
end

get "/api/events/recent" do |env|
  env.response.content_type = "application/json"
  API.recorder.get_recent_events.to_json
end

get "/api/sessions/:id/events" do |env|
  session_id = env.params.url["id"]
  env.response.content_type = "application/json"
  API.recorder.get_session_events(session_id).to_json
end

get "/api/current-session" do |env|
  env.response.content_type = "application/json"
  if current = API.recorder.get_current_session
    current.to_json
  else
    "{}"
  end
end

get "/js/twint_ch.js" do |env|
  env.response.headers["Content-Type"] = "application/javascript"
  ""
end

get "/js/lkk_ch.js" do |env|
  env.response.headers["Content-Type"] = "application/javascript"
  ""
end

# Routes proxy LLM déplacées vers poietic_ai_server.py (port 8003)

# Configuration du port
port = if ARGV.includes?("--port")
  port_index = ARGV.index("--port")
  if port_index && (port_index + 1) < ARGV.size
    ARGV[port_index + 1].to_i
  else
    3001
  end
else
  3001
end

# Configuration de Kemal avec les valeurs par défaut
Kemal.config.port = port
Kemal.config.env = "development"  # Forcer le mode développement pour l'instant
Kemal.config.host_binding = "0.0.0.0"  # Écouter sur toutes les interfaces

# puts "=== Configuration du serveur principal ==="
# puts "  Port: #{port}"
# puts "  Environment: #{Kemal.config.env}"
# puts "  Host: #{Kemal.config.host_binding}"
# puts "  Logging: enabled"

# Activer les logs pour le débogage
logging true

# Garder toutes les routes et configurations existantes
public_folder "public"
Kemal.run