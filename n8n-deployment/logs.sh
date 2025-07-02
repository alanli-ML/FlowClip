#!/bin/bash
# View N8N logs

if [ "$1" = "-f" ]; then
    echo "📜 Following N8N logs (Ctrl+C to stop)..."
    docker-compose logs -f n8n
else
    echo "📜 N8N logs (last 100 lines):"
    docker-compose logs --tail=100 n8n
fi
