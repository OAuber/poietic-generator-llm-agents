#!/bin/bash
# Script de nettoyage pour sessions locales V4
# Nettoie les logs et optimise la base de données

echo "🧹 Nettoyage des fichiers locaux..."

# 1. Rotation du log api.log (garder les 10 dernières MB)
if [ -f api.log ]; then
    SIZE=$(stat -f%z api.log 2>/dev/null || stat -c%s api.log 2>/dev/null)
    if [ "$SIZE" -gt 10485760 ]; then  # > 10MB
        echo "📝 Rotation de api.log (taille: $(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes"))"
        tail -n 50000 api.log > api.log.tmp && mv api.log.tmp api.log
        echo "✅ api.log réduit aux 50000 dernières lignes"
    else
        echo "✅ api.log OK ($(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes"))"
    fi
fi

# 2. Optimisation de la base de données recorder.db
if [ -f db/recorder.db ]; then
    SIZE=$(stat -f%z db/recorder.db 2>/dev/null || stat -c%s db/recorder.db 2>/dev/null)
    echo "💾 Base de données: $(numfmt --to=iec-i --suffix=B $SIZE 2>/dev/null || echo "${SIZE} bytes")"
    
    if command -v sqlite3 &> /dev/null; then
        echo "🔧 Optimisation de recorder.db..."
        sqlite3 db/recorder.db "VACUUM;" 2>/dev/null
        sqlite3 db/recorder.db "PRAGMA optimize;" 2>/dev/null
        NEW_SIZE=$(stat -f%z db/recorder.db 2>/dev/null || stat -c%s db/recorder.db 2>/dev/null)
        echo "✅ Base optimisée: $(numfmt --to=iec-i --suffix=B $NEW_SIZE 2>/dev/null || echo "${NEW_SIZE} bytes")"
    else
        echo "⚠️  sqlite3 non disponible, optimisation ignorée"
    fi
fi

# 3. Nettoyage des fichiers WAL/SHM de SQLite (si le serveur n'est pas actif)
if [ ! -f db/recorder.db-wal ] || [ ! -s db/recorder.db-wal ]; then
    echo "✅ Pas de fichiers WAL à nettoyer"
else
    WAL_SIZE=$(stat -f%z db/recorder.db-wal 2>/dev/null || stat -c%s db/recorder.db-wal 2>/dev/null)
    echo "⚠️  db/recorder.db-wal existe ($(numfmt --to=iec-i --suffix=B $WAL_SIZE 2>/dev/null || echo "${WAL_SIZE} bytes"))"
    echo "   (Les fichiers WAL sont automatiquement nettoyés quand le serveur s'arrête)"
fi

echo ""
echo "✅ Nettoyage terminé"
echo ""
echo "💡 Pour nettoyer manuellement:"
echo "   - Logs: tail -n 50000 api.log > api.log.new && mv api.log.new api.log"
echo "   - Base: sqlite3 db/recorder.db 'VACUUM;'"
echo "   - WAL: arrêter le serveur, puis supprimer db/recorder.db-wal et db/recorder.db-shm"

