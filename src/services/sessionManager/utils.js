/**
 * Utility functions for Session Manager
 */

const { 
  BROWSER_APPS, 
  RESEARCH_KEYWORDS, 
  MAJOR_CITIES, 
  CUISINE_TYPES,
  EVENT_TYPES,
  PROJECT_TYPES,
  TEMPORAL_KEYWORDS,
  CONTENT_PATTERNS,
  PROGRESS_STATUS
} = require('./constants');

/**
 * Logging utility with consistent SessionManager formatting
 */
class SessionLogger {
  static log(message, context = '') {
    const logMessage = context ? `SessionManager ${context}: ${message}` : `SessionManager: ${message}`;
    console.log(logMessage);
  }

  static error(message, context = '', error = null) {
    const logMessage = context ? `SessionManager ${context}: ${message}` : `SessionManager: ${message}`;
    if (error) {
      console.error(logMessage, error);
    } else {
      console.error(logMessage);
    }
  }

  static debug(message, context = '') {
    const logMessage = context ? `SessionManager ${context}: ${message}` : `SessionManager: ${message}`;
    console.log(logMessage);
  }
}

/**
 * Database operation utilities to reduce repetitive code
 */
class DatabaseUtils {
  constructor(database) {
    this.database = database;
  }

  // Prepare and execute a SELECT query
  async select(query, params = []) {
    try {
      const stmt = this.database.db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      SessionLogger.error(`Database SELECT error: ${query}`, '', error);
      throw error;
    }
  }

  // Prepare and execute a SELECT query for single result
  async selectOne(query, params = []) {
    try {
      const stmt = this.database.db.prepare(query);
      return stmt.get(...params);
    } catch (error) {
      SessionLogger.error(`Database SELECT ONE error: ${query}`, '', error);
      throw error;
    }
  }

  // Prepare and execute an INSERT/UPDATE/DELETE query
  async execute(query, params = []) {
    try {
      const stmt = this.database.db.prepare(query);
      return stmt.run(...params);
    } catch (error) {
      SessionLogger.error(`Database EXECUTE error: ${query}`, '', error);
      throw error;
    }
  }

