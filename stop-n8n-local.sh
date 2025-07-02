#!/bin/bash
# Stop N8N local instance

echo "🛑 Stopping N8N..."

# Find and kill N8N processes (both global and npx)
N8N_PIDS=$(pgrep -f "n8n.*start" || true)

if [ -n "$N8N_PIDS" ]; then
    echo "🔪 Killing N8N processes: $N8N_PIDS"
    kill $N8N_PIDS
    sleep 2
    
    # Force kill if still running
    N8N_PIDS=$(pgrep -f "n8n.*start" || true)
    if [ -n "$N8N_PIDS" ]; then
        echo "🔨 Force killing N8N processes"
        kill -9 $N8N_PIDS
    fi
    
    echo "✅ N8N stopped"
else
    echo "ℹ️  N8N is not running"
fi
