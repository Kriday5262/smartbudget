#!/bin/bash
# SmartBudget production app (Docker, port 9119).
# Data lives in ./data (mounted into the container as /data).
cd /home/kriday/smartbudget
export DB_PATH=/home/kriday/smartbudget/data/budget.db

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
    NITRO_PRESET=node-server node_modules/.bin/vite build && docker build -t smartbudget . && docker rm -f smartbudget 2>/dev/null; docker run -d --name smartbudget --restart unless-stopped -p 9119:9119 -v "$(pwd)/data:/data" smartbudget
    ;;
  *)
    exec docker run -d --name smartbudget --restart unless-stopped -p 9119:9119 -v "$(pwd)/data:/data" smartbudget
    ;;
esac