  // Update session last activity
  async updateSessionActivity(sessionId) {
    return this.execute(`
      UPDATE clipboard_sessions 
      SET last_activity = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [sessionId]);
  }

  // Get session by ID
  async getSession(sessionId) {
    return this.selectOne('SELECT * FROM clipboard_sessions WHERE id = ?', [sessionId]);
  }

  // Get session items
  async getSessionItems(sessionId) {
    const items = await this.select(`
      SELECT c.* FROM clipboard_items c
      JOIN session_members sm ON c.id = sm.clipboard_item_id
      WHERE sm.session_id = ?
      ORDER BY sm.sequence_order ASC
    `, [sessionId]);
    
    return items.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]')
    }));
  }

  // Get session item count
  async getSessionItemCount(sessionId) {
    const result = await this.selectOne(
      'SELECT COUNT(*) as count FROM session_members WHERE session_id = ?', 
      [sessionId]
    );
    return result.count;
  }

  // Get next sequence order for session
  async getNextSequenceOrder(sessionId) {
    const result = await this.selectOne(`
      SELECT COALESCE(MAX(sequence_order), 0) + 1 as next_order
      FROM session_members 
      WHERE session_id = ?
    `, [sessionId]);
    return result.next_order;
  }

  // Add item to session
  async addItemToSession(sessionId, clipboardItemId, sequenceOrder) {
    return this.execute(`
      INSERT OR REPLACE INTO session_members (
        session_id, clipboard_item_id, sequence_order
      ) VALUES (?, ?, ?)
    `, [sessionId, clipboardItemId, sequenceOrder]);
  }

  // Update session data
  async updateSessionData(sessionId, contextSummary, intentAnalysis) {
    return this.execute(`
      UPDATE clipboard_sessions 
      SET context_summary = ?, intent_analysis = ?, last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(contextSummary), JSON.stringify(intentAnalysis), sessionId]);
  }

  // Update session status
  async updateSessionStatus(sessionId, status) {
    return this.execute(`
      UPDATE clipboard_sessions 
      SET status = ?, last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, sessionId]);
  }
}

/**
 * JSON parsing utilities with error handling
 */
class JSONUtils {
  static parseSessionData(session) {
    let contextSummary = {};
    let intentAnalysis = {};
    
    if (session.context_summary) {
      try {
        contextSummary = JSON.parse(session.context_summary);
      } catch (parseError) {
        SessionLogger.log('Failed to parse existing context summary, starting fresh');
        contextSummary = {};
      }
    }

    if (session.intent_analysis) {
      try {
        intentAnalysis = JSON.parse(session.intent_analysis);
      } catch (parseError) {
        SessionLogger.log('Failed to parse existing intent analysis, starting fresh');
        intentAnalysis = {};
      }
    }

    return { contextSummary, intentAnalysis };
  }

  static safeStringify(obj, fallback = '{}') {
    try {
      return JSON.stringify(obj);
    } catch (error) {
      SessionLogger.error('JSON stringify failed, using fallback', '', error);
      return fallback;
    }
  }
}

/**
 * Content analysis utilities
 */
class ContentAnalyzer {
  static isBrowserApp(appName) {
    return BROWSER_APPS.includes(appName);
  }

  static detectContentType(content) {
    if (!content) return 'empty';
    
    const lowerContent = content.toLowerCase();
    
    if (CONTENT_PATTERNS.URL.test(content)) return 'url';
    if (CONTENT_PATTERNS.EMAIL.test(content)) return 'email';
    if (CONTENT_PATTERNS.PHONE.test(content)) return 'phone';
    if (CONTENT_PATTERNS.DATE.test(content)) return 'date';
    if (CONTENT_PATTERNS.LOCATION.test(content)) return 'location';
    if (CONTENT_PATTERNS.BUSINESS.test(content)) return 'business';
    
    if (content.length > 100) return 'long_text';
    return 'text';
  }

  static detectSessionType(clipboardItem) {
    if (!ContentAnalyzer.isBrowserApp(clipboardItem.source_app)) {
      return null;
    }

    const content = clipboardItem.content.toLowerCase().trim();
    
    // Hotel research patterns
    if (RESEARCH_KEYWORDS.HOTEL.some(keyword => content.includes(keyword))) {
      return 'hotel_research';
    }
    
    // Restaurant research patterns
    if (RESEARCH_KEYWORDS.RESTAURANT.some(keyword => content.includes(keyword))) {
      return 'restaurant_research';
    }
    
    // Travel research patterns
    if (RESEARCH_KEYWORDS.TRAVEL.some(keyword => content.includes(keyword))) {
      return 'travel_research';
    }
    
    // Generic research check
    const hasUppercase = /[A-Z]/.test(content);
    const notUrl = !content.startsWith('http');
    const goodLength = content.length > 5 && content.length < 500;
    
    if (goodLength && hasUppercase && notUrl) {
      return 'general_research';
    }
    
    return null;
  }

  static analyzeItemTypes(sessionItems) {
    const types = new Set();
    
    sessionItems.forEach(item => {
      const content = item.content.toLowerCase();
      
      if (content.startsWith('http')) {
        types.add('URLs');
      } else if (content.includes('@') && content.includes('.')) {
        types.add('emails');
      } else if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(content)) {
        types.add('phone numbers');
      } else if (content.length > 200) {
        types.add('documents');
      } else if (content.length < 20) {
        types.add('short clips');
      } else {
        types.add('text content');
      }
    });
    
    return Array.from(types);
  }

  static extractBasicKeywords(content) {
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'said', 'each', 'which', 'their', 'what', 'about', 'would', 'there', 'could', 'other', 'more'].includes(word));
    
    const wordCounts = {};
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    return Object.entries(wordCounts)
      .filter(([word, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  }

  static calculateSessionTimespan(sessionItems) {
    if (sessionItems.length === 0) return 'unknown';
    
    const timestamps = sessionItems.map(item => new Date(item.timestamp)).sort();
    const earliest = timestamps[0];
    const latest = timestamps[timestamps.length - 1];
    
    const diffMs = latest - earliest;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    
    if (diffHours > 24) {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    } else {
      return 'less than a minute';
    }
  }
}

/**
 * Theme detection utilities
 */
class ThemeDetector {
  static extractLocationThemes(clipboardItem, sessionItems) {
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const location of MAJOR_CITIES) {
      const locationLower = location.toLowerCase();
      if (newItemContent.includes(locationLower) && sessionContent.includes(locationLower)) {
        SessionLogger.debug(`Found common location theme: ${location}`);
        return { commonLocation: location };
      }
    }
    
    return {};
  }

  static extractEventThemes(clipboardItem, sessionItems) {
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const event of EVENT_TYPES) {
      if (newItemContent.includes(event) && sessionContent.includes(event)) {
        SessionLogger.debug(`Found common event theme: ${event}`);
        return { commonEvent: event };
      }
    }
    
    return {};
  }

  static extractTemporalThemes(clipboardItem, sessionItems) {
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const timeframe of TEMPORAL_KEYWORDS) {
      if (newItemContent.includes(timeframe) && sessionContent.includes(timeframe)) {
        SessionLogger.debug(`Found common temporal theme: ${timeframe}`);
        return { commonTimeframe: timeframe };
      }
    }
    
    return {};
  }

  static extractProjectThemes(clipboardItem, sessionItems) {
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const project of PROJECT_TYPES) {
      if (newItemContent.includes(project) && sessionContent.includes(project)) {
        SessionLogger.debug(`Found common project theme: ${project}`);
        return { commonProject: project };
      }
    }
    
    return {};
  }

  static extractContentThemes(sessionItems) {
    const allContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    const themes = [];
    
    // Extract location themes
    const locationMatches = MAJOR_CITIES.filter(city => 
      allContent.includes(city.toLowerCase())
    );
    if (locationMatches.length > 0) {
      themes.push(...locationMatches.slice(0, 2).map(loc => loc.toLowerCase()));
    }
    
    // Extract general themes
    const generalThemes = [];
    if (allContent.includes('hotel') || allContent.includes('accommodation')) generalThemes.push('accommodation');
    if (allContent.includes('restaurant') || allContent.includes('dining')) generalThemes.push('dining');
    if (allContent.includes('travel') || allContent.includes('vacation')) generalThemes.push('travel');
    if (allContent.includes('conference') || allContent.includes('business')) generalThemes.push('business');
    if (allContent.includes('luxury') || allContent.includes('premium')) generalThemes.push('luxury');
    if (allContent.includes('budget') || allContent.includes('affordable')) generalThemes.push('budget');
    
    themes.push(...generalThemes);
    
    return [...new Set(themes)].slice(0, 3);
  }
}

/**
 * Session intent analysis utilities
 */
class IntentAnalyzer {
  static derivePrimaryIntent(sessionType, sessionItems) {
    const content = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    switch (sessionType) {
      case 'hotel_research':
        if (content.includes('book') || content.includes('reservation')) {
          return 'Planning to book hotel accommodations';
        } else if (content.includes('compare') || content.includes('vs')) {
          return 'Comparing hotel options and amenities';
        } else {
          return 'Researching hotel options for accommodation';
        }
      
      case 'restaurant_research':
        if (content.includes('reservation') || content.includes('book')) {
          return 'Planning to make restaurant reservations';
        } else {
          return 'Researching restaurant options and reviews';
        }
      
      case 'product_research':
        if (content.includes('buy') || content.includes('purchase') || content.includes('price')) {
          return 'Researching products for potential purchase';
        } else if (content.includes('compare') || content.includes('vs')) {
          return 'Comparing product features and options';
        } else {
          return 'Researching product information and reviews';
        }
      
      case 'travel_research':
        if (content.includes('booking') || content.includes('flights')) {
          return 'Planning travel arrangements and bookings';
        } else {
          return 'Researching travel destinations and options';
        }
      
      default:
        return `Researching ${sessionType.replace('_', ' ')} information`;
    }
  }

  static deriveProgressStatus(sessionItems) {
    const totalItems = sessionItems.length;
    const content = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    if (totalItems === 2) {
      return PROGRESS_STATUS.JUST_STARTED;
    } else if (totalItems <= 5) {
      return PROGRESS_STATUS.GATHERING_INFORMATION;
    } else if (content.includes('compare') || content.includes('vs') || content.includes('review')) {
      return PROGRESS_STATUS.COMPARING_OPTIONS;
    } else if (content.includes('book') || content.includes('buy') || content.includes('purchase')) {
      return PROGRESS_STATUS.READY_TO_DECIDE;
    } else {
      return PROGRESS_STATUS.IN_PROGRESS;
    }
  }
}

/**
 * Session label generation utilities
 */
class LabelGenerator {
  static generateSessionLabel(sessionType, clipboardItem, labelTemplates) {
    let baseLabel = labelTemplates[sessionType] || 'Research Session';
    const content = clipboardItem.content;
    
    // For hotel research, prioritize location over brand
    if (sessionType === 'hotel_research') {
      const cityMatch = content.match(new RegExp(`\\b(${MAJOR_CITIES.join('|')})\\b`, 'i'));
      if (cityMatch) {
        return `${baseLabel} - ${cityMatch[1]}`;
      }
    }
    
    // For restaurant research, look for city first, then cuisine
    if (sessionType === 'restaurant_research') {
      const cityMatch = content.match(new RegExp(`\\b(${MAJOR_CITIES.join('|')})\\b`, 'i'));
      if (cityMatch) {
        return `${baseLabel} - ${cityMatch[1]}`;
      }
      
      const cuisineMatch = content.match(new RegExp(`\\b(${CUISINE_TYPES.join('|')})\\b`, 'i'));
      if (cuisineMatch) {
        return `${baseLabel} - ${cuisineMatch[1]}`;
      }
    }
    
    // General proper noun extraction as fallback
    const properNounMatch = content.match(/\b([A-Z][a-z]{3,15})\b/);
    if (properNounMatch) {
      const properNoun = properNounMatch[1];
      if (properNoun.length < 20) {
        return `${baseLabel} - ${properNoun}`;
      }
    }
    
    return baseLabel;
  }
}

/**
 * Progress tracking utilities
 */
class ProgressTracker {
  constructor(progressCallback) {
    this.progressCallback = progressCallback;
  }

  emit(eventData) {
    if (this.progressCallback) {
      this.progressCallback(eventData);
    }
  }

  emitProgress(sessionId, phase, progress, status, additionalData = {}) {
    this.emit({
      sessionId,
      phase,
      progress,
      currentStatus: status,
      ...additionalData
    });
  }

  emitResearchStarted(sessionId, sessionType, sessionLabel, totalItems) {
    this.emit({
      sessionId,
      sessionType,
      sessionLabel,
      totalItems,
      phase: 'initializing'
    });
  }

  emitResearchCompleted(sessionId, sessionType, results) {
    this.emit({
      sessionId,
      sessionType,
      phase: 'completed',
      progress: 100,
      currentStatus: 'Session research completed successfully',
      finalResults: results
    });
  }
}

module.exports = {
  SessionLogger,
  DatabaseUtils,
  JSONUtils,
  ContentAnalyzer,
  ThemeDetector,
  IntentAnalyzer,
  LabelGenerator,
  ProgressTracker
}; 