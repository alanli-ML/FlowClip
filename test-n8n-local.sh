#!/bin/bash
# Test N8N local deployment

echo "🧪 Testing N8N local deployment..."

# Check if N8N is running
if curl -s http://localhost:5678/healthz > /dev/null; then
    echo "✅ N8N is running"
    
    # Test webhook endpoint
    echo "🔗 Testing webhook endpoints..."
    
    # Test hotel research webhook
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        http://localhost:5678/webhook/flowclip-hotel-research \
        -H "Content-Type: application/json" \
        -d '{"test": "data", "sessionType": "hotel_research"}')
    
    if [ "$response" = "404" ]; then
        echo "⚠️  Webhook endpoint not found (expected - workflows not imported yet)"
        echo "   Import workflows from n8n-workflow-examples.json to enable webhooks"
    elif [ "$response" = "200" ]; then
        echo "✅ Webhook endpoint responding"
    else
        echo "❓ Webhook response code: $response"
    fi
    
    echo ""
    echo "🎯 Next steps:"
    echo "  1. Open http://localhost:5678 in your browser"
    echo "  2. Import workflows from n8n-workflow-examples.json"
    echo "  3. Configure API keys for external services"
    echo "  4. Run 'node test-n8n-integration.js' to test FlowClip integration"
    
else
    echo "❌ N8N is not running"
    echo "   Start N8N with: ./start-n8n-local.sh"
fi
