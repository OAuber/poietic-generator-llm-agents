require "kemal"
require "uuid"
require "json"
require "../poietic-recorder"
require "../file_storage"

class Grid
  property user_positions : Hash(String, Tuple(Int32, Int32))
  property sub_cell_states : Hash(String, Hash(Tuple(Int32, Int32), String))
  property initial_colors : Hash(String, Array(String))

  def initialize
    @user_positions = Hash(String, Tuple(Int32, Int32)).new
    @sub_cell_states = Hash(String, Hash(Tuple(Int32, Int32), String)).new
    @initial_colors = Hash(String, Array(String)).new
  end

  def set_user_position(user_id : String, position : Tuple(Int32, Int32))
    @user_positions[user_id] = position
    @initial_colors[user_id] = generate_initial_colors(user_id) unless @initial_colors.has_key?(user_id)
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
    end
  end

  def remove_user(user_id : String)
    @user_positions.delete(user_id)
    @sub_cell_states.delete(user_id)
    @initial_colors.delete(user_id)
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

  private def generate_initial_colors(user_id : String)
    # Créer un générateur de nombres pseudo-aléatoires avec l'UUID comme seed
    seed = user_id.bytes.reduce(0) { |acc, b| (acc << 8) + b }
    rng = Random.new(seed)

    # Générer une couleur de base pour cet utilisateur
    base_h = rng.rand # Teinte de base (0.0 - 1.0)
    base_s = 0.6 + (rng.rand * 0.4) # Saturation (0.6 - 1.0)
    base_l = 0.4 + (rng.rand * 0.2) # Luminosité (0.4 - 0.6)

    # Générer 400 variations autour de cette couleur
    Array.new(400) do |i|
      # Faire varier la teinte autour de la teinte de base
      h = (base_h + (rng.rand * 0.2) - 0.1) % 1.0
      # Faire varier la saturation
      s = (base_s + (rng.rand * 0.2) - 0.1).clamp(0.0, 1.0)
      # Faire varier la luminosité
      l = (base_l + (rng.rand * 0.2) - 0.1).clamp(0.0, 1.0)

      # Convertir HSL en RGB puis en hex
      hsl_to_hex(h, s, l)
    end
  end

  private def hue_to_rgb(p : Float64, q : Float64, t : Float64) : Float64
    t += 1.0 if t < 0
    t -= 1.0 if t > 1
    return p + (q - p) * 6 * t if t < 1.0/6
    return q if t < 1.0/2
    return p + (q - p) * (2.0/3 - t) * 6 if t < 2.0/3
    return p
  end

  private def hsl_to_hex(h : Float64, s : Float64, l : Float64) : String
    q = l < 0.5 ? l * (1 + s) : l + s - l * s
    p = 2 * l - q

    r = (hue_to_rgb(p, q, h + 1.0/3) * 255).round.to_i
    g = (hue_to_rgb(p, q, h) * 255).round.to_i
    b = (hue_to_rgb(p, q, h - 1.0/3) * 255).round.to_i

    "#%02x%02x%02x" % [r, g, b]
  end
end

