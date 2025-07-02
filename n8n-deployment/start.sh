#!/bin/bash
# Start N8N with Docker Compose

echo "🚀 Starting FlowClip N8N with Docker Compose..."

# Create external network if it doesn't exist
docker network ls | grep flowclip-n8n > /dev/null || docker network create flowclip-n8n

# Start services
docker-compose up -d

echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "📊 Service status:"
docker-compose ps

echo ""
echo "✅ N8N is starting up..."
echo "🌐 Access N8N at: http://localhost:5678"

if [ -f ".env" ] && grep -q "DOMAIN_NAME" .env; then
    DOMAIN=$(grep DOMAIN_NAME .env | cut -d'=' -f2)
    if [ "$DOMAIN" != "localhost" ]; then
        echo "🌍 Production URL: https://$DOMAIN"
    fi
fi

echo "👤 Admin credentials:"
echo "   Username: admin"
echo "   Password: $(grep N8N_ADMIN_PASSWORD .env | cut -d'=' -f2)"
echo ""
echo "📝 Next steps:"
echo "   1. Configure SSL certificates (if using custom domain)"
echo "   2. Import FlowClip workflows"
echo "   3. Configure external API keys"
echo "   4. Test integration with FlowClip"
