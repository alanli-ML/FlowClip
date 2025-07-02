#!/bin/bash
# Start N8N for FlowClip development

echo "🚀 Starting N8N for FlowClip..."
export N8N_USER_FOLDER="$HOME/.n8n-flowclip"

# Load environment variables
if [ -f "$N8N_USER_FOLDER/.env" ]; then
    export $(cat "$N8N_USER_FOLDER/.env" | grep -v '^#' | xargs)
fi

echo "📡 N8N will be available at: http://localhost:5678"
echo "🎯 Webhook base URL: http://localhost:5678/webhook"
echo ""
echo "Press Ctrl+C to stop N8N"
echo ""

# Start N8N
npx n8n start
