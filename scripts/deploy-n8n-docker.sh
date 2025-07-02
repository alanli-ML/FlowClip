#!/bin/bash
# deploy-n8n-docker.sh - Docker Compose deployment for FlowClip N8N

set -e

echo "🐳 FlowClip N8N Docker Deployment Script"
echo "========================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

echo "✅ Docker found: $(docker --version)"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker Compose found: $(docker-compose --version)"

# Create deployment directory
DEPLOY_DIR="n8n-deployment"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

echo "📁 Deployment directory: $(pwd)"

# Generate secure passwords
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-12)

echo "🔐 Generated secure credentials"

# Prompt for domain configuration
read -p "📝 Enter your domain name (or press Enter for localhost): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
    DOMAIN_NAME="localhost"
    WEBHOOK_URL="http://localhost:5678/"
    SSL_ENABLED=false
else
    WEBHOOK_URL="https://$DOMAIN_NAME/"
    SSL_ENABLED=true
fi

echo "🌐 Domain: $DOMAIN_NAME"
echo "🔗 Webhook URL: $WEBHOOK_URL"

# Create environment file
cat > ".env" << EOF
# N8N Docker Configuration for FlowClip
DOMAIN_NAME=$DOMAIN_NAME
WEBHOOK_URL=$WEBHOOK_URL

# Database Configuration
DB_PASSWORD=$DB_PASSWORD

# N8N Configuration
N8N_ENCRYPTION_KEY=$ENCRYPTION_KEY
N8N_ADMIN_PASSWORD=$ADMIN_PASSWORD

# SSL Configuration
SSL_ENABLED=$SSL_ENABLED

# Timezone
TZ=America/New_York
EOF

echo "⚙️  Environment file created: .env"

# Create Docker Compose file
cat > "docker-compose.yml" << 'EOF'
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    container_name: flowclip-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      # Basic Configuration
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${N8N_ADMIN_PASSWORD}
      
      # Database Configuration
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${DB_PASSWORD}
      
      # Security
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - WEBHOOK_URL=${WEBHOOK_URL}
      
      # Timezone
      - TZ=${TZ}
      
      # Enable community nodes
      - N8N_COMMUNITY_PACKAGES_ENABLED=true
      
      # Workflow settings
      - N8N_WORKFLOW_TIMEOUT=300
      - N8N_LOG_LEVEL=info
      
      # Security headers
      - N8N_SECURE_COOKIE=false
      
    volumes:
      - n8n_data:/home/node/.n8n
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - flowclip-n8n

  postgres:
    image: postgres:13
    container_name: flowclip-n8n-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=n8n
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U n8n -d n8n"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - flowclip-n8n

volumes:
  n8n_data:
    driver: local
  postgres_data:
    driver: local

networks:
  flowclip-n8n:
    driver: bridge
EOF

echo "🐳 Docker Compose file created: docker-compose.yml"

