## vX.Y.Z (2024-05-22)

### Nouvelles fonctionnalités
- **Reconnexion rapide** : restauration de l'utilisateur et de son dessin après coupure réseau ou reconnexion, même brutale.
- **Mode offline** : possibilité de dessiner hors-ligne, synchronisation automatique des actions à la reconnexion.
- **Robustesse accrue** : gestion correcte des overlays NETWORK ISSUE et CONNECTED, plus de "session déjà active" intempestif.

### Corrections
- Correction de la gestion du verrou de session dans le localStorage.
- Correction de la logique serveur pour la reconnexion rapide (fermeture de l'ancienne WebSocket si besoin).
- Nettoyage du code, suppression des logs de debug.

### Notes de migration
- Aucun changement de protocole, rétrocompatibilité assurée.

Résumé des améliorations apportées à l'application Poietic Generator
1. Déconnexion automatique et reconnexion
Problèmes résolus :
Implémentation d'une déconnexion automatique après 3 minutes d'inactivité.
Ajout d'un overlay gris lors de la déconnexion.
Création d'un bouton RECONNECT fonctionnel.
Solutions mises en place :
Ajout d'un timer d'inactivité dans le client.
Création d'un overlay gris translucide couvrant l'interface lors de la déconnexion.
Implémentation d'une fonction de reconnexion complète, réinitialisant l'état du client.
2. Gestion de l'interface utilisateur
Problèmes résolus :
Positionnement réactif de la jauge d'activité et du bouton RECONNECT.
Visibilité du bouton RECONNECT au-dessus de l'overlay.
Solutions mises en place :
Ajout d'une fonction updateReconnectButtonPosition() pour ajuster la position en fonction de l'orientation de l'écran.
Modification du z-index pour assurer la visibilité du bouton RECONNECT.
3. Gestion de la jauge d'activité
Problèmes résolus :
Réinitialisation intempestive de la jauge lors de la connexion/déconnexion d'autres utilisateurs.
Mise à jour incorrecte de l'activité pour les actions non-locales.
Solution mise en place :
Implémentation d'un flag isLocalUpdate pour distinguer les actions locales des mises à jour serveur.
Modification de la logique de mise à jour de l'activité pour ne prendre en compte que les actions locales.
4. Améliorations générales
Optimisation du code pour une meilleure gestion des connexions/déconnexions.
Amélioration de la réactivité de l'interface utilisateur.
Renforcement de la cohérence entre l'état local et les mises à jour serveur.
Prochaines étapes potentielles
1. Implémenter un système plus sophistiqué de gestion des connexions instables.
Optimiser davantage les performances du client, notamment pour les mises à jour fréquentes.
Améliorer la gestion des erreurs et ajouter des notifications utilisateur plus détaillées.
