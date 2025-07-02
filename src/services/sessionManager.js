const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class SessionManager extends EventEmitter {
  constructor(database, aiService, externalApiService = null) {
    super();
    this.database = database;
    this.aiService = aiService;
    this.externalApiService = externalApiService;
    this.activeSessions = new Map();
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes - more realistic for research sessions
    this.sessionCleanupInterval = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    // Initialize database tables for session management
    await this.createSessionTables();
    
    // Start session cleanup interval
    this.sessionCleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 1000); // Check every minute
    
    this.isInitialized = true;
    console.log('SessionManager initialized');
  }

  async createSessionTables() {
    // Session table
    this.database.db.exec(`
      CREATE TABLE IF NOT EXISTS clipboard_sessions (
        id TEXT PRIMARY KEY,
        session_type TEXT NOT NULL,
        session_label TEXT,
        start_time DATETIME NOT NULL,
        last_activity DATETIME NOT NULL,
        status TEXT DEFAULT 'active',
        context_summary TEXT,
        intent_analysis TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Session members table
    this.database.db.exec(`
      CREATE TABLE IF NOT EXISTS session_members (
        session_id TEXT NOT NULL,
        clipboard_item_id TEXT NOT NULL,
        sequence_order INTEGER,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES clipboard_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (clipboard_item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
        PRIMARY KEY (session_id, clipboard_item_id)
      )
    `);

    // Create indexes
    this.database.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON clipboard_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_type ON clipboard_sessions(session_type);
      CREATE INDEX IF NOT EXISTS idx_sessions_activity ON clipboard_sessions(last_activity);
      CREATE INDEX IF NOT EXISTS idx_session_members_session ON session_members(session_id);
    `);
  }

  async processClipboardItem(clipboardItem) {
    console.log(`SessionManager: Processing clipboard item for session detection: "${clipboardItem.content.substring(0, 30)}..."`);
    
    try {
      // Analyze potential session membership
      const sessionCandidates = await this.findSessionCandidates(clipboardItem);
      
      let targetSession = null;
      
      if (sessionCandidates.length > 0) {
        console.log(`SessionManager: Found ${sessionCandidates.length} candidates, evaluating membership...`);
        // Check if item belongs to existing session
        targetSession = await this.evaluateSessionMembership(clipboardItem, sessionCandidates);
      } else {
        console.log('SessionManager: No session candidates found, will create new session if applicable');
      }
      
      if (!targetSession) {
        console.log('SessionManager: No existing session to join, checking for new session type...');
        // Check if this could start a new session
        const newSessionType = await this.detectNewSessionType(clipboardItem);
        if (newSessionType) {
          targetSession = await this.createNewSession(newSessionType, clipboardItem);
        }
      } else {
        console.log(`SessionManager: Item will be added to existing session: ${targetSession.session_label}`);
      }
      
      if (targetSession) {
        await this.addItemToSession(targetSession.id, clipboardItem);
        await this.updateSessionAnalysis(targetSession.id);
        
        const itemCount = await this.getSessionItemCount(targetSession.id);
        
        // Emit session event
        this.emit('session-updated', {
          sessionId: targetSession.id,
          sessionType: targetSession.session_type,
          itemCount,
          clipboardItem
        });

        // Trigger external automation if enabled
        await this.triggerExternalAutomation(targetSession, itemCount);
      }
      
      return targetSession;
    } catch (error) {
      console.error('SessionManager: Error processing clipboard item:', error);
      return null;
    }
  }

  async findSessionCandidates(clipboardItem) {
    const currentTime = new Date();
    const timeWindow = new Date(currentTime.getTime() - this.sessionTimeout);
    
    console.log(`SessionManager: Looking for candidates - current time: ${currentTime.toISOString()}, window: ${timeWindow.toISOString()}`);
    
    // Get active sessions within time window using datetime() function for proper comparison
    const stmt = this.database.db.prepare(`
      SELECT * FROM clipboard_sessions 
      WHERE status = 'active' 
      AND datetime(last_activity) >= datetime(?)
      ORDER BY datetime(last_activity) DESC
    `);
    
    const candidates = stmt.all(timeWindow.toISOString());
    console.log(`SessionManager: Found ${candidates.length} session candidates within ${this.sessionTimeout / 1000}s`);
    
    candidates.forEach(session => {
      console.log(`  Candidate: ${session.session_label} (${session.session_type}) - last activity: ${session.last_activity}`);
    });
    
    return candidates;
  }

  async evaluateSessionMembership(clipboardItem, sessionCandidates) {
    console.log(`SessionManager: Evaluating membership for "${clipboardItem.content.substring(0, 30)}..." against ${sessionCandidates.length} sessions`);
    
    // Always try LangGraph first for intelligent session membership detection
    try {
      if (this.aiService && this.aiService.langGraphClient) {
        for (const session of sessionCandidates) {
          console.log(`  Checking session: ${session.session_label} (${session.session_type}) with LangGraph`);
          
          const sessionItems = await this.getSessionItems(session.id);
          
          const membershipResult = await this.aiService.langGraphClient.executeWorkflow('session_membership', {
            content: clipboardItem.content,
            context: {
              sourceApp: clipboardItem.source_app,
              windowTitle: clipboardItem.window_title,
              timestamp: clipboardItem.timestamp
            },
            existingSession: {
              type: session.session_type,
              label: session.session_label,
              items: sessionItems.map(item => ({
                content: item.content.substring(0, 200),
                sourceApp: item.source_app,
                timestamp: item.timestamp
              }))
            }
          });

          console.log(`    LangGraph membership result: belongs=${membershipResult.belongs}, confidence=${membershipResult.confidence}`);
          
          if (membershipResult.belongs && membershipResult.confidence > 0.6) {
            console.log(`    → Joining existing session via LangGraph: ${session.session_label}`);
            return session;
          }
        }
      } else {
        console.log('  LangGraph not available, using minimal fallback');
      }
    } catch (error) {
      console.error('SessionManager: LangGraph session membership failed:', error);
    }

    // Minimal fallback - only check if sessions are very recent and from similar apps
    return await this.evaluateSessionMembershipMinimal(clipboardItem, sessionCandidates);
  }

  async evaluateSessionMembershipMinimal(clipboardItem, sessionCandidates) {
    // Improved fallback - be more aggressive about combining related sessions
    console.log(`    → Using fallback membership evaluation`);
    
    const content = clipboardItem.content.toLowerCase();
    
    // Check each candidate session for obvious content similarity
    for (const session of sessionCandidates) {
      const sessionWords = session.session_label.toLowerCase().split(/\s+/);
      const recentActivity = new Date(session.last_activity);
      const timeDiff = Date.now() - recentActivity.getTime();
      
      console.log(`      Checking ${session.session_label}: ${timeDiff / 1000}s ago`);
      
      // Be more generous with time window - sessions persist longer now
      if (timeDiff < 60 * 60 * 1000) { // 1 hour instead of 10 minutes
        // Hotel research - be very aggressive about combining hotel sessions
        if (session.session_type === 'hotel_research') {
          const hotelKeywords = ['hotel', 'resort', 'inn', 'suite', 'booking', 'room', 'stay', 'hilton', 'ritz', 'four seasons', 'shangri', 'marriott', 'hyatt'];
          const hasHotelKeyword = hotelKeywords.some(keyword => content.includes(keyword));
          
          // Check for location continuity in session label
          const locationWords = sessionWords.filter(word => word.length > 3 && !['hotel', 'research'].includes(word));
          const hasLocationMatch = locationWords.some(word => content.includes(word));
          
          // For hotel research, combine if ANY hotel-related content is detected
          if (hasHotelKeyword || hasLocationMatch || content.includes('toronto')) {
            console.log(`      → Joining hotel session via fallback: ${session.session_label}`);
            return session;
          }
        }
        
        // General research - same source app and recent
        if (session.session_type === 'general_research' && 
            clipboardItem.source_app === 'Google Chrome' && 
            timeDiff < 30 * 60 * 1000) { // 30 minutes instead of 5
          console.log(`      → Joining research session via fallback: ${session.session_label}`);
          return session;
        }
        
        // Restaurant research - combine food/dining related content
        if (session.session_type === 'restaurant_research') {
          const foodKeywords = ['restaurant', 'menu', 'dining', 'food', 'cuisine', 'reservation', 'chef'];
          const hasFoodKeyword = foodKeywords.some(keyword => content.includes(keyword));
          if (hasFoodKeyword) {
            console.log(`      → Joining restaurant session via fallback: ${session.session_label}`);
            return session;
          }
        }
      }
    }
    
    console.log(`    → No session membership found via fallback`);
    return null;
  }

  isBrowserApp(appName) {
    const browserApps = ['Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Arc'];
    return browserApps.includes(appName);
  }

  async detectNewSessionType(clipboardItem) {
    console.log(`SessionManager: Detecting session type for "${clipboardItem.content.substring(0, 30)}..."`);
    
    // Always try LangGraph first for intelligent session type detection
    try {
      if (this.aiService && this.aiService.langGraphClient) {
        console.log('  Using LangGraph for session type detection');
        
        const sessionTypeResult = await this.aiService.langGraphClient.executeWorkflow('session_type_detection', {
          content: clipboardItem.content,
          context: {
            sourceApp: clipboardItem.source_app,
            windowTitle: clipboardItem.window_title,
            screenshotPath: clipboardItem.screenshot_path
          }
        });

        console.log(`  LangGraph session type result: ${sessionTypeResult.sessionType}, confidence: ${sessionTypeResult.confidence}`);

        if (sessionTypeResult.sessionType && sessionTypeResult.confidence > 0.6) {
          console.log(`  → Creating new session type: ${sessionTypeResult.sessionType}`);
          return sessionTypeResult.sessionType;
        }
      } else {
        console.log('  LangGraph not available for session type detection');
      }
    } catch (error) {
      console.error('SessionManager: Session type detection failed:', error);
    }

    // Minimal fallback - only create sessions for very obvious patterns
    return this.detectNewSessionTypeMinimal(clipboardItem);
  }

  detectNewSessionTypeMinimal(clipboardItem) {
    // Improved fallback - detect obvious session types using keywords and patterns
    const content = clipboardItem.content.toLowerCase().trim();
    
    // Only create sessions for browser-based research
    if (this.isBrowserApp(clipboardItem.source_app)) {
      // Hotel research patterns
      const hotelKeywords = ['hotel', 'resort', 'inn', 'suite', 'booking', 'marriott', 'hilton', 'hyatt', 'sheraton', 'ritz', 'four seasons', 'shangri'];
      if (hotelKeywords.some(keyword => content.includes(keyword))) {
        console.log(`  → Creating hotel research session (keyword match)`);
        return 'hotel_research';
      }
      
      // Restaurant research patterns
      const restaurantKeywords = ['restaurant', 'menu', 'reservation', 'dining', 'cuisine', 'michelin', 'yelp'];
      if (restaurantKeywords.some(keyword => content.includes(keyword))) {
        console.log(`  → Creating restaurant research session (keyword match)`);
        return 'restaurant_research';
      }
      
      // Travel research patterns
      const travelKeywords = ['flight', 'airline', 'airport', 'vacation', 'trip', 'travel', 'destination'];
      if (travelKeywords.some(keyword => content.includes(keyword))) {
        console.log(`  → Creating travel research session (keyword match)`);
        return 'travel_research';
      }
      
      // Generic research for other browser content that looks like research
      if (content.length > 5 && content.length < 500 && 
          /[A-Z]/.test(content) && // Contains uppercase letters
          !content.startsWith('http')) { // Not a URL
        
        console.log(`  → Creating general research session (fallback pattern)`);
        return 'general_research';
      }
    }
    
    console.log(`  → No session type detected (minimal fallback)`);
    return null;
  }

  async createNewSession(sessionType, clipboardItem) {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    
    // Generate session label
    const sessionLabel = await this.generateSessionLabel(sessionType, clipboardItem);
    
    const stmt = this.database.db.prepare(`
      INSERT INTO clipboard_sessions (
        id, session_type, session_label, start_time, last_activity, status
      ) VALUES (?, ?, ?, ?, ?, 'active')
    `);
    
    stmt.run(sessionId, sessionType, sessionLabel, now, now);
    
    const session = {
      id: sessionId,
      session_type: sessionType,
      session_label: sessionLabel,
      start_time: now,
      last_activity: now,
      status: 'active'
    };
    
    this.activeSessions.set(sessionId, session);
    
    console.log(`SessionManager: Created new ${sessionType} session: ${sessionLabel}`);
    
    this.emit('session-created', { session, clipboardItem });
    
    return session;
  }

  async generateSessionLabel(sessionType, clipboardItem) {
    const labelTemplates = {
      hotel_research: 'Hotel Research',
      restaurant_research: 'Restaurant Research', 
      product_research: 'Product Research',
      academic_research: 'Academic Research',
      general_research: 'Research Session',
      travel_research: 'Travel Research'
    };
    
    let baseLabel = labelTemplates[sessionType] || 'Research Session';
    const content = clipboardItem.content;
    
    // For hotel research, prioritize location over specific hotel brand to encourage combination
    if (sessionType === 'hotel_research') {
      // Try to extract city names first (encourages combining all Toronto hotels)
      const cityMatch = content.match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas)\b/i);
      if (cityMatch) {
        baseLabel += ` - ${cityMatch[1]}`;
        return baseLabel;
      }
      
      // Only use hotel brand if no city found
      const hotelBrands = ['Hilton', 'Marriott', 'Hyatt', 'Sheraton', 'Ritz', 'Four Seasons', 'Shangri', 'Thompson', 'W Hotel', 'Westin', 'Renaissance'];
      for (const brand of hotelBrands) {
        if (content.includes(brand)) {
          baseLabel += ` - ${brand}`;
          return baseLabel;
        }
      }
    }
    
    // For other research types, extract relevant context
    if (sessionType === 'restaurant_research') {
      // Look for city first, then cuisine types
      const cityMatch = content.match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas)\b/i);
      if (cityMatch) {
        baseLabel += ` - ${cityMatch[1]}`;
        return baseLabel;
      }
      
      const cuisineMatch = content.match(/\b(Italian|French|Japanese|Chinese|Mexican|Thai|Indian|Mediterranean|Steakhouse)\b/i);
      if (cuisineMatch) {
        baseLabel += ` - ${cuisineMatch[1]}`;
        return baseLabel;
      }
    }
    
    // General location/proper noun extraction as fallback
    const properNounMatch = content.match(/\b([A-Z][a-z]{3,15})\b/);
    if (properNounMatch) {
      const properNoun = properNounMatch[1];
      // Filter out common words that aren't meaningful identifiers
      const commonWords = ['Hotel', 'Resort', 'Restaurant', 'The', 'And', 'For', 'With', 'About', 'This', 'That', 'From', 'Your', 'Our'];
      if (!commonWords.includes(properNoun) && properNoun.length < 20) {
        baseLabel += ` - ${properNoun}`;
      }
    }
    
    return baseLabel;
  }

  async addItemToSession(sessionId, clipboardItem) {
    const sequenceOrder = await this.getNextSequenceOrder(sessionId);
    
    const stmt = this.database.db.prepare(`
      INSERT OR REPLACE INTO session_members (
        session_id, clipboard_item_id, sequence_order
      ) VALUES (?, ?, ?)
    `);
    
    stmt.run(sessionId, clipboardItem.id, sequenceOrder);
    
    // Update session last activity
    const updateStmt = this.database.db.prepare(`
      UPDATE clipboard_sessions 
      SET last_activity = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    
    updateStmt.run(sessionId);
    
    console.log(`SessionManager: Added item ${clipboardItem.id} to session ${sessionId}`);
  }

  async getNextSequenceOrder(sessionId) {
    const stmt = this.database.db.prepare(`
      SELECT COALESCE(MAX(sequence_order), 0) + 1 as next_order
      FROM session_members 
      WHERE session_id = ?
    `);
    
    const result = stmt.get(sessionId);
    return result.next_order;
  }

  async updateSessionAnalysis(sessionId) {
    try {
      const sessionItems = await this.getSessionItems(sessionId);
      const session = await this.getSession(sessionId);
      
      if (sessionItems.length < 2) return; // Need at least 2 items for analysis
      
      if (this.aiService && this.aiService.langGraphClient) {
        // Use LangGraph for session analysis
        const analysisResult = await this.aiService.langGraphClient.executeWorkflow('session_analysis', {
          sessionType: session.session_type,
          items: sessionItems.map(item => ({
            content: item.content,
            sourceApp: item.source_app,
            windowTitle: item.window_title,
            timestamp: item.timestamp
          }))
        });
        
        // Update session with analysis
        const updateStmt = this.database.db.prepare(`
          UPDATE clipboard_sessions 
          SET context_summary = ?, intent_analysis = ?
          WHERE id = ?
        `);
        
        updateStmt.run(
          JSON.stringify(analysisResult.contextSummary),
          JSON.stringify(analysisResult.intentAnalysis),
          sessionId
        );
      }
    } catch (error) {
      console.error('SessionManager: Session analysis failed:', error);
    }
  }

  async getSession(sessionId) {
    const stmt = this.database.db.prepare('SELECT * FROM clipboard_sessions WHERE id = ?');
    return stmt.get(sessionId);
  }

  async getSessionItems(sessionId) {
    const stmt = this.database.db.prepare(`
      SELECT c.* FROM clipboard_items c
      JOIN session_members sm ON c.id = sm.clipboard_item_id
      WHERE sm.session_id = ?
      ORDER BY sm.sequence_order ASC
    `);
    
    return stmt.all(sessionId).map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]')
    }));
  }

  async getSessionItemCount(sessionId) {
    const stmt = this.database.db.prepare('SELECT COUNT(*) as count FROM session_members WHERE session_id = ?');
    const result = stmt.get(sessionId);
    return result.count;
  }

  async getActiveSessions() {
    // Return ALL sessions (active and expired) for persistent UI display
    const stmt = this.database.db.prepare(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      GROUP BY s.id
      ORDER BY s.last_activity DESC
    `);
    
    return stmt.all();
  }

  async getSessionsByType(sessionType) {
    const stmt = this.database.db.prepare(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      WHERE s.session_type = ?
      GROUP BY s.id
      ORDER BY s.last_activity DESC
    `);
    
    return stmt.all(sessionType);
  }

  cleanupExpiredSessions() {
    // Sessions never expire - they remain active indefinitely for persistent UI display
    // This ensures users always see their research sessions in the UI
    console.log('SessionManager: Session expiration disabled - all sessions remain active');
        return;
  }

  async triggerExternalAutomation(session, itemCount) {
    if (!this.externalApiService) {
      return; // External automation not configured
    }

    try {
      // Get session items for automation context
      const sessionItems = await this.getSessionItems(session.id);
      
      const sessionData = {
        sessionId: session.id,
        sessionType: session.session_type,
        sessionLabel: session.session_label,
        itemCount,
        items: sessionItems,
        lastActivity: session.last_activity,
        startTime: session.start_time
      };

      console.log(`SessionManager: Triggering external automation for session ${session.session_label} (${itemCount} items)`);
      
      const result = await this.externalApiService.processSessionUpdate(sessionData);
      
      if (result) {
        console.log(`  External automation triggered: ${result.workflowId}`);
        
        // Emit automation event
        this.emit('automation-triggered', {
          sessionId: session.id,
          sessionType: session.session_type,
          workflowId: result.workflowId,
          automationResult: result
        });
      }
      
    } catch (error) {
      console.error('SessionManager: External automation failed:', error);
      
      this.emit('automation-failed', {
        sessionId: session.id,
        sessionType: session.session_type,
        error: error.message
      });
    }
  }

  // External automation management
  enableExternalAutomation(externalApiService) {
    this.externalApiService = externalApiService;
    console.log('SessionManager: External automation enabled');
  }

  disableExternalAutomation() {
    this.externalApiService = null;
    console.log('SessionManager: External automation disabled');
  }

  isExternalAutomationEnabled() {
    return this.externalApiService !== null;
  }

  async clearAllSessions() {
    try {
      console.log('SessionManager: Clearing all sessions...');
      
      // Delete all session members first (due to foreign key constraints)
      const deleteSessionMembersStmt = this.database.db.prepare('DELETE FROM session_members');
      deleteSessionMembersStmt.run();
      
      // Delete all sessions
      const deleteSessionsStmt = this.database.db.prepare('DELETE FROM clipboard_sessions');
      const result = deleteSessionsStmt.run();
      
      // Clear in-memory sessions
      this.activeSessions.clear();
      
      console.log(`SessionManager: Cleared ${result.changes} sessions and all associated data`);
      
      // Emit event to notify UI
      this.emit('all-sessions-cleared');
      
      return { success: true, clearedSessions: result.changes };
    } catch (error) {
      console.error('SessionManager: Error clearing all sessions:', error);
      throw error;
    }
  }

  destroy() {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
  }
}

module.exports = SessionManager; 