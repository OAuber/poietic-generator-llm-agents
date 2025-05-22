# poietic-generator-api

Poietic Generator V.5 s'appuie sur Crystal et Javascript.

## Objectifs

Poietic Generator est une application collaborative de dessin en temps réel historiue dont la première version date de 1986.  
Elle vise à :
- Permettre à plusieurs utilisateurs de dessiner simultanément sur une grille partagée, chaque participant disposant de sa propre "cellule".
- Offrir une expérience fluide, même en cas de coupure réseau ou de reconnexion, grâce à une gestion avancée de la persistance et de la synchronisation.
- Favoriser la créativité collective, l'expérimentation et l'observation de dynamiques émergentes.

## Fonctionnalités principales

- **Dessin collaboratif en temps réel** : chaque utilisateur contrôle une cellule de 20x20 pixels sur la grille et peut dessiner en direct.
- **Gestion robuste des connexions** :
  - Reconnexion rapide après coupure réseau (l'utilisateur retrouve sa cellule et son dessin).
  - Mode offline : possibilité de continuer à dessiner hors-ligne, synchronisation automatique à la reconnexion.
  - Détection et gestion des sessions multiples dans le même navigateur.
- **Interface utilisateur réactive** :
  - Overlays d'état (connexion, déconnexion, problème réseau…)
  - Jauge d'activité et gestion de l'inactivité (déconnexion automatique après 3 minutes sans action).
  - Bouton de reconnexion, affichage du nombre d'utilisateurs, etc.
- **Persistance de l'état** : chaque utilisateur conserve son identifiant et son dessin, même après un rechargement ou une reconnexion.
- **Extensible** : architecture modulaire (API Crystal, client JS), facile à adapter ou enrichir.

## Installation

1. Installez [Crystal](https://crystal-lang.org/install/).
2. Clonez ce dépôt :
   ```sh
   git clone https://github.com/OAuber/poietic-generator2-documentation.git
   cd poietic-generator2-documentation
   ```
3. Installez les dépendances :
   ```sh
   shards install
   ```
4. Compilez le projet :
   ```sh
   shards build
   ```
5. (Optionnel) Configurez les variables d'environnement dans le dossier `config/` ou `etc/`.

## Usage

Pour lancer l'API :
```sh
bin/poietic-generator-api
```

Pour utiliser la CLI :
```sh
crystal src/cli/mon_script.cr
```

Consultez la documentation dans le dossier `docs/` pour plus d'exemples d'utilisation.

## Développement

Pour lancer les tests :
```sh
crystal spec
```

Pour exécuter les tests d'intégration :
```sh
crystal spec tests/
```

Les contributions sont les bienvenues ! Veuillez suivre les instructions de la section suivante.

## Contributing

1. Fork it (<https://github.com/OAuber/poietic-generator2-documentation/fork>)
2. Créez votre branche de fonctionnalité (`git checkout -b ma-nouvelle-fonctionnalite`)
3. Commitez vos modifications (`git commit -am 'Ajout d'une fonctionnalité'`)
4. Poussez sur la branche (`git push origin ma-nouvelle-fonctionnalite`)
5. Créez une nouvelle Pull Request

## Documentation

La documentation détaillée est disponible dans le dossier `docs/`. Consultez notamment :
- `docs/010-usage/` pour l'utilisation
- `docs/020-contributing/` pour contribuer
- `docs/030-protocols/` pour les protocoles d'API

La documentation en ligne est également accessible ici :
https://poietic-generator.github.io/poietic-generator-documentation/

## Gestion de la reconnexion rapide et du mode offline

- **Reconnexion rapide** : Si un client perd la connexion réseau, il peut se reconnecter avec le même identifiant utilisateur (`user_id`) dans un délai de 3 minutes (par défaut). Son état (cellule, dessin) est restauré.
- **Mode offline** : Si le client perd la connexion, il peut continuer à dessiner localement. À la reconnexion, toutes les actions réalisées hors-ligne sont automatiquement synchronisées avec le serveur.
- **Robustesse** : Le serveur gère les reconnexions même si l'ancienne WebSocket n'est pas encore fermée (coupure brutale, mode avion, etc.).

Pour plus de détails, voir la documentation technique dans `docs/030-protocols/`.

## Contributors

- [Olivier Auber](https://github.com/OAuber) - creator and maintainer
- [Glenn Rolland](https://github.com/glenux) - Expert