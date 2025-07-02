#!/bin/bash
# deploy-n8n-local.sh - Quick local N8N setup for FlowClip development

set -e

echo "🚀 FlowClip N8N Local Deployment Script"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not available"
    exit 1
fi

echo "✅ npm found: $(npm --version)"

# Check if N8N is available (globally or via npx)
if command -v n8n &> /dev/null; then
    echo "✅ N8N already installed: $(n8n --version)"
    N8N_COMMAND="n8n"
else
    echo "📦 N8N will be used via npx (no global installation needed)"
    N8N_COMMAND="npx n8n"
    
    # Test npx n8n availability
    if ! npx n8n --version &> /dev/null; then
        echo "❌ Cannot access N8N via npx. Please check your npm setup."
        exit 1
    fi
    echo "✅ N8N available via npx: $(npx n8n --version)"
fi

# Create N8N data directory
N8N_DATA_DIR="$HOME/.n8n-flowclip"
mkdir -p "$N8N_DATA_DIR"

echo "📁 N8N data directory: $N8N_DATA_DIR"

# Create environment file for N8N
cat > "$N8N_DATA_DIR/.env" << EOF
# N8N Configuration for FlowClip
N8N_BASIC_AUTH_ACTIVE=false
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678/

# Enable community packages
N8N_COMMUNITY_PACKAGES_ENABLED=true

# Timezone
TZ=America/New_York

# Log level
N8N_LOG_LEVEL=info

# Workflow timeout
N8N_WORKFLOW_TIMEOUT=300
EOF

echo "⚙️  N8N configuration created"

# Create FlowClip .env file if it doesn't exist
FLOWCLIP_ENV_FILE=".env"
if [ ! -f "$FLOWCLIP_ENV_FILE" ]; then
    echo "📝 Creating FlowClip .env file..."
    cat > "$FLOWCLIP_ENV_FILE" << EOF
# FlowClip N8N Integration Configuration
N8N_WEBHOOK_ENDPOINT=http://localhost:5678/webhook
N8N_API_KEY=

# Optional: Enable debug logging
DEBUG=flowclip:n8n
EOF
else
    echo "✅ FlowClip .env file already exists"
    # Update existing .env file with N8N configuration
    if ! grep -q "N8N_WEBHOOK_ENDPOINT" "$FLOWCLIP_ENV_FILE"; then
        echo "" >> "$FLOWCLIP_ENV_FILE"
        echo "# FlowClip N8N Integration" >> "$FLOWCLIP_ENV_FILE"
        echo "N8N_WEBHOOK_ENDPOINT=http://localhost:5678/webhook" >> "$FLOWCLIP_ENV_FILE"
        echo "N8N_API_KEY=" >> "$FLOWCLIP_ENV_FILE"
        echo "✅ N8N configuration added to existing .env file"
    fi
fi

# Create startup script
cat > "start-n8n-local.sh" << EOF
#!/bin/bash
# Start N8N for FlowClip development

echo "🚀 Starting N8N for FlowClip..."
export N8N_USER_FOLDER="\$HOME/.n8n-flowclip"

# Load environment variables
if [ -f "\$N8N_USER_FOLDER/.env" ]; then
    export \$(cat "\$N8N_USER_FOLDER/.env" | grep -v '^#' | xargs)
fi

echo "📡 N8N will be available at: http://localhost:5678"
echo "🎯 Webhook base URL: http://localhost:5678/webhook"
echo ""
echo "Press Ctrl+C to stop N8N"
echo ""

# Start N8N
$N8N_COMMAND start
EOF

chmod +x "start-n8n-local.sh"

echo "✅ N8N startup script created: start-n8n-local.sh"

# Create test script
cat > "test-n8n-local.sh" << 'EOF'
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
EOF

chmod +x "test-n8n-local.sh"

echo "✅ N8N test script created: test-n8n-local.sh"

# Create stop script
cat > "stop-n8n-local.sh" << 'EOF'
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
EOF

chmod +x "stop-n8n-local.sh"

echo "✅ N8N stop script created: stop-n8n-local.sh"

echo ""
echo "🎉 N8N Local Deployment Complete!"
echo ""
echo "📋 Quick Start Commands:"
echo "  Start N8N:  ./start-n8n-local.sh"
echo "  Test N8N:   ./test-n8n-local.sh"
echo "  Stop N8N:   ./stop-n8n-local.sh"
echo ""
echo "🌐 Access N8N at: http://localhost:5678"
echo "📚 Import workflows from: n8n-workflow-examples.json"
echo ""
echo "🚀 Ready to start? Run: ./start-n8n-local.sh" 