#!/bin/bash

# Configuration
SERVER="debian@51.210.251.21"
SSH_KEY="$HOME/.ssh/olivier_poiesis_rsa"
DEPLOY_DIR="~/deploy"
BIN_DIR="/usr/local/bin"

# Couleurs pour les messages
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Vérification des prérequis
if [ ! -f "$SSH_KEY" ]; then
    error "Clé SSH non trouvée : $SSH_KEY"
fi

# 1. Création des binaires
log "Création des binaires de production..."
./scripts/build.sh || error "Échec de la création des binaires"

# 2. Copie des binaires sur le serveur
log "Copie des binaires sur le serveur..."
scp -i "$SSH_KEY" bin/poietic-generator-api bin/poietic-recorder "$SERVER:$DEPLOY_DIR/" || error "Échec de la copie des fichiers"

# # 2b. Copie des fichiers statiques (public, favicon, etc.)
# log "Copie des fichiers statiques sur le serveur..."
# scp -i "$SSH_KEY" -r public "$SERVER:/home/debian/poietic-data/"

# 3. Déploiement sur le serveur
log "Déploiement sur le serveur..."
ssh -i "$SSH_KEY" "$SERVER" << 'ENDSSH'
    # Dossier de travail pour les données et la base
    sudo mkdir -p /home/debian/poietic-data/db
    sudo chown debian:debian /home/debian/poietic-data /home/debian/poietic-data/db

    # Arrêt des services AVANT toute manipulation
    sudo systemctl stop poietic-generator.service
    sudo systemctl stop poietic-recorder.service

    # Création de la base si besoin
    if [ ! -f "/home/debian/poietic-data/db/recorder.db" ]; then
        sudo -u debian sqlite3 "/home/debian/poietic-data/db/recorder.db" ".databases"
    fi

    # Sauvegarde des versions actuelles
    sudo cp /usr/local/bin/poietic-generator-api /usr/local/bin/poietic-generator-api.backup
    sudo cp /usr/local/bin/poietic-recorder /usr/local/bin/poietic-recorder.backup

    # Installation des nouveaux binaires
    sudo mv ~/deploy/poietic-* /usr/local/bin/
    sudo chown root:root /usr/local/bin/poietic-*
    sudo chmod 755 /usr/local/bin/poietic-*

    # Vérification des ports
    if sudo netstat -tulpn | grep -q "300[12]"; then
        echo "Attention : des processus utilisent encore les ports 3001 et 3002"
    fi

    # Redémarrage du service principal
    sudo systemctl start poietic-generator.service

    # # Attendre 100 secondes pour laisser le temps à la base de se stabiliser
    #sleep 100

    # Redémarrage du recorder
    sudo systemctl start poietic-recorder.service

    # Vérification du statut
    sudo systemctl status poietic-generator.service poietic-recorder.service
ENDSSH

if [ $? -eq 0 ]; then
    log "Déploiement terminé avec succès"
else
    error "Erreur lors du déploiement"
fi