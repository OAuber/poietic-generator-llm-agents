# Serveur O-machine V4 - Configuration API Key

## Vue d'ensemble

Le serveur O (`poietic_ai_server_v4.py`) utilise une **clé API Gemini distincte** de celles des clients W. Cela permet de :
- Suivre les statistiques d'utilisation côté Gemini (dashboard séparé)
- Isoler les coûts serveur vs clients
- Gérer les quotas indépendamment

## Configuration de la clé API

### Méthode 1 : Variable d'environnement (recommandée)

#### Session temporaire (bash)
```bash
export GEMINI_API_KEY='votre-cle-gemini-ici'
python3 python/poietic_ai_server_v4.py
```

#### Lancement direct avec variable
```bash
GEMINI_API_KEY='votre-cle-gemini-ici' python3 python/poietic_ai_server_v4.py
```

### Méthode 2 : Fichier .env (persistant)

1. Créer un fichier `.env` à la racine du projet :
```bash
echo "GEMINI_API_KEY=votre-cle-gemini-ici" > .env
```

2. Charger avant de lancer le serveur :
```bash
source .env
python3 python/poietic_ai_server_v4.py
```

**Note** : Ajoutez `.env` à `.gitignore` pour éviter de committer la clé.

### Méthode 3 : Service systemd (production)

1. Créer/modifier le service :
```bash
sudo systemctl edit poietic-ai-o.service
```

2. Ajouter dans l'éditeur :
```ini
[Service]
Environment="GEMINI_API_KEY=votre-cle-gemini-ici"
```

3. Recharger et redémarrer :
```bash
sudo systemctl daemon-reload
sudo systemctl restart poietic-ai-o
```

### Méthode 4 : Docker Compose

Dans votre `docker-compose.yml` :
```yaml
services:
  poietic-ai-o:
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    # ... autres configs
```

Puis définir dans un `.env` ou via `docker-compose` :
```bash
GEMINI_API_KEY='votre-cle' docker-compose up
```

## Vérification

### 1. Vérifier que la clé est chargée

Le serveur affichera dans les logs :
- `[O] Analyse avec Gemini (N agents)...` si la clé est présente
- `[O] GEMINI_API_KEY non définie, utilisation du mock` si absente

### 2. Tester manuellement

Une fois le serveur lancé et qu'une image a été envoyée :

```bash
# Déclencher une analyse O manuelle
curl -X POST http://localhost:8004/o/analyze

# Vérifier le résultat
curl http://localhost:8004/o/latest | jq
```

Vous devriez voir :
- `structures` : liste des structures détectées
- `simplicity_assessment.reasoning` : raisonnement détaillé
- `version` : numéro de version incrémenté

## Comportement sans clé API

Si `GEMINI_API_KEY` n'est pas définie :
- Le serveur O utilise un **mock** (comportement par défaut)
- Les snapshots sont générés avec des valeurs fixes
- Aucun appel à Gemini n'est effectué
- Les logs indiquent `[O] GEMINI_API_KEY non définie, utilisation du mock`

## Séparation clés serveur vs clients

| Composant | Source clé | Stockage |
|-----------|------------|----------|
| **Serveur O** | Variable d'env `GEMINI_API_KEY` | Environnement système |
| **Clients W** | localStorage navigateur | `localStorage.getItem('gemini_api_key')` |

Cette séparation permet :
- ✅ Suivi séparé des quotas/coûts
- ✅ Rotation indépendante des clés
- ✅ Sécurité (clé serveur jamais exposée au client)

## Dépannage

### Le serveur n'appelle pas Gemini

1. Vérifier que la variable est définie :
   ```bash
   echo $GEMINI_API_KEY
   ```

2. Vérifier les logs du serveur pour `[O] GEMINI_API_KEY non définie`

3. Redémarrer le serveur après avoir défini la variable

### Erreurs d'appel Gemini

- Vérifier que la clé est valide
- Vérifier les quotas Gemini (rate limits)
- Consulter les logs : `[O] Erreur appel Gemini: ...`

### Image non disponible

Le serveur attend qu'une image soit envoyée par un client W :
- Vérifier que des clients sont connectés
- Vérifier l'onglet Debug → "Images sent to LLM" contient des images
- Le serveur loggera : `[O] Pas d'image disponible, attente...`

## Endpoints utiles

- `GET /o/latest` : Dernier snapshot O
- `GET /o/image` : Dernière image globale (base64)
- `POST /o/analyze` : Déclencher manuellement une analyse O
- `POST /o/image` : Envoyer une image (appelé par clients W)
- `POST /o/agents` : Mettre à jour le nombre d'agents