# Create Nginx configuration for SSL (if domain is provided)
if [ "$SSL_ENABLED" = true ]; then
    cat > "nginx.conf" << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;

    # SSL configuration (update with your certificate paths)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    
    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";

    location / {
        proxy_pass http://localhost:5678;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

    echo "🌐 Nginx configuration created: nginx.conf"
fi

# Create start script
cat > "start.sh" << 'EOF'
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
EOF

chmod +x "start.sh"

# Create stop script
cat > "stop.sh" << 'EOF'
#!/bin/bash
# Stop N8N Docker Compose deployment

echo "🛑 Stopping FlowClip N8N..."
docker-compose down

echo "✅ N8N stopped"
EOF

chmod +x "stop.sh"

# Create backup script
cat > "backup.sh" << 'EOF'
#!/bin/bash
# Backup N8N data and database

BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="n8n-backup-$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

echo "💾 Creating backup: $BACKUP_FILE"

# Backup N8N data volume
echo "📁 Backing up N8N data..."
docker run --rm -v n8n-deployment_n8n_data:/data -v $(pwd)/$BACKUP_DIR:/backup ubuntu tar czf /backup/$BACKUP_FILE-data.tar.gz /data

# Backup database
echo "🗄️  Backing up database..."
docker-compose exec -T postgres pg_dump -U n8n n8n > "$BACKUP_DIR/$BACKUP_FILE-db.sql"

echo "✅ Backup completed:"
echo "   Data: $BACKUP_DIR/$BACKUP_FILE-data.tar.gz"
echo "   Database: $BACKUP_DIR/$BACKUP_FILE-db.sql"
EOF

chmod +x "backup.sh"

# Create restore script
cat > "restore.sh" << 'EOF'
#!/bin/bash
# Restore N8N from backup

if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup-timestamp>"
    echo "Example: $0 20240101_120000"
    exit 1
fi

TIMESTAMP=$1
BACKUP_DIR="backups"
BACKUP_FILE="n8n-backup-$TIMESTAMP"

if [ ! -f "$BACKUP_DIR/$BACKUP_FILE-data.tar.gz" ]; then
    echo "❌ Data backup file not found: $BACKUP_DIR/$BACKUP_FILE-data.tar.gz"
    exit 1
fi

if [ ! -f "$BACKUP_DIR/$BACKUP_FILE-db.sql" ]; then
    echo "❌ Database backup file not found: $BACKUP_DIR/$BACKUP_FILE-db.sql"
    exit 1
fi

echo "🔄 Restoring N8N from backup: $BACKUP_FILE"

# Stop services
echo "🛑 Stopping services..."
docker-compose down

# Restore data volume
echo "📁 Restoring N8N data..."
docker run --rm -v n8n-deployment_n8n_data:/data -v $(pwd)/$BACKUP_DIR:/backup ubuntu tar xzf /backup/$BACKUP_FILE-data.tar.gz -C /

# Start database only
echo "🗄️  Starting database..."
docker-compose up -d postgres
sleep 10

# Restore database
echo "📊 Restoring database..."
docker-compose exec -T postgres psql -U n8n -d n8n < "$BACKUP_DIR/$BACKUP_FILE-db.sql"

# Start all services
echo "🚀 Starting all services..."
docker-compose up -d

echo "✅ Restore completed!"
EOF

chmod +x "restore.sh"

# Create logs script
cat > "logs.sh" << 'EOF'
#!/bin/bash
# View N8N logs

if [ "$1" = "-f" ]; then
    echo "📜 Following N8N logs (Ctrl+C to stop)..."
    docker-compose logs -f n8n
else
    echo "📜 N8N logs (last 100 lines):"
    docker-compose logs --tail=100 n8n
fi
EOF

chmod +x "logs.sh"

# Create health check script
cat > "health.sh" << 'EOF'
#!/bin/bash
# Check N8N health status

echo "🏥 N8N Health Check"
echo "==================="

# Check if containers are running
echo "📊 Container Status:"
docker-compose ps

echo ""
echo "🌐 Service Health:"

# Check N8N health endpoint
if curl -s http://localhost:5678/healthz > /dev/null; then
    echo "✅ N8N API is healthy"
else
    echo "❌ N8N API is not responding"
fi

# Check database connection
if docker-compose exec -T postgres pg_isready -U n8n -d n8n > /dev/null 2>&1; then
    echo "✅ Database is healthy"
else
    echo "❌ Database is not responding"
fi

echo ""
echo "📈 Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
EOF

chmod +x "health.sh"

# Create FlowClip integration test
cat > "test-integration.sh" << 'EOF'
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
EOF

chmod +x "test-integration.sh"

# Update FlowClip .env file
FLOWCLIP_ENV="../.env"
if [ -f "$FLOWCLIP_ENV" ]; then
    if ! grep -q "N8N_WEBHOOK_ENDPOINT" "$FLOWCLIP_ENV"; then
        echo "" >> "$FLOWCLIP_ENV"
        echo "# FlowClip N8N Integration (Docker)" >> "$FLOWCLIP_ENV"
        echo "N8N_WEBHOOK_ENDPOINT=$WEBHOOK_URL"webhook >> "$FLOWCLIP_ENV"
        echo "N8N_API_KEY=" >> "$FLOWCLIP_ENV"
        echo "✅ Updated FlowClip .env file"
    fi
else
    cat > "$FLOWCLIP_ENV" << EOF
# FlowClip N8N Integration (Docker)
N8N_WEBHOOK_ENDPOINT=${WEBHOOK_URL}webhook
N8N_API_KEY=

# Optional: Enable debug logging
DEBUG=flowclip:n8n
EOF
    echo "✅ Created FlowClip .env file"
fi

echo ""
echo "🎉 N8N Docker Deployment Complete!"
echo ""
echo "📋 Management Commands:"
echo "  Start:     ./start.sh"
echo "  Stop:      ./stop.sh"
echo "  Logs:      ./logs.sh [-f]"
echo "  Health:    ./health.sh"
echo "  Backup:    ./backup.sh"
echo "  Restore:   ./restore.sh <timestamp>"
echo "  Test:      ./test-integration.sh"
echo ""
echo "🔐 Admin Credentials:"
echo "  Username: admin"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "🌐 Access URLs:"
echo "  Local: http://localhost:5678"
if [ "$SSL_ENABLED" = true ]; then
    echo "  Production: https://$DOMAIN_NAME"
    echo ""
    echo "⚠️  SSL Setup Required:"
    echo "    1. Install Nginx: sudo apt install nginx"
    echo "    2. Copy nginx.conf to /etc/nginx/sites-available/$DOMAIN_NAME"
    echo "    3. Enable site: sudo ln -s /etc/nginx/sites-available/$DOMAIN_NAME /etc/nginx/sites-enabled/"
    echo "    4. Get SSL cert: sudo certbot --nginx -d $DOMAIN_NAME"
    echo "    5. Restart Nginx: sudo systemctl restart nginx"
fi
echo ""
echo "🚀 Ready to start? Run: ./start.sh" 