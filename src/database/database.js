const sqlite3 = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = path.join(app.getPath('userData'), 'flowclip.db');
  }

  async init() {
    try {
      // Ensure the directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Initialize database
      this.db = sqlite3(this.dbPath);
      
      // Enable WAL mode for better performance
      this.db.pragma('journal_mode = WAL');
      
      // Create tables
      this.createTables();
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  createTables() {
    // Clipboard items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clipboard_items (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        source_app TEXT,
        window_title TEXT,
        screenshot_path TEXT,
        surrounding_text TEXT,
        tags TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // AI tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_tasks (
        id TEXT PRIMARY KEY,
        clipboard_item_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (clipboard_item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_clipboard_timestamp ON clipboard_items(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_clipboard_content_type ON clipboard_items(content_type);
      CREATE INDEX IF NOT EXISTS idx_clipboard_source_app ON clipboard_items(source_app);
      CREATE INDEX IF NOT EXISTS idx_ai_tasks_clipboard_id ON ai_tasks(clipboard_item_id);
      CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks(status);
    `);

    // Enable full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_search USING fts5(
        id UNINDEXED,
        content,
        window_title,
        surrounding_text,
        tags
      );
    `);

    // Create triggers to keep FTS table in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS clipboard_insert_fts 
      AFTER INSERT ON clipboard_items
      BEGIN
        INSERT INTO clipboard_search(id, content, window_title, surrounding_text, tags)
        VALUES (NEW.id, NEW.content, NEW.window_title, NEW.surrounding_text, NEW.tags);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS clipboard_update_fts 
      AFTER UPDATE ON clipboard_items
      BEGIN
        UPDATE clipboard_search 
        SET content = NEW.content,
            window_title = NEW.window_title,
            surrounding_text = NEW.surrounding_text,
            tags = NEW.tags
        WHERE id = NEW.id;
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS clipboard_delete_fts 
      AFTER DELETE ON clipboard_items
      BEGIN
        DELETE FROM clipboard_search WHERE id = OLD.id;
      END;
    `);
  }

  async saveClipboardItem(item) {
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_items (
        id, content, content_type, timestamp, source_app, window_title,
        screenshot_path, surrounding_text, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      item.id,
      item.content,
      item.content_type,
      item.timestamp,
      item.source_app,
      item.window_title,
      item.screenshot_path,
      item.surrounding_text,
      JSON.stringify(item.tags || [])
    );

    return result.changes > 0;
  }

  async getClipboardHistory(options = {}) {
    const {
      limit = 50,
      offset = 0,
      contentType = null,
      sourceApp = null,
      fromDate = null,
      toDate = null
    } = options;

    let query = `
      SELECT * FROM clipboard_items
      WHERE 1=1
    `;
    const params = [];

    if (contentType) {
      query += ` AND content_type = ?`;
      params.push(contentType);
    }

    if (sourceApp) {
      query += ` AND source_app = ?`;
      params.push(sourceApp);
    }

    if (fromDate) {
      query += ` AND timestamp >= ?`;
      params.push(fromDate);
    }

    if (toDate) {
      query += ` AND timestamp <= ?`;
      params.push(toDate);
    }

    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]')
    }));
  }

  async getClipboardItem(id) {
    const stmt = this.db.prepare('SELECT * FROM clipboard_items WHERE id = ?');
    const row = stmt.get(id);

    if (row) {
      return {
        ...row,
        tags: JSON.parse(row.tags || '[]')
      };
    }

    return null;
  }

  async searchClipboardItems(query) {
    // Use FTS for semantic search
    const stmt = this.db.prepare(`
      SELECT c.*, ts.rank
      FROM clipboard_search s
      JOIN clipboard_items c ON s.id = c.id
      LEFT JOIN (
        SELECT id, bm25(clipboard_search) as rank
        FROM clipboard_search
        WHERE clipboard_search MATCH ?
      ) ts ON c.id = ts.id
      WHERE s MATCH ?
      ORDER BY ts.rank, c.timestamp DESC
      LIMIT 20
    `);

    const searchQuery = query.replace(/[^\w\s]/g, '').trim();
    const rows = stmt.all(searchQuery, searchQuery);

    return rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]')
    }));
  }

  async saveAITask(task) {
    const stmt = this.db.prepare(`
      INSERT INTO ai_tasks (id, clipboard_item_id, task_type, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      task.id,
      task.clipboard_item_id,
      task.task_type,
      task.status,
      task.result,
      task.error
    );

    return result.changes > 0;
  }

  async updateAITask(id, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (updates.status === 'completed') {
      fields.push('completed_at = ?');
      values.push(new Date().toISOString());
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE ai_tasks 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
  }

  async getAITask(id) {
    const stmt = this.db.prepare('SELECT * FROM ai_tasks WHERE id = ?');
    return stmt.get(id);
  }

  async getAITasksForClipboardItem(clipboardItemId) {
    const stmt = this.db.prepare(`
      SELECT * FROM ai_tasks 
      WHERE clipboard_item_id = ? 
      ORDER BY created_at DESC
    `);
    return stmt.all(clipboardItemId);
  }

  async addTags(clipboardItemId, newTags) {
    const item = await this.getClipboardItem(clipboardItemId);
    if (!item) return false;

    const currentTags = item.tags || [];
    const updatedTags = [...new Set([...currentTags, ...newTags])];

    const stmt = this.db.prepare(`
      UPDATE clipboard_items 
      SET tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(JSON.stringify(updatedTags), clipboardItemId);
    return result.changes > 0;
  }

  async removeTags(clipboardItemId, tagsToRemove) {
    const item = await this.getClipboardItem(clipboardItemId);
    if (!item) return false;

    const currentTags = item.tags || [];
    const updatedTags = currentTags.filter(tag => !tagsToRemove.includes(tag));

    const stmt = this.db.prepare(`
      UPDATE clipboard_items 
      SET tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(JSON.stringify(updatedTags), clipboardItemId);
    return result.changes > 0;
  }

  async deleteClipboardItem(id) {
    const stmt = this.db.prepare('DELETE FROM clipboard_items WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async clearAllItems() {
    try {
      // Delete all clipboard items (this will also trigger FTS cleanup via triggers)
      const stmt = this.db.prepare('DELETE FROM clipboard_items');
      const result = stmt.run();
      console.log(`Database: Cleared ${result.changes} clipboard items`);
      return { success: true, deletedCount: result.changes };
    } catch (error) {
      console.error('Database: Error clearing all clipboard items:', error);
      throw error;
    }
  }

  async getStats() {
    const totalItems = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_items').get();
    const totalTasks = this.db.prepare('SELECT COUNT(*) as count FROM ai_tasks').get();
    const completedTasks = this.db.prepare('SELECT COUNT(*) as count FROM ai_tasks WHERE status = "completed"').get();
    
    const topApps = this.db.prepare(`
      SELECT source_app, COUNT(*) as count 
      FROM clipboard_items 
      WHERE source_app IS NOT NULL
      GROUP BY source_app 
      ORDER BY count DESC 
      LIMIT 5
    `).all();

    const recentActivity = this.db.prepare(`
      SELECT DATE(timestamp) as date, COUNT(*) as count
      FROM clipboard_items
      WHERE timestamp >= datetime('now', '-30 days')
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `).all();

    return {
      totalItems: totalItems.count,
      totalTasks: totalTasks.count,
      completedTasks: completedTasks.count,
      topApps,
      recentActivity
    };
  }

  async cleanup(olderThanDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const stmt = this.db.prepare(`
      DELETE FROM clipboard_items 
      WHERE timestamp < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    return result.changes;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = Database; 