class Session
  INACTIVITY_TIMEOUT = 180.seconds
  RECONNECTION_TIMEOUT = 180.seconds

  property users : Hash(String, HTTP::WebSocket)
  property observers : Hash(String, HTTP::WebSocket)
  property grid : Grid
  property user_colors : Hash(String, String)
  property last_activity : Hash(String, Time)
  property last_heartbeat : Hash(String, Time)
  property recorders : Array(HTTP::WebSocket)
  property pending_disconnects : Hash(String, Time)

  def initialize
    @users = Hash(String, HTTP::WebSocket).new
    @observers = Hash(String, HTTP::WebSocket).new
    @grid = Grid.new
    @user_colors = Hash(String, String).new
    @last_activity = Hash(String, Time).new
    @last_heartbeat = Hash(String, Time).new
    @recorders = [] of HTTP::WebSocket
    @pending_disconnects = Hash(String, Time).new
  end

  def add_user(socket : HTTP::WebSocket, forced_id : String? = nil) : String
    # Gestion reconnexion rapide : si un client tente de se reconnecter avec un user_id déjà utilisé,
    # on ferme l'ancienne socket, on place le user_id dans pending_disconnects, puis on accepte la reconnexion.
    user_id = forced_id

    # 1. Si reconnexion dans le délai de grâce
    if user_id && @pending_disconnects.has_key?(user_id)
      @pending_disconnects.delete(user_id)
      @users[user_id] = socket
      @last_heartbeat[user_id] = Time.utc
      send_initial_state(user_id)
      broadcast_new_user(user_id)
      broadcast_zoom_update
      puts "Connexion avec user_id=#{user_id} (pending=#{@pending_disconnects.has_key?(user_id)})"
      return user_id
    end

    # 1bis. Si user_id déjà utilisé (connexion concurrente ou reconnexion rapide avant fermeture de l'ancienne socket)
    if user_id && @users.has_key?(user_id)
      # Fermer l'ancienne socket si elle existe encore
      old_socket = @users[user_id]
      begin
        old_socket.close
      rescue ex
        # ignore
      end
      # Placer immédiatement dans pending_disconnects
      @pending_disconnects[user_id] = Time.utc
      @users.delete(user_id)
      @last_activity.delete(user_id)
      @last_heartbeat.delete(user_id)
      # On continue comme si c'était une reconnexion dans le délai de grâce
      @pending_disconnects.delete(user_id)
      @users[user_id] = socket
      @last_heartbeat[user_id] = Time.utc
      send_initial_state(user_id)
      broadcast_new_user(user_id)
      broadcast_zoom_update
      puts "Connexion avec user_id=#{user_id} (pending=force_reconnect)"
      return user_id
    end

    # 2. Nouvelle connexion (ou user_id obsolète)
    user_id = UUID.random.to_s

    @users[user_id] = socket
    @last_activity[user_id] = Time.utc
    @last_heartbeat[user_id] = Time.utc
    position = @grid.find_next_available_position
    @grid.set_user_position(user_id, position)
    # Nettoyer toute sous-cellule personnalisée pour ce nouvel utilisateur
    @grid.sub_cell_states[user_id] = Hash(Tuple(Int32, Int32), String).new
    send_initial_state(user_id)
    broadcast_new_user(user_id)
    broadcast_zoom_update
    puts "Connexion avec user_id=#{user_id} (pending=#{@pending_disconnects.has_key?(user_id)})"
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
    }
    # puts "=== État initial: #{state.inspect} ==="
    broadcast(state.to_json)
  end

  def remove_user(user_id : String)
    if position = @grid.get_user_position(user_id)
      API.recorder.record_user_left(user_id)
      broadcast_user_left(user_id, position)
      @grid.remove_user(user_id)
      @users.delete(user_id)
      @last_activity.delete(user_id)
      @last_heartbeat.delete(user_id)
      @pending_disconnects.delete(user_id)
      broadcast_zoom_update
      if @users.empty?
        API.recorder.end_current_session
      end
    end
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
  end

  def handle_disconnect(user_id : String)
    puts "handle_disconnect: ajout de #{user_id} à pending_disconnects"
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
      if now - last_active > INACTIVITY_TIMEOUT
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
        puts "check_pending_disconnects: suppression définitive de #{user_id}"
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

["", "monitoring", "viewer", "bot", "addbot"].each do |page|
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

  puts "Tentative de connexion avec user_id=#{user_id_param} (pending_disconnects=#{PoieticGenerator.current_session.pending_disconnects.keys})"

  # On crée le user_id ici
  user_id = if is_observer
    PoieticGenerator.current_session.add_observer(socket)
  else
    if PoieticGenerator.current_session.users.empty?
      API.recorder.start_new_session
    end
    puts "Tentative de reconnexion avec user_id=#{user_id_param} (pending_disconnects=#{PoieticGenerator.current_session.pending_disconnects})"
    PoieticGenerator.current_session.add_user(socket, user_id_param)
  end

  socket.on_message do |message|
    begin
      parsed_message = JSON.parse(message)
      if parsed_message["type"] == "cell_update" && !is_observer
        PoieticGenerator.current_session.update_user_activity(user_id)
        PoieticGenerator.current_session.handle_cell_update(
          user_id,
          parsed_message["sub_x"].as_i,
          parsed_message["sub_y"].as_i,
          parsed_message["color"].as_s
        )
      elsif parsed_message["type"] == "heartbeat"
        PoieticGenerator.current_session.handle_heartbeat(user_id)
        # PATCH: répondre au heartbeat pour garder la connexion vivante
        socket.send({type: "pong"}.to_json)
      end
    rescue ex
      # puts "Error processing message: #{ex.message}"
    end
  end

  socket.on_close do
    if is_observer
      PoieticGenerator.current_session.remove_observer(user_id)
    else
      puts "WebSocket fermé pour user_id=#{user_id}"
      PoieticGenerator.current_session.handle_disconnect(user_id)
    end
  end
end

# Ajoutez cette tâche périodique pour vérifier l'inactivité
spawn do
  loop do
    sleep 2.seconds
    PoieticGenerator.current_session.check_inactivity
    PoieticGenerator.current_session.check_pending_disconnects
  end
end

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