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
      
      // Verify schema after creation
      await this.verifyDatabaseSchema();
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  async verifyDatabaseSchema() {
    try {
      console.log('Database: Verifying schema...');
      
      // Check clipboard_items table structure
      const clipboardColumns = this.db.pragma(`table_info(clipboard_items)`);
      console.log('Database: clipboard_items table columns:');
      clipboardColumns.forEach(col => {
        console.log(`  - ${col.name}: ${col.type}${col.pk ? ' (PRIMARY KEY)' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
      });
      
      const hasAnalysisData = clipboardColumns.some(col => col.name === 'analysis_data');
      console.log('Database: analysis_data column exists:', hasAnalysisData ? '✅' : '❌');
      
      if (hasAnalysisData) {
        // Test if we can actually use the column
        try {
          const testQuery = this.db.prepare('SELECT id, analysis_data FROM clipboard_items LIMIT 1');
          const testResult = testQuery.get();
          console.log('Database: analysis_data column is queryable:', '✅');
          
          if (testResult) {
            console.log('Database: Sample analysis_data value type:', typeof testResult.analysis_data);
            console.log('Database: Sample analysis_data is null:', testResult.analysis_data === null);
          }
        } catch (error) {
          console.log('Database: ❌ Error querying analysis_data column:', error.message);
        }
      }
      
      // Check ai_tasks table structure
      const aiTasksColumns = this.db.pragma(`table_info(ai_tasks)`);
      console.log('Database: ai_tasks table columns:');
      aiTasksColumns.forEach(col => {
        console.log(`  - ${col.name}: ${col.type}${col.pk ? ' (PRIMARY KEY)' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
      });
      
      const hasTaskData = aiTasksColumns.some(col => col.name === 'task_data');
      console.log('Database: task_data column exists:', hasTaskData ? '✅' : '❌');
      
    } catch (error) {
      console.error('Database: Schema verification failed:', error);
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
        analysis_data TEXT,
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
        task_data TEXT,
        status TEXT DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (clipboard_item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
      )
    `);
    
    // Add task_data column if it doesn't exist (migration for existing databases)
    try {
      const columns = this.db.pragma(`table_info(ai_tasks)`);
      const hasTaskData = columns.some(col => col.name === 'task_data');
      if (!hasTaskData) {
        console.log('Database: Adding task_data column to ai_tasks table...');
        this.db.exec(`ALTER TABLE ai_tasks ADD COLUMN task_data TEXT`);
        console.log('Database: Migration completed successfully');
      }
    } catch (error) {
      console.error('Database: Migration error (may be safe to ignore):', error.message);
    }

    // Add analysis_data column if it doesn't exist (migration for existing databases)
    try {
      const clipboardColumns = this.db.pragma(`table_info(clipboard_items)`);
      const hasAnalysisData = clipboardColumns.some(col => col.name === 'analysis_data');
      if (!hasAnalysisData) {
        console.log('Database: Adding analysis_data column to clipboard_items table...');
        this.db.exec(`ALTER TABLE clipboard_items ADD COLUMN analysis_data TEXT`);
        console.log('Database: Analysis data migration completed successfully');
      }
    } catch (error) {
      console.error('Database: Analysis data migration error (may be safe to ignore):', error.message);
    }

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
    console.log('Database: Saving clipboard item with ID:', item.id);
    console.log('Database: Item keys:', Object.keys(item));
    console.log('Database: Has analysis_data in item:', 'analysis_data' in item);
    console.log('Database: analysis_data value type:', typeof item.analysis_data);
    
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_items (
        id, content, content_type, timestamp, source_app, window_title,
        screenshot_path, surrounding_text, tags, analysis_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(item.tags || []),
      item.analysis_data || null
    );

    console.log('Database: Insert result changes:', result.changes);
    console.log('Database: Save successful:', result.changes > 0);

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
    console.log('Database: Getting clipboard item with ID:', id);
    
    const stmt = this.db.prepare('SELECT * FROM clipboard_items WHERE id = ?');
    const row = stmt.get(id);

    console.log('Database: Query result found:', !!row);

    if (row) {

      
      return {
        ...row,
        tags: JSON.parse(row.tags || '[]')
      };
    }

    console.log('Database: No item found with ID:', id);
    return null;
  }

  async searchClipboardItems(query) {
    // Use FTS for semantic search
    const stmt = this.db.prepare(`
      SELECT c.*, bm25(clipboard_search) as rank
      FROM clipboard_search
      JOIN clipboard_items c ON clipboard_search.id = c.id
      WHERE clipboard_search MATCH ?
      ORDER BY bm25(clipboard_search), c.timestamp DESC
      LIMIT 20
    `);

    const searchQuery = query.replace(/[^\w\s]/g, '').trim();
    const rows = stmt.all(searchQuery);

    return rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]')
    }));
  }

  async saveAITask(task) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ai_tasks (id, clipboard_item_id, task_type, task_data, status, result, error)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        task.id,
        task.clipboard_item_id,
        task.task_type,
        task.task_data || null,
        task.status || 'pending',
        task.result || null,
        task.error || null
      );

      return result.changes > 0;
    } catch (error) {
      // If task_data column doesn't exist, try the old format
      if (error.message.includes('no column named task_data')) {
        console.log('Database: task_data column not found, using legacy format');
    const stmt = this.db.prepare(`
      INSERT INTO ai_tasks (id, clipboard_item_id, task_type, status, result, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      task.id,
      task.clipboard_item_id,
      task.task_type,
          task.status || 'pending',
          task.result || null,
          task.error || null
    );

    return result.changes > 0;
      }
      throw error; // Re-throw if it's a different error
    }
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

  // Alias for backward compatibility
  async getAITasks(clipboardItemId) {
    return this.getAITasksForClipboardItem(clipboardItemId);
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

  async updateClipboardItem(clipboardItemId, updates) {
    if (!clipboardItemId || typeof updates !== 'object') {
      throw new Error('Invalid parameters for updateClipboardItem');
    }

    const fields = [];
    const values = [];

    // Handle the allowed update fields
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }

    if (updates.analysis_data !== undefined) {
      fields.push('analysis_data = ?');
      values.push(updates.analysis_data);
    }

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }

    if (updates.content_type !== undefined) {
      fields.push('content_type = ?');
      values.push(updates.content_type);
    }

    if (updates.source_app !== undefined) {
      fields.push('source_app = ?');
      values.push(updates.source_app);
    }

    if (updates.window_title !== undefined) {
      fields.push('window_title = ?');
      values.push(updates.window_title);
    }

    if (updates.screenshot_path !== undefined) {
      fields.push('screenshot_path = ?');
      values.push(updates.screenshot_path);
    }

    if (updates.surrounding_text !== undefined) {
      fields.push('surrounding_text = ?');
      values.push(updates.surrounding_text);
    }

    if (fields.length === 0) {
      return false; // No valid fields to update
    }

    // Always update the updated_at timestamp
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(clipboardItemId);

    const stmt = this.db.prepare(`
      UPDATE clipboard_items 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    const result = stmt.run(...values);
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

  /**
   * Merge workflow results into comprehensive analysis
   */
  async mergeWorkflowResults(clipboardItemId, workflowType, workflowResults) {
    try {
      console.log(`Database: Merging ${workflowType} workflow results for item ${clipboardItemId}`);
      
      // Get current clipboard item with analysis data
      const item = await this.getClipboardItem(clipboardItemId);
      if (!item) {
        console.log('Database: Item not found, cannot merge workflow results');
        return false;
      }

      // Parse existing analysis data
      let analysisData = {};
      if (item.analysis_data) {
        try {
          analysisData = JSON.parse(item.analysis_data);
        } catch (parseError) {
          console.log('Database: Failed to parse existing analysis data, starting fresh');
          analysisData = {};
        }
      }

      // Initialize workflow results section if it doesn't exist
      if (!analysisData.workflowResults) {
        analysisData.workflowResults = {};
      }

      // Add timestamp to workflow results
      const workflowResult = {
        ...workflowResults,
        executedAt: new Date().toISOString(),
        workflowType: workflowType
      };

      // Store workflow results by type (allowing multiple executions)
      if (!analysisData.workflowResults[workflowType]) {
        analysisData.workflowResults[workflowType] = [];
      }
      
      // Add new result to the beginning of the array (most recent first)
      analysisData.workflowResults[workflowType].unshift(workflowResult);
      
      // Keep only the 3 most recent results per workflow type to prevent bloat
      analysisData.workflowResults[workflowType] = analysisData.workflowResults[workflowType].slice(0, 3);

      // Update comprehensive analysis with workflow insights
      if (workflowType === 'research') {
        await this.mergeResearchIntoAnalysis(analysisData, workflowResults);
      } else if (workflowType === 'summarize') {
        await this.mergeSummarizationIntoAnalysis(analysisData, workflowResults);
      } else if (workflowType === 'hotel_research') {
        await this.mergeHotelResearchIntoAnalysis(analysisData, workflowResults);
      }
      
      // Update last enriched timestamp
      analysisData.lastEnriched = new Date().toISOString();
      analysisData.enrichmentCount = (analysisData.enrichmentCount || 0) + 1;

      // Save updated analysis data back to database
      const success = await this.updateClipboardItem(clipboardItemId, {
        analysis_data: JSON.stringify(analysisData)
      });

      if (success) {
        console.log(`Database: Successfully merged ${workflowType} results into comprehensive analysis`);
        console.log(`Database: Analysis now has ${Object.keys(analysisData.workflowResults).length} workflow types`);
      } else {
        console.log(`Database: Failed to save merged ${workflowType} results`);
      }

      return success;
    } catch (error) {
      console.error('Database: Error merging workflow results:', error);
      return false;
    }
  }

  /**
   * Merge research workflow results into comprehensive analysis
   */
  async mergeResearchIntoAnalysis(analysisData, researchResults) {
    // Enhance tags with research insights
    if (researchResults.keyFindings && researchResults.keyFindings.length > 0) {
      const researchTags = [];
      
      // Extract tags from key findings
      researchResults.keyFindings.forEach(finding => {
        if (typeof finding === 'string') {
          // Simple keyword extraction from findings
          const keywords = finding.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3 && 
              !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'will', 'would', 'could', 'should'].includes(word)
            )
            .slice(0, 2); // Take top 2 keywords per finding
          
          researchTags.push(...keywords);
        }
      });

      // Merge with existing tags, keeping unique values
      const currentTags = analysisData.tags || [];
      const enrichedTags = [...new Set([...currentTags, ...researchTags, 'researched'])];
      analysisData.tags = enrichedTags.slice(0, 8); // Limit to 8 total tags
    }

    // Add research quality indicator
    if (researchResults.sources && researchResults.sources.length > 0) {
      analysisData.researchQuality = researchResults.sources.length > 3 ? 'comprehensive' : 'basic';
      analysisData.sourceCount = researchResults.sources.length;
    }

    // Update insights with research summary
    if (researchResults.researchSummary) {
      const researchInsight = `Research conducted: ${researchResults.researchSummary.substring(0, 200)}${researchResults.researchSummary.length > 200 ? '...' : ''}`;
      
      if (!analysisData.insights) {
        analysisData.insights = researchInsight;
      } else {
        // Prepend research insight to existing insights
        analysisData.insights = `${researchInsight}\n\nOriginal insights: ${analysisData.insights}`;
      }
    }

    // Update confidence based on research quality
    if (researchResults.confidence !== undefined) {
      // Combine original confidence with research confidence
      const originalConfidence = analysisData.confidence || 0.5;
      const researchConfidence = researchResults.confidence;
      analysisData.confidence = Math.min(0.95, (originalConfidence + researchConfidence) / 2 + 0.1);
    }
  }

  /**
   * Merge summarization workflow results into comprehensive analysis
   */
  async mergeSummarizationIntoAnalysis(analysisData, summaryResults) {
    // Add summary-related tags
    const summaryTags = ['summarized'];
    
    if (summaryResults.summary && summaryResults.summary.length > 500) {
      summaryTags.push('detailed-summary');
    } else if (summaryResults.summary && summaryResults.summary.length < 100) {
      summaryTags.push('brief-summary');
    }

    // Merge with existing tags
    const currentTags = analysisData.tags || [];
    const enrichedTags = [...new Set([...currentTags, ...summaryTags])];
    analysisData.tags = enrichedTags.slice(0, 8);

    // Update insights with summary information
    if (summaryResults.summary) {
      const summaryInsight = `Summarized: ${summaryResults.summary.substring(0, 150)}${summaryResults.summary.length > 150 ? '...' : ''}`;
      
      if (!analysisData.insights) {
        analysisData.insights = summaryInsight;
      } else {
        analysisData.insights = `${summaryInsight}\n\nOriginal insights: ${analysisData.insights}`;
      }
    }
  }

  /**
   * Merge hotel research workflow results into comprehensive analysis
   */
  async mergeHotelResearchIntoAnalysis(analysisData, hotelResults) {
    // Add hotel research tags
    const hotelTags = ['hotel-research'];
    
    if (hotelResults.extractedHotels && hotelResults.extractedHotels.length > 0) {
      hotelTags.push('hotels-identified');
      
      if (hotelResults.extractedHotels.length > 2) {
        hotelTags.push('hotel-comparison');
      }
    }

    if (hotelResults.locationContext && hotelResults.locationContext !== 'unknown') {
      hotelTags.push('travel-location');
    }

    // Merge with existing tags
    const currentTags = analysisData.tags || [];
    const enrichedTags = [...new Set([...currentTags, ...hotelTags])];
    analysisData.tags = enrichedTags.slice(0, 8);

    // Update insights with hotel research information
    if (hotelResults.recommendation && hotelResults.recommendation.hotels) {
      const hotelInsight = `Hotel research: Found ${hotelResults.recommendation.hotels.length} hotels in ${hotelResults.locationContext || 'specified location'}`;
      
      if (!analysisData.insights) {
        analysisData.insights = hotelInsight;
      } else {
        analysisData.insights = `${hotelInsight}\n\nOriginal insights: ${analysisData.insights}`;
      }
    }
  }

  /**
   * Get workflow results for a clipboard item
   */
  async getWorkflowResults(clipboardItemId, workflowType = null) {
    try {
      const item = await this.getClipboardItem(clipboardItemId);
      if (!item || !item.analysis_data) {
        return null;
      }

      const analysisData = JSON.parse(item.analysis_data);
      
      if (!analysisData.workflowResults) {
        return null;
      }

      if (workflowType) {
        return analysisData.workflowResults[workflowType] || null;
      }

      return analysisData.workflowResults;
    } catch (error) {
      console.error('Database: Error getting workflow results:', error);
      return null;
    }
  }

  /**
   * Check if a workflow has been executed for a clipboard item
   */
  async hasWorkflowResults(clipboardItemId, workflowType) {
    const results = await this.getWorkflowResults(clipboardItemId, workflowType);
    return results && results.length > 0;
  }
}

module.exports = Database; 