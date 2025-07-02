#!/bin/bash
# Test FlowClip integration

echo "🧪 Testing FlowClip N8N Integration..."

# Check if N8N is running
if ! curl -s http://localhost:5678/healthz > /dev/null; then
    echo "❌ N8N is not running. Start it with: ./start.sh"
    exit 1
fi

echo "✅ N8N is running"

# Test webhook endpoints
echo "🔗 Testing webhook endpoints..."

webhooks=(
    "flowclip-hotel-research"
    "flowclip-product-research"
    "flowclip-academic-research"
    "flowclip-restaurant-research"
    "flowclip-travel-research"
    "flowclip-general-research"
)

for webhook in "${webhooks[@]}"; do
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        "http://localhost:5678/webhook/$webhook" \
        -H "Content-Type: application/json" \
        -d '{"test": "data", "sessionType": "'${webhook#flowclip-}'"}')
    
    if [ "$response" = "404" ]; then
        echo "⚠️  $webhook: Workflow not imported yet"
    elif [ "$response" = "200" ]; then
        echo "✅ $webhook: Working"
    else
        echo "❓ $webhook: HTTP $response"
    fi
done

echo ""
echo "🎯 Next steps if workflows not imported:"
echo "  1. Open http://localhost:5678 in browser"
echo "  2. Login with admin credentials (see start.sh output)"
echo "  3. Import workflows from ../n8n-workflow-examples.json"
echo "  4. Configure external API keys"
echo "  5. Run: cd .. && node test-n8n-integration.js"
