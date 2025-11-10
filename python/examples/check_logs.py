#!/usr/bin/env python3
"""
Script pour vérifier les logs du bot
"""

import os
import time

def check_logs():
    log_file = '/tmp/bot_debug.log'
    
    print("🔍 Vérification des logs du bot...")
    
    if os.path.exists(log_file):
        print(f"✅ Fichier de log trouvé: {log_file}")
        
        with open(log_file, 'r') as f:
            lines = f.readlines()
            
        print(f"📊 Nombre de lignes: {len(lines)}")
        
        if lines:
            print("\n📝 Dernières lignes:")
            for line in lines[-10:]:  # 10 dernières lignes
                print(f"  {line.strip()}")
        else:
            print("⚠️ Fichier vide")
    else:
        print(f"❌ Fichier de log non trouvé: {log_file}")

if __name__ == "__main__":
    check_logs()
