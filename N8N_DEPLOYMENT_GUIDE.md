# N8N Deployment Guide for FlowClip Integration

This guide will help you deploy N8N to work with your FlowClip application's automation workflows.

## 🚀 Quick Start Options

### Option 1: Local Development Setup (Recommended for Testing)
### Option 2: N8N Cloud (Easiest for Production)
### Option 3: Self-Hosted Docker (Best for Production Control)
### Option 4: VPS Deployment (Custom Infrastructure)

---

## 🏠 Option 1: Local Development Setup

### 1.1 Installation

```bash
# Install N8N globally
npm install n8n -g

# Or use npx (no global install needed)
npx n8n
```

### 1.2 Start N8N

```bash
# Start N8N (will be available at http://localhost:5678)
n8n start

# Or with custom port
N8N_PORT=8080 n8n start
```

### 1.3 Configure FlowClip for Local N8N

Create/update your `.env` file in FlowClip:

```bash
# FlowClip/.env
N8N_WEBHOOK_ENDPOINT=http://localhost:5678/webhook
N8N_API_KEY=your_optional_api_key
```

### 1.4 Test Connection

```bash
# Test webhook endpoint
curl -X POST http://localhost:5678/webhook/flowclip-hotel-research \
  -H "Content-Type: application/json" \
  -d '{"test": "data", "sessionType": "hotel_research"}'
```

---

## ☁️ Option 2: N8N Cloud (Recommended for Production)

### 2.1 Sign Up for N8N Cloud

