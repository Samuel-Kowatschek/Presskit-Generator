#!/bin/bash
# Startet den Pressekit Generator lokal unter http://localhost:8765
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:$PATH"
( sleep 1; open -a "Google Chrome" "http://localhost:8765" 2>/dev/null || open "http://localhost:8765" ) &
python3 server.py
