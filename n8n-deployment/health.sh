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