1. Go to [n8n.cloud](https://n8n.cloud)
2. Sign up for an account
3. Choose your pricing plan:
   - **Starter**: Free (5 workflows, 2,500 executions/month)
   - **Pro**: $20/month (unlimited workflows, 10,000 executions/month)
   - **Enterprise**: Custom pricing

### 2.2 Get Your Webhook URLs

Once your N8N Cloud instance is ready:

```bash
# Your webhook base URL will be:
https://your-instance.app.n8n.cloud/webhook/

# Example webhook URLs:
https://flowclip-automation.app.n8n.cloud/webhook/flowclip-hotel-research
https://flowclip-automation.app.n8n.cloud/webhook/flowclip-product-research
```

### 2.3 Configure FlowClip for N8N Cloud

```bash
# FlowClip/.env
N8N_WEBHOOK_ENDPOINT=https://your-instance.app.n8n.cloud/webhook
N8N_API_KEY=your_n8n_api_key
```

### 2.4 Import FlowClip Workflows

1. In N8N Cloud, click "+" to create new workflow
2. Import the workflows from `n8n-workflow-examples.json`
3. Configure your API keys for external services

---

## 🐳 Option 3: Self-Hosted Docker (Production Ready)

### 3.1 Create Docker Compose Setup

```yaml
# docker-compose.yml
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
      - N8N_BASIC_AUTH_PASSWORD=your_secure_password
      
      # Database Configuration (optional, uses SQLite by default)
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=n8n_password
      
      # Security
      - N8N_ENCRYPTION_KEY=your_encryption_key_32_chars
      - WEBHOOK_URL=https://your-domain.com/
      
      # Timezone
      - TZ=America/New_York
      
      # Enable community nodes
      - N8N_COMMUNITY_PACKAGES_ENABLED=true
      
    volumes:
      - n8n_data:/home/node/.n8n
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      - postgres

  postgres:
    image: postgres:13
    container_name: flowclip-n8n-db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=n8n
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=n8n_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  n8n_data:
  postgres_data:
```

### 3.2 Deploy with Docker Compose

```bash
# Start the services
docker-compose up -d

# Check logs
docker-compose logs -f n8n

# Stop services
docker-compose down
```

### 3.3 Configure Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/n8n.your-domain.com
server {
    listen 80;
    server_name n8n.your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name n8n.your-domain.com;

    ssl_certificate /path/to/ssl/fullchain.pem;
    ssl_certificate_key /path/to/ssl/privkey.pem;

    location / {
        proxy_pass http://localhost:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 🌐 Option 4: VPS Deployment

### 4.1 VPS Requirements

**Minimum Requirements:**
- 1 GB RAM
- 1 CPU core
- 20 GB storage
- Ubuntu 20.04+ or similar

**Recommended:**
- 2 GB RAM
- 2 CPU cores
- 50 GB storage

### 4.2 VPS Setup Script

```bash
#!/bin/bash
# n8n-vps-setup.sh

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.12.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo apt install nginx -y

# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y

# Create N8N directory
mkdir -p ~/n8n-deployment
cd ~/n8n-deployment

# Download docker-compose.yml (create this file with the content from Option 3)
# Then start services
docker-compose up -d

echo "N8N is installing... Access it at http://your-server-ip:5678"
echo "Configure Nginx and SSL certificates next"
```

### 4.3 SSL Setup

```bash
# Get SSL certificate
sudo certbot --nginx -d n8n.your-domain.com

# Auto-renewal test
sudo certbot renew --dry-run
```

---

## 🔧 FlowClip Integration Configuration

### 5.1 Environment Variables

Create/update your FlowClip environment configuration:

```bash
# FlowClip/.env
# Choose one based on your deployment:

# Local Development
N8N_WEBHOOK_ENDPOINT=http://localhost:5678/webhook

# N8N Cloud
N8N_WEBHOOK_ENDPOINT=https://your-instance.app.n8n.cloud/webhook

# Self-Hosted
N8N_WEBHOOK_ENDPOINT=https://n8n.your-domain.com/webhook

# Optional: N8N API Key for authentication
N8N_API_KEY=your_n8n_api_key
```

### 5.2 Test FlowClip Integration

```bash
# Test the integration
node test-n8n-integration.js

# Should see output like:
# ✓ hotel_research session created and automation triggered
# ✓ product_research session created and automation triggered
```

---

## 📋 Importing FlowClip Workflows

### 6.1 Manual Import

1. Open your N8N instance
2. Click "+ Add workflow"
3. Click the "..." menu → "Import from file"
4. Import each workflow from `n8n-workflow-examples.json`

### 6.2 Automated Import via API

```bash
#!/bin/bash
# import-workflows.sh

N8N_BASE_URL="https://your-n8n-instance.com"
N8N_API_KEY="your_api_key"

# Import hotel research workflow
curl -X POST "$N8N_BASE_URL/api/v1/workflows/import" \
  -H "Authorization: Bearer $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @n8n-workflow-examples.json
```

### 6.3 Workflow Configuration

For each imported workflow, configure:

1. **Webhook Node**: Set correct webhook path
2. **API Credentials**: Add your external service API keys
3. **Function Nodes**: Customize data processing logic
4. **Error Handling**: Configure retry and fallback mechanisms

---

## 🔑 API Keys Setup

### 7.1 Required API Keys

Add these to your N8N workflows for full functionality:

```bash
# Search APIs
SERPAPI_KEY=your_serpapi_key  # Google Search
GOOGLE_API_KEY=your_google_key  # Custom Search

# E-commerce APIs
AMAZON_API_KEY=your_amazon_key  # Product search
EBAY_API_KEY=your_ebay_key  # Product listings

# Travel APIs
TRIPADVISOR_API_KEY=your_tripadvisor_key  # Hotel reviews
BOOKING_API_KEY=your_booking_key  # Hotel prices

# Academic APIs
# arXiv is free, no key needed
# Google Scholar via SerpAPI

# Fact-checking APIs
SNOPES_API_KEY=your_snopes_key  # Fact checking
```

### 7.2 Free Alternatives

If you don't want to pay for APIs:

```javascript
// Use web scraping nodes instead of API calls
// Example: Replace Amazon API with web scraping
{
  "type": "http-request",
  "name": "Scrape Amazon Search",
  "parameters": {
    "method": "GET",
    "url": "https://www.amazon.com/s?k={{$json.searchQuery}}",
    "options": {
      "headers": {
        "User-Agent": "Mozilla/5.0 (compatible; FlowClip-Bot/1.0)"
      }
    }
  }
}
```

---

## 🧪 Testing Your Setup

### 8.1 Test Script

Create a test file to verify everything works:

```javascript
// test-n8n-deployment.js
const https = require('https');

async function testN8NDeployment() {
  const webhookUrl = process.env.N8N_WEBHOOK_ENDPOINT + '/flowclip-hotel-research';
  
  const testData = {
    sessionId: 'test-session-' + Date.now(),
    sessionType: 'hotel_research',
    itemCount: 3,
    hotelData: {
      hotelNames: ['Hilton Toronto Downtown', 'Ritz-Carlton Toronto'],
      locations: ['Toronto'],
      checkInDates: ['2024-06-01'],
      priceRanges: ['$200-400'],
      amenities: ['wifi', 'pool', 'gym']
    },
    automationTasks: [
      'price_comparison',
      'availability_check',
      'reviews_aggregation'
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FlowClip-Session-Type': 'hotel_research'
      },
      body: JSON.stringify(testData)
    });

    console.log('✅ N8N webhook test successful:', response.status);
    const result = await response.text();
    console.log('Response:', result);
  } catch (error) {
    console.error('❌ N8N webhook test failed:', error.message);
  }
}

testN8NDeployment();
```

### 8.2 Run Tests

```bash
# Set your webhook endpoint
export N8N_WEBHOOK_ENDPOINT="https://your-n8n-instance.com/webhook"

# Run the test
node test-n8n-deployment.js

# Test FlowClip integration
node test-n8n-integration.js
```

---

## 🔒 Security Best Practices

### 9.1 Authentication

```bash
# N8N Basic Auth (for self-hosted)
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=secure_password

# API Key Authentication
N8N_API_KEY=your_secure_api_key_here
```

### 9.2 Firewall Configuration

```bash
# Only allow necessary ports
sudo ufw allow 22   # SSH
sudo ufw allow 80   # HTTP
sudo ufw allow 443  # HTTPS
sudo ufw deny 5678  # Block direct N8N access (use reverse proxy)
sudo ufw enable
```

### 9.3 SSL/TLS Configuration

```bash
# Auto-renewal for Let's Encrypt
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

---

## 📊 Monitoring & Maintenance

### 10.1 Health Checks

```bash
#!/bin/bash
# health-check.sh

# Check if N8N is running
if curl -f http://localhost:5678/healthz > /dev/null 2>&1; then
    echo "✅ N8N is healthy"
else
    echo "❌ N8N is down - restarting..."
    docker-compose restart n8n
fi
```

### 10.2 Log Monitoring

```bash
# Monitor N8N logs
docker-compose logs -f n8n

# Monitor Nginx logs
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

### 10.3 Backup Strategy

```bash
#!/bin/bash
# backup-n8n.sh

# Backup N8N data
docker run --rm -v flowclip_n8n_data:/data -v $(pwd):/backup ubuntu tar czf /backup/n8n-backup-$(date +%Y%m%d).tar.gz /data

# Backup database
docker exec flowclip-n8n-db pg_dump -U n8n n8n > n8n-db-backup-$(date +%Y%m%d).sql
```

---

## 🚀 Deployment Checklist

### ✅ Pre-Deployment
- [ ] Choose deployment option (Local/Cloud/Self-hosted/VPS)
- [ ] Obtain domain name (for production)
- [ ] Gather required API keys
- [ ] Plan resource requirements

### ✅ Deployment
- [ ] Install and configure N8N
- [ ] Set up SSL certificates (for production)
- [ ] Configure reverse proxy (for self-hosted)
- [ ] Import FlowClip workflows
- [ ] Configure API credentials

### ✅ Integration
- [ ] Update FlowClip environment variables
- [ ] Test webhook endpoints
- [ ] Run integration tests
- [ ] Verify automation triggers

### ✅ Production Readiness
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Implement security measures
- [ ] Document troubleshooting procedures

---

## 🆘 Troubleshooting

### Common Issues

**1. Webhook not reachable**
```bash
# Check N8N is running
curl http://localhost:5678/healthz

# Check webhook specifically
curl -X POST http://localhost:5678/webhook/test
```

**2. CORS issues**
```bash
# Add CORS headers in N8N
N8N_CORS_ORIGIN=https://your-flowclip-domain.com
```

**3. SSL certificate problems**
```bash
# Renew certificates
sudo certbot renew
sudo nginx -t && sudo systemctl reload nginx
```

**4. Database connection issues**
```bash
# Check PostgreSQL connection
docker-compose exec postgres psql -U n8n -d n8n -c "SELECT 1;"
```

---

## 📞 Support Resources

- **N8N Documentation**: https://docs.n8n.io/
- **N8N Community**: https://community.n8n.io/
- **FlowClip Integration**: See `test-n8n-integration.js` for examples
- **Workflow Examples**: See `n8n-workflow-examples.json`

---

Choose the deployment option that best fits your needs and follow the corresponding section. For production use, I recommend either **N8N Cloud** (for simplicity) or **Self-Hosted Docker** (for control). 