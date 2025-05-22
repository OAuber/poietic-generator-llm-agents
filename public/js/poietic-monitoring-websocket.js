class PoieticMonitoringWebSocket {
    static instance = null;
    
    static getInstance() {
        if (!this.instance) {
            this.instance = new PoieticMonitoringWebSocket();
        }
        return this.instance;
    }

    constructor() {
        if (PoieticMonitoringWebSocket.instance) {
            return PoieticMonitoringWebSocket.instance;
        }
        
        this.socket = new WebSocket('ws://localhost:3001/updates?mode=monitoring');
        this.listeners = new Set();
        
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.notifyListeners(message);
        };
        
        PoieticMonitoringWebSocket.instance = this;
    }

    addListener(callback) {
        this.listeners.add(callback);
    }

    removeListener(callback) {
        this.listeners.delete(callback);
    }

    notifyListeners(message) {
        this.listeners.forEach(callback => callback(message));
    }
} 