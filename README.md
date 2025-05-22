# poietic-generator-api

Poietic Generator API est une application permettant de générer, manipuler et exposer des espaces poïétiques via une API. Elle s’appuie sur Crystal et propose des fonctionnalités de gestion d’images, de stockage, et d’interfaçage avec des bases de données.

## Installation

1. Installez [Crystal](https://crystal-lang.org/install/).
2. Clonez ce dépôt :
   ```sh
   git clone https://github.com/your-github-user/poietic-generator-api.git
   cd poietic-generator-api
   ```
3. Installez les dépendances :
   ```sh
   shards install
   ```
4. Compilez le projet :
   ```sh
   shards build
   ```
5. (Optionnel) Configurez les variables d’environnement dans le dossier `config/` ou `etc/`.

## Usage

Pour lancer l’API :
```sh
bin/poietic-generator-api
```

Pour utiliser la CLI :
```sh
crystal src/cli/mon_script.cr
```

Consultez la documentation dans `docs/` pour plus d’exemples d’utilisation.

## Développement

Pour lancer les tests :
```sh
crystal spec
```

Pour exécuter les tests d’intégration :
```sh
crystal spec tests/
```

Les contributions sont les bienvenues ! Veuillez suivre les instructions de la section suivante.

## Contributing

1. Fork it (<https://github.com/your-github-user/poietic-generator-api/fork>)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

## Documentation

La documentation détaillée est disponible dans le dossier `docs/`. Consultez notamment :
- `docs/010-usage/` pour l’utilisation
- `docs/020-contributing/` pour contribuer
- `docs/030-protocols/` pour les protocoles d’API

## Contributors

- [your-name-here](https://github.com/your-github-user) - creator and maintainer

## Gestion de la reconnexion rapide et du mode offline

- **Reconnexion rapide** : Si un client perd la connexion réseau, il peut se reconnecter avec le même identifiant utilisateur (`user_id`) dans un délai de 3 minutes (par défaut). Son état (cellule, dessin) est restauré.
- **Mode offline** : Si le client perd la connexion, il peut continuer à dessiner localement. À la reconnexion, toutes les actions réalisées hors-ligne sont automatiquement synchronisées avec le serveur.
- **Robustesse** : Le serveur gère les reconnexions même si l’ancienne WebSocket n’est pas encore fermée (coupure brutale, mode avion, etc.).

Pour plus de détails, voir la documentation technique dans `docs/030-protocols/`.
