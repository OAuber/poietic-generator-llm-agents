#!/bin/bash

echo "Nettoyage des processus précédents (si existent)..."
pkill -f poietic-recorder
pkill -f recorder-server
pkill -f poietic-generator-api
sleep 1 # Laisser le temps aux processus de se terminer

echo "Préparation de la base de données..."
mkdir -p db
rm -f db/recorder.db db/recorder.db-wal db/recorder.db-shm # Supprime les fichiers de DB
sqlite3 db/recorder.db ".databases" # Crée une DB vide

# Créer des fichiers de log vides (ou les vider s'ils existent)
echo "Création/Vidage des fichiers de log..." # Log de débogage
touch recorder.log api.log # Méthode plus robuste pour créer/mettre à jour le timestamp
> recorder.log             # Vider le contenu
> api.log                  # Vider le contenu
ls -l recorder.log api.log # Vérifier qu'ils existent après création/vidage

echo "Démarrage des serveurs (logs dans recorder.log et api.log)..."

# Lancer le serveur d'enregistrement, rediriger stdout et stderr vers recorder.log
./bin/poietic-recorder --port=3002 >> recorder.log 2>&1 & # Utiliser >> pour ajouter, et 2>&1
PID_RECORDER=$!
echo "Recorder (PID: $PID_RECORDER) démarré sur le port 3002"

# Attendre un peu que le recorder démarre
sleep 3

# Lancer le serveur principal, rediriger stdout et stderr vers api.log
./bin/poietic-generator-api --port=3001 >> api.log 2>&1 & # Utiliser >> pour ajouter, et 2>&1
PID_MAIN=$!
echo "Serveur principal (PID: $PID_MAIN) démarré sur le port 3001"

# Fonction pour arrêter proprement les processus
cleanup() {
    echo "Arrêt des serveurs..."
    # Utiliser kill sur les PIDs stockés
    if [ -n "$PID_MAIN" ]; then kill $PID_MAIN 2>/dev/null; fi
    if [ -n "$PID_RECORDER" ]; then kill $PID_RECORDER 2>/dev/null; fi
    # Donner un peu de temps puis forcer si nécessaire
    sleep 1
    if ps -p $PID_MAIN > /dev/null; then kill -9 $PID_MAIN 2>/dev/null; fi
    if ps -p $PID_RECORDER > /dev/null; then kill -9 $PID_RECORDER 2>/dev/null; fi
    echo "Serveurs arrêtés."
    exit 0
}

# Capturer Ctrl+C et d'autres signaux de terminaison
trap cleanup INT TERM EXIT

echo "Les serveurs tournent. Appuyez sur Ctrl+C pour arrêter."

# Attendre la fin des deux processus (ou jusqu'à ce que cleanup soit appelé)
# 'wait' sans argument attendra tous les jobs en arrière-plan du shell courant
wait
