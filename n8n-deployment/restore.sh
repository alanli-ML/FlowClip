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
