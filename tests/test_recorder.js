const WebSocket = require('ws');

// Configuration
const config = {
    url: 'ws://localhost:3001/record',
    token: 'secret_token_123'
};

// Création du client WebSocket
const ws = new WebSocket(`${config.url}?token=${config.token}`);

// Gestion des événements
ws.on('open', () => {
    console.log('=== Recorder connecté au serveur ===');
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data);
        console.log('\nMessage reçu:', JSON.stringify(message, null, 2));
    } catch (e) {
        console.log('\nMessage reçu (non-JSON):', data.toString());
    }
});

ws.on('error', (error) => {
    console.error('Erreur WebSocket:', error);
});

ws.on('close', (code, reason) => {
    console.log(`\nDéconnecté du serveur (code: ${code})`, reason ? `Raison: ${reason}` : '');
});

// Gestion de la fermeture propre
process.on('SIGINT', () => {
    console.log('\nFermeture du recorder...');
    ws.close();
    process.exit(0);
}); 