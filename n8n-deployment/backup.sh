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
