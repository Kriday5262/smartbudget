#!/bin/bash
# SmartBudget production app (Docker, port 9119).
# Data lives in ./data (mounted into the container as /data).
# Encryption key lives OUTSIDE the data dir: ./../smartbudget-backups/encryption.key
cd /home/kriday/smartbudget
export DB_PATH=/home/kriday/smartbudget/data/budget.db

# Real AES-256 key for at-rest encryption (falls back to the weak hostname
# derivation only when unset — deploy with the key file present).
ENC_KEY_FILE=/home/kriday/smartbudget-backups/encryption.key
ENC_KEY_ARGS=()
if [ -f "$ENC_KEY_FILE" ]; then
  ENC_KEY_ARGS=(-e "SMARTBUDGET_ENC_KEY=$(cat "$ENC_KEY_FILE")")
fi

case "$1" in
  stop)
    docker stop smartbudget
    ;;
  restart)
    docker restart smartbudget
    ;;
  logs)
    docker logs -f smartbudget
    ;;
  rebuild)
    NITRO_PRESET=node-server node_modules/.bin/vite build && docker build -t smartbudget . && docker rm -f smartbudget 2>/dev/null; docker run -d --name smartbudget --restart unless-stopped -p 9119:9119 -e DB_PATH=/data/budget.db -e DATA_DIR=/data "${ENC_KEY_ARGS[@]}" -v "$(pwd)/data:/data" smartbudget
    ;;
  *)
    exec docker run -d --name smartbudget --restart unless-stopped -p 9119:9119 -e DB_PATH=/data/budget.db -e DATA_DIR=/data "${ENC_KEY_ARGS[@]}" -v "$(pwd)/data:/data" smartbudget
    ;;
esac
