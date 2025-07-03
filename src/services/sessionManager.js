const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class SessionManager extends EventEmitter {
  constructor(database, aiService, externalApiService = null, workflowEngine = null, aiSummarizer) {
    super();
    this.database = database;
    this.aiService = aiService;
    this.externalApiService = externalApiService;
    this.workflowEngine = workflowEngine;
    this.aiSummarizer = aiSummarizer;
    this.activeSessions = new Map();
    this.sessionTimeout = 60 * 60 * 1000; // 1 hour in milliseconds (was 10 minutes)
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
    console.log(`SessionManager: Source app: ${clipboardItem.source_app}, Window: ${clipboardItem.window_title}`);
    
    try {
      // Ensure clipboard item exists in database before session processing
      console.log(`SessionManager: Ensuring clipboard item ${clipboardItem.id} exists in database...`);
      await this.ensureClipboardItemInDatabase(clipboardItem);
      console.log(`SessionManager: Clipboard item saved to database successfully`);
      
      // Analyze potential session membership
      console.log(`SessionManager: Finding session candidates...`);
      const sessionCandidates = await this.findSessionCandidates(clipboardItem);
      console.log(`SessionManager: Found ${sessionCandidates.length} session candidates`);
      
      let targetSession = null;
      
      if (sessionCandidates.length > 0) {
        console.log(`SessionManager: Found ${sessionCandidates.length} candidates, evaluating membership...`);
        // Check if item belongs to existing session (including inactive ones)
        targetSession = await this.evaluateSessionMembership(clipboardItem, sessionCandidates);
        if (targetSession) {
          console.log(`SessionManager: Item belongs to existing session ${targetSession.id} (${targetSession.session_type})`);
      } else {
          console.log(`SessionManager: Item does not belong to any existing session`);
        }
      }
      
      if (!targetSession) {
        console.log(`SessionManager: No existing session found, creating new standalone session...`);
        // Create a new standalone session immediately (marked as inactive)
        targetSession = await this.createStandaloneSession(clipboardItem);
        if (targetSession) {
          console.log(`SessionManager: Created new standalone session ${targetSession.id} (inactive until second item joins)`);
      } else {
          console.log(`SessionManager: Failed to create standalone session`);
        }
      }
      
      if (targetSession) {
        console.log(`SessionManager: Adding item ${clipboardItem.id} to session ${targetSession.id}`);
        // Add item to session (this will also trigger automatic research)
        await this.addItemToSession(targetSession.id, clipboardItem);
        console.log(`SessionManager: Item added to session successfully`);
        
        // Check if this addition activates the session
        const sessionItemCount = await this.getSessionItemCount(targetSession.id);
        if (sessionItemCount >= 2 && targetSession.status === 'inactive') {
          console.log(`SessionManager: Session ${targetSession.id} now has ${sessionItemCount} items - activating session`);
          await this.activateSession(targetSession.id);
        }
        
        // Emit session updated event
        this.emit('session-updated', {
          sessionId: targetSession.id,
          sessionType: targetSession.session_type,
          itemCount: sessionItemCount,
          newItem: clipboardItem,
          sessionActivated: sessionItemCount >= 2 && targetSession.status === 'inactive'
        });
        console.log(`SessionManager: Session-updated event emitted`);
      } else {
        console.log(`SessionManager: No session created or found, item remains standalone`);
      }
      
    } catch (error) {
      console.error('SessionManager: Error processing clipboard item for session detection:', error);
    }
  }

  async ensureClipboardItemInDatabase(clipboardItem) {
    try {
      // Check if the clipboard item already exists
      const existingItem = await this.database.getClipboardItem(clipboardItem.id);
      
      if (!existingItem) {
        console.log(`SessionManager: Saving clipboard item ${clipboardItem.id} to database for session processing`);
        await this.database.saveClipboardItem(clipboardItem);
      } else {
        console.log(`SessionManager: Clipboard item ${clipboardItem.id} already exists in database`);
      }
    } catch (error) {
      console.error('SessionManager: Error ensuring clipboard item in database:', error);
      throw error;
    }
  }

  async findSessionCandidates(clipboardItem) {
    const currentTime = new Date();
    const timeWindow = new Date(currentTime.getTime() - this.sessionTimeout);
    
    console.log(`SessionManager: Looking for candidates - current time: ${currentTime.toISOString()}, window: ${timeWindow.toISOString()}`);
    
    // Get both active and inactive sessions within time window
    // Include inactive sessions so new items can be matched to standalone sessions
    const stmt = this.database.db.prepare(`
      SELECT * FROM clipboard_sessions 
      WHERE (status = 'active' OR status = 'inactive') 
      AND datetime(last_activity) >= datetime(?)
      ORDER BY datetime(last_activity) DESC
    `);
    
    const candidates = stmt.all(timeWindow.toISOString());
    console.log(`SessionManager: Found ${candidates.length} session candidates (active and inactive) within ${this.sessionTimeout / 1000}s`);
    
    candidates.forEach(session => {
      console.log(`  Candidate: ${session.session_label} (${session.session_type}) - status: ${session.status} - last activity: ${session.last_activity}`);
    });
    
    return candidates;
  }

  async evaluateSessionMembership(clipboardItem, sessionCandidates) {
    console.log(`SessionManager: Evaluating membership for "${clipboardItem.content.substring(0, 30)}..." against ${sessionCandidates.length} session candidates`);
    
    // Try LangGraph analysis first for intelligent membership evaluation
      if (this.aiService && this.aiService.langGraphClient) {
      console.log('  Using LangGraph for intelligent session membership evaluation...');
          
      for (const session of sessionCandidates) {
        try {
          const sessionItems = await this.getSessionItems(session.id);
          console.log(`    Evaluating membership in session: ${session.session_label} (${session.session_type}) with ${sessionItems.length} items`);
          
          const membershipResult = await this.aiService.langGraphClient.executeWorkflow('session_management', {
            content: clipboardItem.content,
            context: {
              sourceApp: clipboardItem.source_app,
              windowTitle: clipboardItem.window_title,
              screenshotPath: clipboardItem.screenshot_path
            },
            existingSession: {
              type: session.session_type,
              label: session.session_label,
              items: sessionItems.map(item => ({
                content: item.content,
                sourceApp: item.source_app,
                windowTitle: item.window_title,
                timestamp: item.timestamp
              }))
            }
          });

          console.log(`    LangGraph membership result:`, membershipResult);
          console.log(`    Membership confidence: ${membershipResult?.membershipConfidence}, belongs: ${membershipResult?.belongsToSession}`);

          // Enhanced criteria: accept high confidence OR detect cross-session-type themes
          if (membershipResult?.belongsToSession) {
            if (membershipResult.membershipConfidence > 0.6) {
              console.log(`    ✅ High confidence membership (${membershipResult.membershipConfidence}) - joining session`);
              return session;
            } else if (membershipResult.membershipConfidence > 0.4 && this.detectCrossSessionTheme(clipboardItem, session, sessionItems)) {
              console.log(`    ✅ Cross-session theme detected with moderate confidence (${membershipResult.membershipConfidence}) - joining session`);
            return session;
          }
        }

          // Check for thematic compatibility even with different session types
          if (membershipResult.membershipConfidence > 0.3) {
            const themeCompatibility = await this.evaluateThematicCompatibility(clipboardItem, session, sessionItems);
            if (themeCompatibility.isCompatible) {
              console.log(`    ✅ Thematic compatibility detected: ${themeCompatibility.theme} - joining session across types`);
              // Update session type to be more general if joining across types
              if (session.session_type !== themeCompatibility.suggestedSessionType) {
                await this.updateSessionType(session.id, themeCompatibility.suggestedSessionType, themeCompatibility.theme);
      }
              return session;
            }
          }

    } catch (error) {
          console.log(`    Error in LangGraph membership evaluation for session ${session.id}:`, error.message);
    }
      }
    }

    console.log('  Falling back to enhanced pattern-based membership evaluation...');
    // Enhanced fallback with theme detection
    return this.evaluateSessionMembershipWithThemes(clipboardItem, sessionCandidates);
  }

  async evaluateThematicCompatibility(clipboardItem, session, sessionItems) {
    try {
      console.log(`    Evaluating thematic compatibility between new item and session ${session.session_label}`);
      
      if (this.aiService && this.aiService.langGraphClient) {
        const themeAnalysis = await this.aiService.langGraphClient.executeWorkflow('session_management', {
          content: `Theme Analysis: New item "${clipboardItem.content.substring(0, 100)}..." vs Session "${session.session_label}" with items: ${sessionItems.map(item => item.content.substring(0, 50)).join('; ')}`,
          context: {
            sourceApp: 'ThemeAnalyzer',
            windowTitle: 'Cross-Session Theme Detection',
            analysisType: 'thematic_compatibility'
          },
          existingSession: {
            type: session.session_type,
            label: session.session_label,
            items: sessionItems.map(item => ({
              content: item.content,
              sourceApp: item.source_app,
              windowTitle: item.window_title
            }))
          }
        });

        // Extract theme information from the analysis
        const sessionReasoning = themeAnalysis?.sessionReasoning || '';
        const intentAnalysis = themeAnalysis?.intentAnalysis || {};
        
        // Look for location-based themes
        const locationThemes = this.extractLocationThemes(clipboardItem, sessionItems);
        if (locationThemes.commonLocation) {
          return {
            isCompatible: true,
            theme: `${locationThemes.commonLocation} Planning`,
            suggestedSessionType: 'travel_planning',
            reasoning: `Both involve ${locationThemes.commonLocation} - combining travel planning activities`,
            confidence: 0.8
          };
        }

        // Look for event-based themes
        const eventThemes = this.extractEventThemes(clipboardItem, sessionItems);
        if (eventThemes.commonEvent) {
          return {
            isCompatible: true,
            theme: `${eventThemes.commonEvent} Planning`,
            suggestedSessionType: 'event_planning',
            reasoning: `Both related to ${eventThemes.commonEvent}`,
            confidence: 0.75
          };
        }

        // Look for temporal themes (same time period)
        const temporalThemes = this.extractTemporalThemes(clipboardItem, sessionItems);
        if (temporalThemes.commonTimeframe) {
          return {
            isCompatible: true,
            theme: `${temporalThemes.commonTimeframe} Planning`,
            suggestedSessionType: 'general_planning',
            reasoning: `Activities planned for ${temporalThemes.commonTimeframe}`,
            confidence: 0.65
          };
        }

        // Look for project/work themes
        const projectThemes = this.extractProjectThemes(clipboardItem, sessionItems);
        if (projectThemes.commonProject) {
          return {
            isCompatible: true,
            theme: `${projectThemes.commonProject}`,
            suggestedSessionType: 'project_research',
            reasoning: `Related to ${projectThemes.commonProject} project`,
            confidence: 0.7
          };
        }
      }

      return { isCompatible: false };
    } catch (error) {
      console.log('    Theme compatibility analysis failed:', error.message);
      return { isCompatible: false };
    }
  }

  // Location-based theme detection
  extractLocationThemes(clipboardItem, sessionItems) {
    const locations = ['Toronto', 'Montreal', 'Vancouver', 'New York', 'Los Angeles', 'Chicago', 'Boston', 'Austin', 'Miami', 'Seattle', 'Portland', 'Denver', 'Las Vegas', 'San Francisco', 'Washington', 'Philadelphia', 'Phoenix', 'Dallas', 'Houston', 'Atlanta'];
    
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const location of locations) {
      const locationLower = location.toLowerCase();
      if (newItemContent.includes(locationLower) && sessionContent.includes(locationLower)) {
        console.log(`      Found common location theme: ${location}`);
        return { commonLocation: location };
      }
    }
    
    return {};
  }

  // Event-based theme detection
  extractEventThemes(clipboardItem, sessionItems) {
    const events = ['wedding', 'conference', 'meeting', 'vacation', 'trip', 'business trip', 'honeymoon', 'anniversary', 'birthday', 'graduation', 'interview', 'presentation'];
    
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const event of events) {
      if (newItemContent.includes(event) && sessionContent.includes(event)) {
        console.log(`      Found common event theme: ${event}`);
        return { commonEvent: event };
      }
    }
    
    return {};
  }

  // Temporal theme detection
  extractTemporalThemes(clipboardItem, sessionItems) {
    const timeframes = ['next week', 'next month', 'this weekend', 'next weekend', 'december', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', '2024', '2025'];
    
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const timeframe of timeframes) {
      if (newItemContent.includes(timeframe) && sessionContent.includes(timeframe)) {
        console.log(`      Found common temporal theme: ${timeframe}`);
        return { commonTimeframe: timeframe };
      }
    }
    
    return {};
  }

  // Project theme detection
  extractProjectThemes(clipboardItem, sessionItems) {
    const projects = ['website', 'app', 'presentation', 'report', 'proposal', 'research', 'analysis', 'study', 'design', 'development'];
    
    const newItemContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    for (const project of projects) {
      if (newItemContent.includes(project) && sessionContent.includes(project)) {
        console.log(`      Found common project theme: ${project}`);
        return { commonProject: project };
      }
    }
    
    return {};
  }

  async updateSessionType(sessionId, newSessionType, newTheme) {
    try {
      console.log(`    Updating session ${sessionId} type from existing to ${newSessionType} with theme: ${newTheme}`);
      
      const updateStmt = this.database.db.prepare(`
        UPDATE clipboard_sessions 
        SET session_type = ?, session_label = ?, last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      updateStmt.run(newSessionType, newTheme, sessionId);
      
      console.log(`    ✅ Session type updated to ${newSessionType} with label: ${newTheme}`);
    } catch (error) {
      console.error('    Error updating session type:', error);
    }
  }

  detectCrossSessionTheme(clipboardItem, session, sessionItems) {
    console.log(`    Detecting cross-session themes between ${clipboardItem.content.substring(0, 30)}... and session ${session.session_label}`);
    
    // Quick pattern-based theme detection
    const newContent = clipboardItem.content.toLowerCase();
    const sessionContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    // Location-based themes
    const locationMatch = this.extractLocationThemes(clipboardItem, sessionItems);
    if (locationMatch.commonLocation) {
      console.log(`      ✅ Location theme detected: ${locationMatch.commonLocation}`);
      return true;
    }
    
    // Event-based themes
    const eventMatch = this.extractEventThemes(clipboardItem, sessionItems);
    if (eventMatch.commonEvent) {
      console.log(`      ✅ Event theme detected: ${eventMatch.commonEvent}`);
      return true;
    }
    
    // Check for complementary session types (hotel + restaurant = travel planning)
    const complementaryTypes = {
      'hotel_research': ['restaurant_research', 'travel_research', 'general_research'],
      'restaurant_research': ['hotel_research', 'travel_research', 'general_research'],
      'travel_research': ['hotel_research', 'restaurant_research', 'general_research'],
      'product_research': ['general_research'],
      'academic_research': ['general_research']
    };
    
    const currentType = this.detectNewSessionTypeMinimal(clipboardItem);
    if (complementaryTypes[session.session_type]?.includes(currentType)) {
      console.log(`      ✅ Complementary session types detected: ${session.session_type} + ${currentType}`);
      return true;
    }
    
    return false;
  }

  async evaluateSessionMembershipWithThemes(clipboardItem, sessionCandidates) {
    console.log('  Enhanced pattern-based evaluation with theme detection...');
    
    for (const session of sessionCandidates) {
      console.log(`    Checking session: ${session.session_label} (${session.session_type})`);
      
      const sessionItems = await this.getSessionItems(session.id);
      const timeDiff = new Date() - new Date(session.last_activity);
      
      // First check exact session type membership (existing logic)
      const exactMatch = this.evaluateSessionMembershipMinimal(clipboardItem, [session]);
      if (exactMatch) {
        console.log(`      ✅ Exact session type match found`);
        return exactMatch;
      }
      
      // Then check thematic compatibility with extended time window
      if (timeDiff < 2 * 60 * 60 * 1000) { // 2 hours for theme-based matching
        const themeCompatibility = await this.evaluateThematicCompatibility(clipboardItem, session, sessionItems);
        if (themeCompatibility.isCompatible) {
          console.log(`      ✅ Thematic compatibility found: ${themeCompatibility.theme}`);
          
          // Update session to reflect the broader theme
          await this.updateSessionType(session.id, themeCompatibility.suggestedSessionType, themeCompatibility.theme);
          
          // Return the updated session info
          return {
            ...session,
            session_type: themeCompatibility.suggestedSessionType,
            session_label: themeCompatibility.theme
          };
      }
    }
    
      console.log(`      ❌ No membership found for session ${session.session_label}`);
    }
    
    return null;
  }

  isBrowserApp(appName) {
    const browserApps = ['Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Arc'];
    return browserApps.includes(appName);
  }

  async detectNewSessionType(clipboardItem) {
    console.log(`SessionManager: Detecting session type for "${clipboardItem.content.substring(0, 30)}..."`);
    console.log(`SessionManager: Source app: ${clipboardItem.source_app}`);
    console.log(`SessionManager: Window title: ${clipboardItem.window_title}`);
    
    // Always try LangGraph first for intelligent session type detection
    try {
      if (this.aiService && this.aiService.langGraphClient) {
        console.log('  Using LangGraph for session type detection');
        console.log('  LangGraph client available:', !!this.aiService.langGraphClient);
        
        const sessionTypeResult = await this.aiService.langGraphClient.executeWorkflow('session_type_detection', {
          content: clipboardItem.content,
          context: {
            sourceApp: clipboardItem.source_app,
            windowTitle: clipboardItem.window_title,
            screenshotPath: clipboardItem.screenshot_path
          }
        });

        console.log(`  LangGraph session type result:`, sessionTypeResult);
        console.log(`  Session type: ${sessionTypeResult?.sessionType}, confidence: ${sessionTypeResult?.sessionConfidence}`);

        if (sessionTypeResult && sessionTypeResult.sessionType && sessionTypeResult.sessionConfidence > 0.6) {
          console.log(`  → Creating new session type via LangGraph: ${sessionTypeResult.sessionType}`);
          return sessionTypeResult.sessionType;
        } else {
          console.log(`  → LangGraph confidence too low (${sessionTypeResult?.sessionConfidence}) or no session type detected`);
        }
      } else {
        console.log('  LangGraph not available for session type detection');
        console.log('  AIService available:', !!this.aiService);
        console.log('  LangGraph client available:', !!this.aiService?.langGraphClient);
      }
    } catch (error) {
      console.error('SessionManager: Session type detection failed:', error);
      console.error('Error details:', error.message);
    }

    console.log('  Falling back to minimal session type detection...');
    // Minimal fallback - only create sessions for very obvious patterns
    const result = this.detectNewSessionTypeMinimal(clipboardItem);
    console.log(`  Minimal detection result: ${result}`);
    return result;
  }

  detectNewSessionTypeMinimal(clipboardItem) {
    // Improved fallback - detect obvious session types using keywords and patterns
    const content = clipboardItem.content.toLowerCase().trim();
    console.log(`  Minimal detection - Content length: ${content.length}`);
    console.log(`  Minimal detection - Source app: ${clipboardItem.source_app}`);
    console.log(`  Minimal detection - Is browser app: ${this.isBrowserApp(clipboardItem.source_app)}`);
    
    // Only create sessions for browser-based research
    if (this.isBrowserApp(clipboardItem.source_app)) {
      console.log(`  → Browser app detected, checking content patterns...`);
      
      // Hotel research patterns
      const hotelKeywords = ['hotel', 'resort', 'inn', 'suite', 'booking', 'marriott', 'hilton', 'hyatt', 'sheraton', 'ritz', 'four seasons', 'shangri'];
      const hasHotelKeyword = hotelKeywords.some(keyword => {
        const found = content.includes(keyword);
        if (found) console.log(`    Found hotel keyword: ${keyword}`);
        return found;
      });
      
      if (hasHotelKeyword) {
        console.log(`  → Creating hotel research session (keyword match)`);
        return 'hotel_research';
      }
      
      // Restaurant research patterns
      const restaurantKeywords = ['restaurant', 'menu', 'reservation', 'dining', 'cuisine', 'michelin', 'yelp'];
      const hasRestaurantKeyword = restaurantKeywords.some(keyword => {
        const found = content.includes(keyword);
        if (found) console.log(`    Found restaurant keyword: ${keyword}`);
        return found;
      });
      
      if (hasRestaurantKeyword) {
        console.log(`  → Creating restaurant research session (keyword match)`);
        return 'restaurant_research';
      }
      
      // Travel research patterns
      const travelKeywords = ['flight', 'airline', 'airport', 'vacation', 'trip', 'travel', 'destination'];
      const hasTravelKeyword = travelKeywords.some(keyword => {
        const found = content.includes(keyword);
        if (found) console.log(`    Found travel keyword: ${keyword}`);
        return found;
      });
      
      if (hasTravelKeyword) {
        console.log(`  → Creating travel research session (keyword match)`);
        return 'travel_research';
      }
      
      // Generic research for other browser content that looks like research
      const hasUppercase = /[A-Z]/.test(content);
      const notUrl = !content.startsWith('http');
      const goodLength = content.length > 5 && content.length < 500;
      
      console.log(`    Generic research check - Length OK: ${goodLength}, Has uppercase: ${hasUppercase}, Not URL: ${notUrl}`);
      
      if (goodLength && hasUppercase && notUrl) {
        console.log(`  → Creating general research session (fallback pattern)`);
        return 'general_research';
      }
    } else {
      console.log(`  → Not a browser app, skipping session creation`);
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
    
    // Always update session metadata for the new item (regardless of research capability)
    await this.updateSessionMetadataForNewItem(sessionId, clipboardItem);
    
    // Check session size to determine if comprehensive research should run
    const sessionItemCount = await this.getSessionItemCount(sessionId);
    console.log(`SessionManager: Session now has ${sessionItemCount} items`);
    
    // Trigger comprehensive session research if session has 2+ items
    if (sessionItemCount >= 2) {
      console.log(`SessionManager: Session has ${sessionItemCount} items - triggering comprehensive session research`);
      
      // Run comprehensive session research (non-blocking)
      this.performSessionResearch(sessionId).catch(error => {
        console.error('SessionManager: Background comprehensive session research failed:', error);
      });
    } else {
      console.log(`SessionManager: Session only has ${sessionItemCount} item - skipping comprehensive research`);
    }
  }

  async updateSessionMetadataForNewItem(sessionId, clipboardItem) {
    try {
      console.log(`SessionManager: Updating session metadata for item ${clipboardItem.id} (regardless of research)`);
      
      // Get current session data
      const session = await this.getSession(sessionId);
      const sessionItems = await this.getSessionItems(sessionId);
      
      // Parse existing context summary
      let contextSummary = {};
      if (session.context_summary) {
        try {
          contextSummary = JSON.parse(session.context_summary);
        } catch (parseError) {
          console.log('SessionManager: Failed to parse existing context summary, starting fresh');
          contextSummary = {};
        }
      }

      // Parse existing intent analysis
      let intentAnalysis = {};
      if (session.intent_analysis) {
        try {
          intentAnalysis = JSON.parse(session.intent_analysis);
        } catch (parseError) {
          console.log('SessionManager: Failed to parse existing intent analysis, starting fresh');
          intentAnalysis = {};
        }
      }

      // Update basic session statistics (always, regardless of research)
      if (!contextSummary.sessionProgress) {
        contextSummary.sessionProgress = {
          totalItems: sessionItems.length,
          researchedItems: 0,
          nonResearchItems: 0,
          lastUpdated: new Date().toISOString()
        };
      } else {
        contextSummary.sessionProgress.totalItems = sessionItems.length;
        contextSummary.sessionProgress.lastUpdated = new Date().toISOString();
      }

      // Track all items, not just researched ones
      if (!contextSummary.allItems) {
        contextSummary.allItems = [];
      }
      
      // Add current item to the items list
      contextSummary.allItems.push({
        clipboardItemId: clipboardItem.id,
        sourceApp: clipboardItem.source_app,
        windowTitle: clipboardItem.window_title,
        timestamp: new Date().toISOString(),
        hasResearch: false // Will be updated later if research completes
      });

      // Keep only the 10 most recent items
      contextSummary.allItems = contextSummary.allItems.slice(-10);

      // Generate basic session summary that includes all items
      const sessionType = session.session_type.replace('_', ' ');
      const itemTypes = this.analyzeItemTypes(sessionItems);
      const sourceApps = [...new Set(sessionItems.map(item => item.source_app))];
      
      // Create inclusive session summary
      let basicSummary = `${sessionType} session with ${sessionItems.length} item${sessionItems.length > 1 ? 's' : ''}`;
      
      if (itemTypes.length > 0) {
        basicSummary += ` (${itemTypes.join(', ')})`;
      }
      
      if (sourceApps.length > 0) {
        basicSummary += ` from ${sourceApps.join(', ')}`;
      }

      // Only override session summary if we don't have a research-enhanced one
      if (!contextSummary.sessionSummary || !contextSummary.researchFindings) {
        contextSummary.sessionSummary = basicSummary;
      }

      // Update intent analysis with basic item analysis
      if (!intentAnalysis.basicAnalysis) {
        intentAnalysis.basicAnalysis = {};
      }
      
      intentAnalysis.basicAnalysis = {
        totalItems: sessionItems.length,
        contentTypes: itemTypes,
        sourceApplications: sourceApps,
        timespan: this.calculateSessionTimespan(sessionItems),
        lastUpdated: new Date().toISOString()
      };

      // Extract keywords from all content (not just research results)
      const allMetadata = sessionItems.map(item => `${item.source_app} ${item.window_title}`).join(' ');
      const basicKeywords = this.extractBasicKeywords(allMetadata);
      
      if (!intentAnalysis.contentKeywords) {
        intentAnalysis.contentKeywords = [];
      }
      
      // Merge new keywords with existing ones
      intentAnalysis.contentKeywords = [...new Set([...intentAnalysis.contentKeywords, ...basicKeywords])].slice(0, 15);

      // Save updated session data
      const updateStmt = this.database.db.prepare(`
        UPDATE clipboard_sessions 
        SET context_summary = ?, intent_analysis = ?, last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      updateStmt.run(
        JSON.stringify(contextSummary),
        JSON.stringify(intentAnalysis),
        sessionId
      );

      console.log('SessionManager: Successfully updated session metadata for new item');
      console.log(`SessionManager: Session now has ${sessionItems.length} total items with comprehensive tracking`);

    } catch (error) {
      console.error('SessionManager: Error updating session metadata for new item:', error);
    }
  }

  // Helper method to analyze content types of items
  analyzeItemTypes(sessionItems) {
    const types = new Set();
    
    sessionItems.forEach(item => {
      const content = item.content.toLowerCase();
      
      // Basic content type detection
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

  // Helper method to calculate session timespan
  calculateSessionTimespan(sessionItems) {
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

  // Helper method to extract basic keywords from content
  extractBasicKeywords(content) {
    // Simple keyword extraction from content
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'said', 'each', 'which', 'their', 'what', 'about', 'would', 'there', 'could', 'other', 'more'].includes(word));
    
    // Count word frequency
    const wordCounts = {};
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    // Return top keywords
    return Object.entries(wordCounts)
      .filter(([word, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  }



  async updateSessionWithResearchResults(sessionId, structuredResults) {
    try {
      console.log(`SessionManager: Updating session ${sessionId} with comprehensive research results`);
      
      // Get current session data
      const session = await this.getSession(sessionId);
      
      // Parse existing session data
      let contextSummary = {};
      let intentAnalysis = {};
      
      if (session.context_summary) {
        try {
          contextSummary = JSON.parse(session.context_summary);
        } catch (parseError) {
          contextSummary = {};
        }
      }
      
      if (session.intent_analysis) {
        try {
          intentAnalysis = JSON.parse(session.intent_analysis);
        } catch (parseError) {
          intentAnalysis = {};
        }
      }

      // Update context summary with session research (map ConsolidatedSessionSummarizer fields)
      contextSummary.sessionResearch = {
        researchCompleted: true,
        researchType: 'comprehensive_session_research',
        researchObjective: structuredResults.researchObjective,
        keyFindings: structuredResults.keyFindings,
        comprehensiveSummary: structuredResults.summary, // ConsolidatedSessionSummarizer returns 'summary'
        totalSources: structuredResults.totalSources,
        researchQuality: structuredResults.researchQuality,
        entitiesResearched: structuredResults.entitiesResearched,
        aspectsCovered: structuredResults.aspectsCovered,
        researchData: {
          ...structuredResults.researchData,
          confidence: structuredResults.researchData?.confidenceLevel || 0.7, // UI expects 'confidence' not 'confidenceLevel'
          totalSources: structuredResults.totalSources,
          sources: structuredResults.researchData?.sources || []
        },
        lastResearched: structuredResults.timestamp
      };

      // Update session summary with research insights (use the summary field)
      contextSummary.sessionSummary = structuredResults.summary;

      // Update intent analysis with research-based insights (map individual fields)
      intentAnalysis.sessionIntent = {
        primaryGoal: structuredResults.primaryIntent,
        researchObjective: structuredResults.researchObjective,
        researchGoals: structuredResults.researchGoals,
        nextSteps: structuredResults.nextSteps, // UI expects 'nextSteps' not 'nextActions'
        progressStatus: 'research_completed',
        confidenceLevel: structuredResults.researchData?.confidenceLevel || 0.7,
        analysisReasoning: `Comprehensive research analysis covering ${structuredResults.aspectsCovered?.join(', ') || 'multiple aspects'}`
      };
      
      // Add research metrics for UI display
      intentAnalysis.researchMetrics = {
        totalFindings: structuredResults.keyFindings?.length || 0,
        totalSources: structuredResults.totalSources || 0,
        researchQuality: structuredResults.researchQuality || 'moderate',
        entitiesCount: structuredResults.entitiesResearched?.length || 0,
        aspectsCount: structuredResults.aspectsCovered?.length || 0,
        confidenceLevel: structuredResults.researchData?.confidenceLevel || 0.7
      };
      
      intentAnalysis.researchBased = true;
      intentAnalysis.lastUpdated = structuredResults.timestamp;

      // Generate focused session title based on research findings
      const focusedTitle = this.generateFocusedSessionTitle(session, structuredResults);
      
      // Save updated session data with new title
      const updateStmt = this.database.db.prepare(`
        UPDATE clipboard_sessions 
        SET session_label = ?, context_summary = ?, intent_analysis = ?, last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      updateStmt.run(
        focusedTitle,
        JSON.stringify(contextSummary),
        JSON.stringify(intentAnalysis),
        sessionId
      );

      console.log(`SessionManager: Successfully updated session with research results and new title: "${focusedTitle}"`);
      console.log(`SessionManager: Updated fields - Summary: ${!!structuredResults.summary}, Objective: ${!!structuredResults.researchObjective}, Intent: ${!!structuredResults.primaryIntent}`);
      console.log(`SessionManager: Research metrics - Findings: ${structuredResults.keyFindings?.length || 0}, Sources: ${structuredResults.totalSources || 0}, Quality: ${structuredResults.researchQuality || 'unknown'}`);

    } catch (error) {
      console.error('SessionManager: Error updating session with research results:', error);
    }
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
        console.log(`SessionManager: External automation triggered successfully: ${result.workflowId}`);
        
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

  async updateComprehensiveSessionAnalysis(sessionId) {
    try {
      console.log(`SessionManager: Running comprehensive session analysis for session ${sessionId}`);
      
      // Get current session and all its items
      const session = await this.getSession(sessionId);
      const sessionItems = await this.getSessionItems(sessionId);
      
      if (sessionItems.length === 0) {
        console.log('SessionManager: No items in session, skipping comprehensive analysis');
        return;
      }

      console.log(`SessionManager: Analyzing ${sessionItems.length} items in session`);

      // Collect all research results from session items
      const sessionItemsWithResearch = [];
      const allResearchFindings = [];
      const allKeywords = [];
      const allSources = [];
      let researchedItemCount = 0;
      let nonResearchedItemCount = 0;
      
      for (const item of sessionItems) {
        let analysisData = null;
        let hasResearch = false;
        
        if (item.analysis_data) {
          try {
            analysisData = JSON.parse(item.analysis_data);
            
            // Extract research results from workflow results
            if (analysisData.workflowResults && analysisData.workflowResults.research) {
              const researchResults = analysisData.workflowResults.research;
              for (const research of researchResults) {
                if (research.researchSummary) {
                  hasResearch = true;
                  allResearchFindings.push({
                    itemId: item.id,
                    summary: research.researchSummary,
                    keyFindings: research.keyFindings || [],
                    sources: research.sources || [],
                    timestamp: research.timestamp,
                    sourceApp: item.source_app,
                    contentType: analysisData.contentType || 'unknown'
                  });
                  
                  // Collect keywords and sources
                  if (research.keyFindings) allKeywords.push(...research.keyFindings);
                  if (research.sources) allSources.push(...research.sources);
                }
              }
            }
          } catch (parseError) {
            console.log(`SessionManager: Error parsing analysis data for item ${item.id}:`, parseError.message);
          }
        }
        
        if (hasResearch) {
          researchedItemCount++;
        } else {
          nonResearchedItemCount++;
        }
        
        sessionItemsWithResearch.push({
          ...item,
          analysisData,
          hasResearch
        });
      }

      console.log(`SessionManager: Found ${allResearchFindings.length} research findings across ${sessionItems.length} items`);
      console.log(`SessionManager: ${researchedItemCount} items with research, ${nonResearchedItemCount} reference items`);

      // Generate comprehensive session analysis using LangGraph if available
      let comprehensiveAnalysis = null;
      if (this.aiService && this.aiService.langGraphClient) {
        console.log('SessionManager: Running comprehensive session workflow analysis...');
        
        try {
          // Include ALL items in the analysis, not just those with research
          const basicKeywords = this.extractBasicKeywords(sessionItems.map(item => `${item.source_app} ${item.window_title}`).join(' '));
          
          comprehensiveAnalysis = await this.aiService.langGraphClient.executeWorkflow('session_management', {
            content: `Comprehensive Session Analysis for ${session.session_type}: ${session.session_label}`,
            context: {
              sourceApp: 'SessionManager',
              windowTitle: `Session Analysis - ${session.session_label}`,
              sessionData: {
                sessionType: session.session_type,
                itemCount: sessionItems.length,
                researchedItems: researchedItemCount,
                nonResearchItems: nonResearchedItemCount,
                researchFindings: allResearchFindings,
                totalSources: allSources.length,
                keyTopics: [...new Set([...allKeywords, ...basicKeywords])].slice(0, 15),
                contentTypes: this.analyzeItemTypes(sessionItems),
                sourceApps: [...new Set(sessionItems.map(item => item.source_app))],
                timespan: this.calculateSessionTimespan(sessionItems)
              }
            },
            existingSession: {
              type: session.session_type,
              label: session.session_label,
              items: sessionItemsWithResearch.map(item => ({
                sourceApp: item.source_app,
                windowTitle: item.window_title,
                hasResearch: item.hasResearch,
                timestamp: item.timestamp,
                contentType: item.analysisData?.contentType || 'unknown'
              }))
            }
          });
          
          console.log('SessionManager: Comprehensive session analysis completed');
        } catch (error) {
          console.error('SessionManager: Comprehensive session analysis failed:', error);
        }
      }

      // Update session with comprehensive analysis
      let contextSummary = {};
      let intentAnalysis = {};
      
      // Parse existing session data
      if (session.context_summary) {
        try {
          contextSummary = JSON.parse(session.context_summary);
        } catch (parseError) {
          contextSummary = {};
        }
      }
      
      if (session.intent_analysis) {
        try {
          intentAnalysis = JSON.parse(session.intent_analysis);
        } catch (parseError) {
          intentAnalysis = {};
        }
      }

      // Update context summary with comprehensive findings (includes all items)
      contextSummary.comprehensiveAnalysis = {
        totalItems: sessionItems.length,
        researchedItems: researchedItemCount,
        nonResearchItems: nonResearchedItemCount,
        researchFindings: allResearchFindings.length,
        totalSources: allSources.length,
        keyTopics: [...new Set([...allKeywords, ...this.extractBasicKeywords(sessionItems.map(item => `${item.source_app} ${item.window_title}`).join(' '))])].slice(0, 15),
        contentTypes: this.analyzeItemTypes(sessionItems),
        sourceApplications: [...new Set(sessionItems.map(item => item.source_app))],
        timespan: this.calculateSessionTimespan(sessionItems),
        lastAnalyzed: new Date().toISOString(),
        sessionProgress: {
          researchCoverage: sessionItems.length > 0 ? Math.round((researchedItemCount / sessionItems.length) * 100) : 0,
          informationDensity: allSources.length > 10 ? 'high' : allSources.length > 5 ? 'medium' : 'low',
          analysisQuality: comprehensiveAnalysis ? 'ai-enhanced' : 'basic'
        }
      };

      // Create consolidated session summary that includes all items
      if (sessionItems.length > 0) {
        const sessionType = session.session_type.replace('_', ' ');
        const contentTypes = this.analyzeItemTypes(sessionItems);
        const sourceApps = [...new Set(sessionItems.map(item => item.source_app))];
        
        let summaryParts = [`${sessionType} session with ${sessionItems.length} items`];
        
        if (researchedItemCount > 0 && nonResearchedItemCount > 0) {
          summaryParts.push(`${researchedItemCount} researched, ${nonResearchedItemCount} reference items`);
        } else if (researchedItemCount > 0) {
          summaryParts.push(`${researchedItemCount} researched items`);
        } else {
          summaryParts.push(`${nonResearchedItemCount} reference items`);
        }
        
        if (contentTypes.length > 0) {
          summaryParts.push(`(${contentTypes.join(', ')})`);
        }
        
        if (allResearchFindings.length > 0) {
          const topKeywords = [...new Set(allKeywords)].slice(0, 5);
          if (topKeywords.length > 0) {
            summaryParts.push(`covering: ${topKeywords.join(', ')}`);
          }
          
          if (allSources.length > 0) {
            summaryParts.push(`${allSources.length} sources referenced`);
          }
        }
        
        contextSummary.sessionSummary = comprehensiveAnalysis?.sessionInsights || 
          summaryParts.join('. ') + '.';
        
        // Add timeline for all items (not just researched ones)
        contextSummary.itemTimeline = sessionItems
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 8)
          .map(item => ({
            timestamp: item.timestamp,
            sourceApp: item.source_app,
            windowTitle: item.window_title,
            hasResearch: sessionItemsWithResearch.find(sri => sri.id === item.id)?.hasResearch || false
          }));
      }

      // Update intent analysis with comprehensive insights
      if (comprehensiveAnalysis) {
        intentAnalysis.sessionIntent = {
          primaryGoal: comprehensiveAnalysis.intentAnalysis?.primaryIntent || 'research',
          progressStatus: comprehensiveAnalysis.intentAnalysis?.progressStatus || 'in_progress',
          nextActions: comprehensiveAnalysis.nextActions || [],
          confidenceLevel: comprehensiveAnalysis.sessionConfidence || 0.7,
          analysisReasoning: comprehensiveAnalysis.sessionReasoning || 'Comprehensive analysis of session items'
        };
      }

      // Consolidate research insights across all items
      if (allResearchFindings.length > 1) {
        intentAnalysis.crossItemInsights = {
          commonThemes: this.extractCommonThemes(allResearchFindings),
          knowledgeGaps: this.identifyKnowledgeGaps(allResearchFindings, session.session_type),
          recommendedNextSteps: this.generateNextSteps(allResearchFindings, session.session_type),
          researchCoherence: this.assessResearchCoherence(allResearchFindings)
        };
      }

      // Save updated session analysis
      const updateStmt = this.database.db.prepare(`
        UPDATE clipboard_sessions 
        SET context_summary = ?, intent_analysis = ?, last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      updateStmt.run(
        JSON.stringify(contextSummary),
        JSON.stringify(intentAnalysis),
        sessionId
      );

      console.log('SessionManager: Comprehensive session analysis updated successfully');
      console.log(`SessionManager: Session now has ${allResearchFindings.length} research findings integrated`);

      // Emit comprehensive analysis event
      this.emit('session-analysis-updated', {
        sessionId: sessionId,
        sessionType: session.session_type,
        analysisData: {
          totalResearchFindings: allResearchFindings.length,
          totalSources: allSources.length,
          keyTopics: [...new Set(allKeywords)].slice(0, 5),
          hasComprehensiveAnalysis: !!comprehensiveAnalysis
        }
      });

    } catch (error) {
      console.error('SessionManager: Error in comprehensive session analysis:', error);
    }
  }

  // Helper methods for comprehensive analysis
  extractCommonThemes(researchFindings) {
    const allFindings = researchFindings.flatMap(finding => finding.keyFindings || []);
    const wordCounts = {};
    
    allFindings.forEach(finding => {
      const words = finding.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      });
    });
    
    return Object.entries(wordCounts)
      .filter(([word, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  identifyKnowledgeGaps(researchFindings, sessionType) {
    const gaps = [];
    
    // Session-type specific gap analysis
    if (sessionType === 'hotel_research') {
      const hasLocationInfo = researchFindings.some(f => 
        f.keyFindings.some(finding => finding.toLowerCase().includes('location') || finding.toLowerCase().includes('area'))
      );
      const hasPriceInfo = researchFindings.some(f => 
        f.keyFindings.some(finding => finding.toLowerCase().includes('price') || finding.toLowerCase().includes('cost'))
      );
      
      if (!hasLocationInfo) gaps.push('Location and neighborhood information');
      if (!hasPriceInfo) gaps.push('Pricing and value comparison');
    }
    
    return gaps.slice(0, 3);
  }

  generateNextSteps(researchFindings, sessionType) {
    const steps = [];
    
    if (sessionType === 'hotel_research') {
      steps.push('Compare pricing across identified options');
      steps.push('Review customer reviews and ratings');
      if (researchFindings.length > 2) {
        steps.push('Create comparison matrix of key features');
      }
    } else if (sessionType === 'restaurant_research') {
      steps.push('Check availability and make reservations');
      steps.push('Review menu options and dietary accommodations');
    } else {
      steps.push('Gather additional sources for verification');
      steps.push('Organize findings into actionable insights');
    }
    
    return steps.slice(0, 3);
  }

  assessResearchCoherence(researchFindings) {
    // Simple coherence assessment based on keyword overlap
    const allKeywords = researchFindings.flatMap(f => f.keyFindings || []);
    const uniqueKeywords = new Set(allKeywords.map(k => k.toLowerCase()));
    
    const coherenceRatio = uniqueKeywords.size / (allKeywords.length || 1);
    
    if (coherenceRatio > 0.7) return 'low'; // Too many unique keywords, low coherence
    if (coherenceRatio > 0.4) return 'medium';
    return 'high'; // Good keyword overlap, high coherence
  }

  async performSessionResearch(sessionId) {
    try {
      console.log(`SessionManager: Performing comprehensive session research for session ${sessionId}`);
      
      // Get session and all its items
      const session = await this.getSession(sessionId);
      const sessionItems = await this.getSessionItems(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      if (sessionItems.length === 0) {
        throw new Error('Session has no items to research');
      }

      console.log(`SessionManager: Researching session "${session.session_label}" with ${sessionItems.length} items`);

      // Emit research started event
      this.emit('session-research-started', {
        sessionId: sessionId,
        sessionType: session.session_type,
        sessionLabel: session.session_label,
        totalItems: sessionItems.length,
        phase: 'initializing'
      });

      // Analyze each entry's comprehensive analysis to generate specific research queries
      const entrySpecificResearch = await this.generateEntrySpecificResearchQueries(sessionItems, session.session_type);
      
      console.log(`SessionManager: Generated ${entrySpecificResearch.totalQueries} specific research queries from ${entrySpecificResearch.entries.length} entries`);

      // Emit query generation completed
      this.emit('session-research-progress', {
        sessionId: sessionId,
        phase: 'queries_generated',
        totalQueries: entrySpecificResearch.totalQueries,
        entriesWithQueries: entrySpecificResearch.entries.length,
        progress: 0,
        currentStatus: `Generated ${entrySpecificResearch.totalQueries} research queries`
      });

      // Check if LangGraph is available
      if (!this.aiService?.langGraphClient) {
        console.log(`SessionManager: LangGraph not available, skipping comprehensive session research`);
        this.emit('session-research-failed', {
          sessionId: sessionId,
          error: 'LangGraph not available for research'
        });
        return null;
      }

      // Execute targeted research for each specific query with progress tracking
      const researchResults = [];
      let completedQueries = 0;
      
      for (const entry of entrySpecificResearch.entries) {
        if (entry.researchQueries.length > 0) {
          console.log(`SessionManager: Researching entry ${entry.itemId} with ${entry.researchQueries.length} specific queries`);
          
          // Get the actual clipboard item from database to preserve analysis data
          const actualClipboardItem = await this.database.getClipboardItem(entry.itemId);
          if (!actualClipboardItem) {
            console.log(`SessionManager: Could not find clipboard item ${entry.itemId} in database, skipping research`);
            continue;
          }
          
          for (const query of entry.researchQueries) {
            try {
              // Emit progress for current query
              this.emit('session-research-progress', {
                sessionId: sessionId,
                phase: 'searching',
                totalQueries: entrySpecificResearch.totalQueries,
                completedQueries: completedQueries,
                currentQuery: query.searchQuery,
                currentAspect: query.aspect,
                progress: Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                currentStatus: `Searching: ${query.searchQuery.substring(0, 60)}${query.searchQuery.length > 60 ? '...' : ''}`
              });

              // Use the actual clipboard item but modify content for the research query
              // This preserves the original ID so AIService can find the comprehensive analysis
              const researchClipboardItem = {
                ...actualClipboardItem,
                content: query.searchQuery,
                source_app: actualClipboardItem.source_app, // Keep original source
                window_title: `Research: ${query.aspect} - ${actualClipboardItem.window_title}`,
                surrounding_text: `${query.knownInfo} | Research Gap: ${query.researchGap}`,
                research_context: {
                  originalContent: actualClipboardItem.content,
                  researchAspect: query.aspect,
                  knownInfo: query.knownInfo,
                  researchGap: query.researchGap
                }
              };

              // Use AIService's executeLangGraphTask method for research
              console.log(`SessionManager: Using AIService for research query: "${query.searchQuery}" on item ${entry.itemId}`);
              
              // Set up progress callback to capture LangGraph individual search events
              if (this.aiService && this.aiService.setLangGraphProgressCallback) {
                this.aiService.setLangGraphProgressCallback((langGraphProgress) => {
                  // Map LangGraph progress events to session research progress events
                  if (langGraphProgress.phase === 'langgraph_web_searching') {
                    this.emit('session-research-progress', {
                      sessionId: sessionId,
                      phase: 'searching',
                      totalQueries: entrySpecificResearch.totalQueries,
                      completedQueries: completedQueries,
                      // Keep SessionManager level information for "Current search"
                      currentQuery: query.searchQuery,
                      currentAspect: query.aspect,
                      progress: Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                      currentStatus: `Searching: ${query.searchQuery.substring(0, 60)}${query.searchQuery.length > 60 ? '...' : ''}`,
                      // Add LangGraph individual search details as separate fields
                      langGraphQuery: langGraphProgress.currentQuery,
                      langGraphStatus: langGraphProgress.currentStatus,
                      langGraphProgress: langGraphProgress.progress,
                      lastCompletedQuery: langGraphProgress.lastCompletedQuery,
                      resultsCount: langGraphProgress.resultsCount
                    });
                  }
                });
              }
              
              const researchResult = await this.aiService.executeLangGraphTask(researchClipboardItem, 'research');
              
              // Clear the progress callback after this research is complete
              if (this.aiService && this.aiService.clearLangGraphProgressCallback) {
                this.aiService.clearLangGraphProgressCallback();
              }

              completedQueries++;

              if (researchResult) {
                researchResults.push({
                  entryId: entry.itemId,
                  aspect: query.aspect,
                  query: query.searchQuery,
                  result: researchResult,
                  timestamp: new Date().toISOString()
                });
                console.log(`SessionManager: Successfully researched "${query.searchQuery}" with ${researchResult.key_findings?.length || 0} findings`);
                
                // Emit progress for completed query
                this.emit('session-research-progress', {
                  sessionId: sessionId,
                  phase: 'searching',
                  totalQueries: entrySpecificResearch.totalQueries,
                  completedQueries: completedQueries,
                  progress: Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                  currentStatus: `Completed: ${query.searchQuery.substring(0, 50)}${query.searchQuery.length > 50 ? '...' : ''} (${researchResult.key_findings?.length || 0} findings)`,
                  lastCompletedQuery: query.searchQuery,
                  findingsCount: researchResult.key_findings?.length || 0
                });
              } else {
                console.log(`SessionManager: No research results returned for "${query.searchQuery}"`);
                
                // Emit progress for failed query
                this.emit('session-research-progress', {
                  sessionId: sessionId,
                  phase: 'searching',
                  totalQueries: entrySpecificResearch.totalQueries,
                  completedQueries: completedQueries,
                  progress: Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                  currentStatus: `No results for: ${query.searchQuery.substring(0, 50)}${query.searchQuery.length > 50 ? '...' : ''}`,
                  lastCompletedQuery: query.searchQuery,
                  findingsCount: 0
                });
              }
            } catch (error) {
              console.error(`SessionManager: Error researching query "${query.searchQuery}":`, error.message);
              completedQueries++;
              
              // Emit progress for error
              this.emit('session-research-progress', {
                sessionId: sessionId,
                phase: 'searching',
                totalQueries: entrySpecificResearch.totalQueries,
                completedQueries: completedQueries,
                progress: Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                currentStatus: `Error searching: ${query.searchQuery.substring(0, 50)}${query.searchQuery.length > 50 ? '...' : ''}`,
                lastCompletedQuery: query.searchQuery,
                error: error.message
              });
            }
          }
        }
      }

      console.log(`SessionManager: Completed ${researchResults.length} specific research queries`);

      // Emit consolidation phase
      this.emit('session-research-progress', {
        sessionId: sessionId,
        phase: 'consolidating',
        totalQueries: entrySpecificResearch.totalQueries,
        completedQueries: completedQueries,
        progress: 95,
        currentStatus: `Consolidating ${researchResults.length} research results...`,
        researchResultsCount: researchResults.length
      });

      // Consolidate and structure all research results
      const consolidatedResults = await this.consolidateEntrySpecificResearch(sessionId, researchResults, entrySpecificResearch);

      // Update session with comprehensive research results
      await this.updateSessionWithResearchResults(sessionId, consolidatedResults);

      // Emit final completion
      this.emit('session-research-progress', {
        sessionId: sessionId,
        phase: 'completed',
        totalQueries: entrySpecificResearch.totalQueries,
        completedQueries: completedQueries,
        progress: 100,
        currentStatus: 'Session research completed successfully',
        finalResults: {
          keyFindings: consolidatedResults?.keyFindings?.length || 0,
          totalSources: consolidatedResults?.totalSources || 0,
          researchQuality: consolidatedResults?.researchQuality || 'unknown'
        }
      });

      // Emit session research completed event
      this.emit('session-research-completed', {
        sessionId: sessionId,
        sessionType: session.session_type,
        researchResults: consolidatedResults,
        itemCount: sessionItems.length,
        specificQueries: entrySpecificResearch.totalQueries,
        researchedEntries: entrySpecificResearch.entries.length
      });

      return consolidatedResults;

    } catch (error) {
      console.error('SessionManager: Error performing session research:', error);
      this.emit('session-research-failed', {
        sessionId: sessionId,
        error: error.message
      });
      throw error;
    }
  }

  async generateEntrySpecificResearchQueries(sessionItems, sessionType) {
    const entries = [];
    let totalQueries = 0;

    for (const item of sessionItems) {
      if (!item.analysis_data) {
        console.log(`SessionManager: Skipping item ${item.id} - no comprehensive analysis available`);
        continue;
      }

      try {
        const analysisData = JSON.parse(item.analysis_data);
        const entryAnalysis = {
          itemId: item.id,
          content: item.content,
          contentType: analysisData.contentType || 'unknown',
          tags: analysisData.tags || [],
          contextInsights: analysisData.contextInsights || '',
          visualContext: analysisData.visualContext || null,
          sourceApp: item.source_app,
          windowTitle: item.window_title
        };

        // Generate specific research queries based on content type and context
        const researchQueries = await this.generateSpecificResearchQueries(entryAnalysis, sessionType);
        
        if (researchQueries.length > 0) {
          entries.push({
            ...entryAnalysis,
            researchQueries: researchQueries
          });
          totalQueries += researchQueries.length;
          console.log(`SessionManager: Generated ${researchQueries.length} queries for ${entryAnalysis.contentType} entry`);
        }

      } catch (parseError) {
        console.log(`SessionManager: Error parsing analysis data for item ${item.id}:`, parseError.message);
      }
    }

    return {
      entries: entries,
      totalQueries: totalQueries,
      sessionType: sessionType
    };
  }

  async generateSpecificResearchQueries(entryAnalysis, sessionType) {
    try {
      console.log(`SessionManager: Using LangGraph for intelligent query generation for ${entryAnalysis.contentType} content`);
      
      // Check if LangGraph is available
      if (!this.aiService?.langGraphClient) {
        console.log('SessionManager: LangGraph not available, using basic fallback');
        return this.generateBasicFallbackQueries(entryAnalysis);
      }
      
      // Call the new LangGraph workflow for intelligent query generation
      const result = await this.aiService.langGraphClient.executeWorkflow('research_query_generation', {
        content: entryAnalysis.content,
        entryAnalysis: entryAnalysis,
        sessionType: sessionType,
        context: {
          sessionType: sessionType,
          contentType: entryAnalysis.contentType,
          tags: entryAnalysis.tags,
          contextInsights: entryAnalysis.contextInsights,
          visualContext: entryAnalysis.visualContext,
          sourceApp: entryAnalysis.sourceApp,
          windowTitle: entryAnalysis.windowTitle
        }
      });
      
      if (result && result.researchQueries && Array.isArray(result.researchQueries)) {
        console.log(`SessionManager: LangGraph generated ${result.researchQueries.length} intelligent research queries`);
        return result.researchQueries;
      } else {
        console.log('SessionManager: LangGraph returned invalid result, using fallback');
        return this.generateBasicFallbackQueries(entryAnalysis);
      }
      
    } catch (error) {
      console.error('SessionManager: Error calling LangGraph for query generation:', error);
      return this.generateBasicFallbackQueries(entryAnalysis);
    }
  }

  generateBasicFallbackQueries(entryAnalysis) {
    console.log('SessionManager: Generating basic fallback queries');
    const originalContent = entryAnalysis.content.trim();
    
    // Always include the original content query as minimum
    const queries = [
      {
        aspect: 'original_content_research',
        searchQuery: `${originalContent} detailed information reviews features pricing availability`,
        knownInfo: `Original content: ${originalContent}`,
        researchGap: 'Comprehensive information about the specific item copied'
      }
    ];
    
    // Add one contextual query based on available information
    const tags = entryAnalysis.tags || [];
    if (tags.length > 0) {
      queries.push({
        aspect: 'contextual_research',
        searchQuery: `${originalContent} ${tags.slice(0, 2).join(' ')} information guide`,
        knownInfo: `Context: ${tags.join(', ')}`,
        researchGap: 'Additional contextual information'
      });
    }
    
    return queries.slice(0, 3); // Maintain 3 query limit
  }

  async consolidateEntrySpecificResearch(sessionId, researchResults, entrySpecificResearch) {
    try {
      console.log(`SessionManager: Consolidating ${researchResults.length} research results for session ${sessionId}`);
      
      if (researchResults.length === 0) {
        console.log('SessionManager: No research results to consolidate');
        return null;
      }

      // Get session and items for context
      const session = await this.getSession(sessionId);
      const sessionItems = await this.getSessionItems(sessionId);
      
      // Use the new consolidated session summarizer for single AI call
      console.log('SessionManager: Using ConsolidatedSessionSummarizer for unified analysis');
      const consolidatedResults = await this.aiSummarizer.generateCompleteSessionSummary(
        researchResults,
        entrySpecificResearch,
        session,
        sessionItems
      );

      if (consolidatedResults) {
        console.log(`SessionManager: Successfully consolidated research with ${consolidatedResults.keyFindings.length} key findings using unified approach`);
        return consolidatedResults;
      } else {
        console.log('SessionManager: Consolidated summarizer returned null, generating basic fallback');
        return this.generateBasicFallbackResults(sessionId, researchResults, session);
      }

    } catch (error) {
      console.error('SessionManager: Error consolidating research results:', error);
      
      // Get session for fallback (if not already retrieved due to early error)
      let fallbackSession = session;
      if (!fallbackSession) {
        try {
          fallbackSession = await this.getSession(sessionId);
        } catch (sessionError) {
          console.log('SessionManager: Could not retrieve session for fallback');
        }
      }
      
      return this.generateBasicFallbackResults(sessionId, researchResults, fallbackSession);
    }
  }

  /**
   * Generate basic fallback results when consolidation fails
   */
  generateBasicFallbackResults(sessionId, researchResults, session) {
    console.log('SessionManager: Generating basic fallback results');
    
    const keyFindings = researchResults.flatMap(r => r.result?.key_findings || r.result?.keyFindings || []).slice(0, 10);
    const totalSources = researchResults.reduce((total, r) => total + (r.result?.sources?.length || 0), 0);
    const aspects = [...new Set(researchResults.map(r => r.aspect).filter(Boolean))];
    
    return {
      sessionId: sessionId,
      researchObjective: `Research for ${session?.session_type?.replace('_', ' ') || 'session'} with ${researchResults.length} queries`,
      summary: `Completed research analysis with ${researchResults.length} research queries and ${keyFindings.length} key findings from ${totalSources} sources.`,
      primaryIntent: 'Information gathering and analysis',
      keyFindings: keyFindings,
      researchGoals: ['Complete comprehensive analysis', 'Gather relevant information', 'Make informed decisions'],
      nextSteps: ['Review findings', 'Evaluate options', 'Take appropriate action'],
      entitiesResearched: ['research topics'],
      aspectsCovered: aspects.length > 0 ? aspects : ['general information'],
      totalSources: totalSources,
      researchQuality: 'basic',
      timestamp: new Date().toISOString(),
      researchData: {
        sources: [],
        aspectBreakdown: {},
        confidenceLevel: 0.5
      }
    };
  }

  // Method removed - replaced with immediate standalone session creation

  async getMostRecentClipboardItems(limit = 5) {
    try {
      const stmt = this.database.db.prepare(`
        SELECT * FROM clipboard_items 
        ORDER BY timestamp DESC 
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (error) {
      console.error('SessionManager: Error getting recent clipboard items:', error);
      return [];
    }
  }

  async getItemSessions(clipboardItemId) {
    try {
      const stmt = this.database.db.prepare(`
        SELECT s.* FROM clipboard_sessions s
        JOIN session_members sm ON s.id = sm.session_id
        WHERE sm.clipboard_item_id = ?
      `);
      return stmt.all(clipboardItemId);
    } catch (error) {
      console.error('SessionManager: Error getting item sessions:', error);
      return [];
    }
  }

  async analyzeItemIntent(clipboardItem) {
    try {
      console.log(`SessionManager: Analyzing intent for item: "${clipboardItem.content.substring(0, 50)}..."`);
      
      // Use the session management workflow to analyze intent
      const result = await this.aiService.langGraphClient.executeWorkflow('session_management', {
        content: clipboardItem.content,
        context: {
          sourceApp: clipboardItem.source_app,
          windowTitle: clipboardItem.window_title,
          clipboardItemId: clipboardItem.id,
          database: this.database
        }
      });
      
      if (result && result.sessionDecision) {
        const decision = result.sessionDecision;
        return {
          primaryIntent: decision.userIntent || decision.detectedSessionType,
          sessionType: decision.detectedSessionType,
          confidence: decision.sessionTypeConfidence || 0.5,
          progressStatus: decision.progressStatus,
          reasoning: result.sessionReasoning,
          fullAnalysis: decision
        };
      } else {
        console.log(`SessionManager: No session decision in workflow result, using fallback`);
        return this.getFallbackIntent(clipboardItem);
      }
      
    } catch (error) {
      console.error('SessionManager: Error analyzing item intent:', error);
      return this.getFallbackIntent(clipboardItem);
    }
  }

  getFallbackIntent(clipboardItem) {
    // Basic fallback intent analysis
    const content = clipboardItem.content.toLowerCase();
    
    if (content.includes('hotel') || content.includes('booking') || content.includes('reservation')) {
      return {
        primaryIntent: 'hotel_research',
        sessionType: 'hotel_research',
        confidence: 0.7,
        progressStatus: 'in_progress',
        reasoning: 'Fallback: Hotel-related keywords detected'
      };
    } else if (content.includes('restaurant') || content.includes('menu') || content.includes('dining')) {
      return {
        primaryIntent: 'restaurant_research',
        sessionType: 'restaurant_research', 
        confidence: 0.7,
        progressStatus: 'in_progress',
        reasoning: 'Fallback: Restaurant-related keywords detected'
      };
    } else {
      return {
        primaryIntent: 'general_research',
        sessionType: 'general_research',
        confidence: 0.5,
        progressStatus: 'in_progress',
        reasoning: 'Fallback: General research classification'
      };
    }
  }

  evaluateSessionMembershipMinimal(clipboardItem, sessionCandidates) {
    // Simple membership evaluation based on session type matching
    for (const session of sessionCandidates) {
      const content = clipboardItem.content.toLowerCase();
      const sessionType = session.session_type;
      
      // Check if content matches the session type
      if (sessionType === 'hotel_research') {
        const hotelKeywords = ['hotel', 'resort', 'inn', 'suite', 'booking', 'marriott', 'hilton', 'hyatt', 'sheraton', 'ritz', 'four seasons', 'shangri'];
        if (hotelKeywords.some(keyword => content.includes(keyword))) {
          return session;
        }
      } else if (sessionType === 'restaurant_research') {
        const restaurantKeywords = ['restaurant', 'menu', 'reservation', 'dining', 'cuisine', 'michelin', 'yelp'];
        if (restaurantKeywords.some(keyword => content.includes(keyword))) {
          return session;
        }
      } else if (sessionType === 'general_research') {
        // General research accepts most content types
        if (content.length > 5 && !content.startsWith('http')) {
          return session;
        }
      }
    }
    
    return null;
  }

  generateFocusedSessionTitle(session, structuredResults) {
    const sessionType = session.session_type;
    const keyFindings = structuredResults.keyFindings || [];
    const researchObjective = structuredResults.researchObjective || '';
    const primaryIntent = structuredResults.primaryIntent || '';
    const sources = structuredResults.totalSources || 0;
    
    // Try to extract specific information from key findings
    let focusedTitle = '';
    
    // Look for location information in findings and research objective
    const locationFindings = keyFindings.filter(finding => 
      /\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i.test(finding)
    );
    
    const locationFromObjective = researchObjective.match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i)?.[0];
    
    // Look for brand/company information in findings and research objective
    const brandFindings = keyFindings.filter(finding => 
      /\b(Hilton|Marriott|Hyatt|Sheraton|Ritz|Four Seasons|Shangri|Apple|Samsung|Google|Microsoft|Amazon)\b/i.test(finding)
    );
    
    const brandsFromObjective = researchObjective.match(/\b(Hilton|Marriott|Hyatt|Sheraton|Ritz|Four Seasons|Shangri|Apple|Samsung|Google|Microsoft|Amazon|Sony|Nike)\b/gi) || [];
    
    // Extract cuisine types for restaurants
    const cuisineFromObjective = researchObjective.match(/\b(Italian|French|Japanese|Chinese|Mexican|Thai|Indian|Mediterranean|Steakhouse)\b/i)?.[0];
    
    // Use primary intent if available and concise
    if (primaryIntent && primaryIntent !== 'Unknown' && primaryIntent.length < 50) {
      focusedTitle = primaryIntent;
    }
    // Extract key information from research objective to create concise title
    else {
      switch (sessionType) {
        case 'hotel_research':
          if (locationFromObjective && brandsFromObjective.length > 0) {
            if (brandsFromObjective.length > 1) {
              focusedTitle = `${brandsFromObjective.slice(0, 2).join(' vs ')} - ${locationFromObjective}`;
            } else {
              focusedTitle = `${brandsFromObjective[0]} Hotels - ${locationFromObjective}`;
            }
          } else if (locationFromObjective) {
            focusedTitle = `Hotels in ${locationFromObjective}`;
          } else if (brandsFromObjective.length > 0) {
            if (brandsFromObjective.length > 1) {
              focusedTitle = `${brandsFromObjective.slice(0, 2).join(' vs ')} Hotels`;
            } else {
              focusedTitle = `${brandsFromObjective[0]} Hotels`;
            }
          } else if (locationFindings.length > 0) {
            const location = locationFindings[0].match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i)?.[0];
            focusedTitle = `Hotel Research: ${location}`;
          } else if (brandFindings.length > 0) {
            const brand = brandFindings[0].match(/\b(Hilton|Marriott|Hyatt|Sheraton|Ritz|Four Seasons|Shangri)\b/i)?.[0];
            focusedTitle = `${brand} Hotels`;
          } else {
            focusedTitle = `Hotel Research`;
          }
          break;
          
        case 'restaurant_research':
          if (locationFromObjective && cuisineFromObjective) {
            focusedTitle = `${cuisineFromObjective} Restaurants - ${locationFromObjective}`;
          } else if (locationFromObjective) {
            focusedTitle = `Restaurants in ${locationFromObjective}`;
          } else if (cuisineFromObjective) {
            focusedTitle = `${cuisineFromObjective} Restaurant Research`;
          } else if (locationFindings.length > 0) {
            const location = locationFindings[0].match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i)?.[0];
            focusedTitle = `Restaurants in ${location}`;
          } else {
            focusedTitle = `Restaurant Research`;
          }
          break;
          
        case 'travel_research':
        case 'travel_planning':
          if (locationFromObjective) {
            focusedTitle = `Travel to ${locationFromObjective}`;
          } else if (locationFindings.length > 0) {
            const location = locationFindings[0].match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i)?.[0];
            focusedTitle = `Travel to ${location}`;
          } else {
            focusedTitle = `Travel Planning`;
          }
          break;
          
        case 'product_research':
          if (brandsFromObjective.length > 1) {
            focusedTitle = `${brandsFromObjective.slice(0, 2).join(' vs ')} Comparison`;
          } else if (brandsFromObjective.length > 0) {
            focusedTitle = `${brandsFromObjective[0]} Products`;
          } else if (brandFindings.length > 0) {
            const brand = brandFindings[0].match(/\b(Apple|Samsung|Google|Microsoft|Amazon|Sony|Nike)\b/i)?.[0];
            focusedTitle = `${brand} Products`;
          } else {
            // Try to extract product category from research objective
            const productCategory = researchObjective.match(/\b(laptop|phone|headphones|camera|watch|tablet|computer|software|app)\b/i)?.[0];
            if (productCategory) {
              focusedTitle = `${productCategory.charAt(0).toUpperCase() + productCategory.slice(1)} Research`;
            } else {
              focusedTitle = `Product Research`;
            }
          }
          break;
          
        case 'academic_research':
          // Extract key academic topics (first few important words)
          const academicTopics = researchObjective.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g)?.slice(0, 2) || [];
          if (academicTopics.length > 0) {
            focusedTitle = `Academic: ${academicTopics.join(' & ')}`;
          } else {
            focusedTitle = `Academic Research`;
          }
          break;
          
        case 'event_planning':
          if (locationFromObjective) {
            focusedTitle = `Event Planning - ${locationFromObjective}`;
          } else {
            focusedTitle = `Event Planning`;
          }
          break;
          
        default:
          // Extract key terms from research objective (first meaningful noun phrases)
          const keyTerms = researchObjective.match(/\b[A-Z][a-z]+(?:\s+[a-z]+){0,1}\b/g)?.slice(0, 2) || [];
          if (keyTerms.length > 0) {
            focusedTitle = `Research: ${keyTerms.join(' & ')}`;
          } else if (keyFindings.length > 0) {
            // Extract the most meaningful part of the first key finding
            const firstFinding = keyFindings[0];
            if (firstFinding.length < 30) {
              focusedTitle = firstFinding;
            } else {
              // Extract first meaningful phrase
              const meaningfulPhrase = firstFinding.match(/^[^.,;]+/)?.[0] || firstFinding.substring(0, 25);
              focusedTitle = meaningfulPhrase.trim();
            }
          } else {
            focusedTitle = sessionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          }
      }
    }
    
    // Clean up and ensure title is not too long
    focusedTitle = focusedTitle.replace(/^(Research\s+|Find\s+|Get\s+)/i, ''); // Remove redundant prefixes
    
    if (focusedTitle.length > 60) {
      focusedTitle = focusedTitle.substring(0, 57) + '...';
    }
    
    return focusedTitle || session.session_label || 'Research Session';
  }

  async createStandaloneSession(clipboardItem) {
    try {
      console.log(`SessionManager: Creating standalone session for item: "${clipboardItem.content.substring(0, 30)}..."`);
      
      // Detect session type for the item
      const sessionType = await this.detectNewSessionType(clipboardItem);
      if (!sessionType) {
        console.log(`SessionManager: Could not determine session type, skipping session creation`);
        return null;
      }
      
      const sessionId = uuidv4();
      const now = new Date().toISOString();
      
      // Generate session label
      const sessionLabel = await this.generateSessionLabel(sessionType, clipboardItem);
      
      // Create context summary data for standalone session
      const contextSummary = {
        sessionSummary: `${sessionType.replace('_', ' ')} session (standalone)`,
        sessionProgress: {
          totalItems: 0, // Will be updated when items are added
          researchedItems: 0,
          nonResearchItems: 0,
          lastUpdated: now
        },
        allItems: [],
        createdAsStandalone: true
      };
      
      // Create basic intent analysis
      const intentAnalysis = {
        basicAnalysis: {
          totalItems: 0,
          contentTypes: [],
          sourceApplications: [clipboardItem.source_app],
          lastUpdated: now
        },
        standaloneSession: true,
        awaitingSecondItem: true
      };
      
      const stmt = this.database.db.prepare(`
        INSERT INTO clipboard_sessions (
          id, session_type, session_label, start_time, last_activity, status, context_summary, intent_analysis
        ) VALUES (?, ?, ?, ?, ?, 'inactive', ?, ?)
      `);
      
      stmt.run(
        sessionId, 
        sessionType, 
        sessionLabel, 
        now, 
        now,
        JSON.stringify(contextSummary),
        JSON.stringify(intentAnalysis)
      );
      
      const session = {
        id: sessionId,
        session_type: sessionType,
        session_label: sessionLabel,
        start_time: now,
        last_activity: now,
        status: 'inactive',
        context_summary: JSON.stringify(contextSummary),
        intent_analysis: JSON.stringify(intentAnalysis)
      };
      
      this.activeSessions.set(sessionId, session);
      
      console.log(`SessionManager: Created new standalone ${sessionType} session: ${sessionLabel} (inactive)`);
      
      this.emit('session-created', { session, clipboardItem, standalone: true });
      
      return session;
      
    } catch (error) {
      console.error('SessionManager: Error creating standalone session:', error);
      return null;
    }
  }

  async activateSession(sessionId) {
    try {
      console.log(`SessionManager: Activating session ${sessionId}`);
      
      const updateStmt = this.database.db.prepare(`
        UPDATE clipboard_sessions 
        SET status = 'active', last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      updateStmt.run(sessionId);
      
      // Update in-memory cache
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = 'active';
        session.last_activity = new Date().toISOString();
      }
      
      // Get session data and items for intent analysis
      const sessionData = await this.getSession(sessionId);
      const sessionItems = await this.getSessionItems(sessionId);
      
      if (sessionData && sessionItems.length >= 2) {
        console.log(`SessionManager: Performing intent analysis for newly activated session with ${sessionItems.length} items`);
        
        // Perform intent analysis immediately upon activation
        await this.performSessionIntentAnalysis(sessionId, sessionData, sessionItems);
      }
      
      console.log(`SessionManager: Session ${sessionId} activated successfully`);
      
      this.emit('session-activated', { sessionId });
      
    } catch (error) {
      console.error('SessionManager: Error activating session:', error);
    }
  }

  async performSessionIntentAnalysis(sessionId, session, sessionItems) {
    try {
      console.log(`SessionManager: Analyzing intent for session ${sessionId} with ${sessionItems.length} items`);
      
      // Parse existing session data
      let contextSummary = {};
      let intentAnalysis = {};
      
      if (session.context_summary) {
        try {
          contextSummary = JSON.parse(session.context_summary);
        } catch (parseError) {
          contextSummary = {};
        }
      }
      
      if (session.intent_analysis) {
        try {
          intentAnalysis = JSON.parse(session.intent_analysis);
        } catch (parseError) {
          intentAnalysis = {};
        }
      }
      
      // Create analysis context from session items
      const sessionContext = {
        sessionId: sessionId,
        sessionType: session.session_type,
        sessionLabel: session.session_label,
        itemCount: sessionItems.length,
        items: sessionItems.map(item => ({
          content: item.content,
          contentType: this.detectContentType(item.content),
          sourceApp: item.source_app,
          windowTitle: item.window_title,
          timestamp: item.timestamp
        }))
      };
      
      // Determine primary intent based on session type and content
      const primaryIntent = this.derivePrimaryIntent(session.session_type, sessionItems);
      
      // Determine progress status based on session content
      const progressStatus = this.deriveProgressStatus(sessionItems);
      
      // Extract content themes and keywords
      const contentThemes = this.extractContentThemes(sessionItems);
      const sourceApps = [...new Set(sessionItems.map(item => item.source_app))];
      
      // Update session summary
      const sessionType = session.session_type.replace('_', ' ');
      contextSummary.sessionSummary = `${sessionType} session analyzing ${contentThemes.join(', ')} with ${sessionItems.length} items`;
      contextSummary.sessionActivated = new Date().toISOString();
      contextSummary.intentRecognition = {
        primaryIntent: primaryIntent,
        progressStatus: progressStatus,
        contentThemes: contentThemes,
        sourceApplications: sourceApps,
        analysisTimestamp: new Date().toISOString()
      };
      
      // Remove standalone flags
      delete contextSummary.createdAsStandalone;
      
      // Update intent analysis with detailed information
      intentAnalysis.sessionIntent = {
        primaryGoal: primaryIntent,
        progressStatus: progressStatus,
        confidenceLevel: 0.8, // High confidence for basic intent analysis
        analysisReasoning: `Intent analysis based on ${sessionItems.length} items showing ${session.session_type.replace('_', ' ')} pattern`,
        contentThemes: contentThemes,
        sourceApplications: sourceApps,
        detectedAt: new Date().toISOString()
      };
      
      // Update basic analysis
      intentAnalysis.basicAnalysis = {
        totalItems: sessionItems.length,
        contentTypes: sessionItems.map(item => this.detectContentType(item.content)),
        sourceApplications: sourceApps,
        timespan: this.calculateSessionTimespan(sessionItems),
        lastUpdated: new Date().toISOString()
      };
      
      // Remove standalone flags
      delete intentAnalysis.standaloneSession;
      delete intentAnalysis.awaitingSecondItem;
      intentAnalysis.sessionActivated = true;
      
      // Save updated session data
      const updateContentStmt = this.database.db.prepare(`
        UPDATE clipboard_sessions 
        SET context_summary = ?, intent_analysis = ?
        WHERE id = ?
      `);
      
      updateContentStmt.run(
        JSON.stringify(contextSummary),
        JSON.stringify(intentAnalysis),
        sessionId
      );
      
      console.log(`SessionManager: Intent analysis completed for session ${sessionId}`);
      console.log(`SessionManager: Primary intent: ${primaryIntent}, Progress: ${progressStatus}`);
      
      // Emit intent analysis event
      this.emit('session-intent-analyzed', {
        sessionId: sessionId,
        primaryIntent: primaryIntent,
        progressStatus: progressStatus,
        contentThemes: contentThemes,
        itemCount: sessionItems.length
      });
      
    } catch (error) {
      console.error('SessionManager: Error performing session intent analysis:', error);
    }
  }

  derivePrimaryIntent(sessionType, sessionItems) {
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

  deriveProgressStatus(sessionItems) {
    const totalItems = sessionItems.length;
    const content = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    
    if (totalItems === 2) {
      return 'just_started';
    } else if (totalItems <= 5) {
      return 'gathering_information';
    } else if (content.includes('compare') || content.includes('vs') || content.includes('review')) {
      return 'comparing_options';
    } else if (content.includes('book') || content.includes('buy') || content.includes('purchase')) {
      return 'ready_to_decide';
    } else {
      return 'in_progress';
    }
  }

  extractContentThemes(sessionItems) {
    const allContent = sessionItems.map(item => item.content.toLowerCase()).join(' ');
    const themes = [];
    
    // Extract location themes
    const locationMatches = allContent.match(/\b(toronto|montreal|vancouver|new york|los angeles|chicago|boston|austin|miami|seattle|portland|denver|las vegas|london|paris|tokyo|sydney|san francisco|washington|atlanta|dallas|houston|philadelphia|phoenix|san diego|tampa|orlando|nashville|charlotte|detroit|columbus|indianapolis|jacksonville|memphis|baltimore|milwaukee|kansas city|omaha|louisville|richmond|buffalo|rochester|albany|providence|bridgeport|hartford|new haven|springfield|worcester|lowell|cambridge|lynn|brockton|quincy|newton|fall river|lawrence|haverhill|medford|malden|brookline|somerville|framingham|waltham|watertown|arlington|belmont|beverly|gloucester|peabody|salem|taunton|westfield|holyoke|chicopee|pittsfield|northampton|amherst|hadley|south hadley|easthampton|westfield|agawam|ludlow|east longmeadow|longmeadow|west springfield|wilbraham|palmer|ware|orange|athol|gardner|fitchburg|leominster|clinton|marlborough|hudson|maynard|acton|concord|lexington|bedford|burlington|woburn|winchester|stoneham|melrose|wakefield|reading|north reading|andover|methuen|dracut|tewksbury|billerica|chelmsford|westford|littleton|ayer|groton|pepperell|dunstable|tyngsborough|townsend|ashby|shirley|harvard|bolton|berlin|boylston|clinton|sterling|princeton|rutland|paxton|leicester|spencer|brookfield|east brookfield|west brookfield|warren|palmer|monson|hampden|wilbraham|ludlow|belchertown|granby|south hadley|holyoke|chicopee|springfield|agawam|west springfield|longmeadow|east longmeadow)\b/gi);
    if (locationMatches) {
      themes.push(...locationMatches.slice(0, 2).map(loc => loc.toLowerCase()));
    }
    
    // Extract specific entities (hotels, restaurants, products)
    const entityMatches = allContent.match(/\b[A-Z][a-z]+ (hotel|restaurant|resort|inn|suites|lodge|cafe|bistro|grill|bar|pub|store|shop|market|center|mall|plaza|tower|building|company|corporation|inc|llc|ltd)\b/gi);
    if (entityMatches) {
      themes.push(...entityMatches.slice(0, 2).map(entity => entity.toLowerCase()));
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
    
    // Remove duplicates and limit to 3 themes
    return [...new Set(themes)].slice(0, 3);
  }

  detectContentType(content) {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('http') || lowerContent.includes('www')) {
      return 'url';
    } else if (lowerContent.match(/\b\d+\.\d+\.\d+\.\d+\b/)) {
      return 'ip_address';
    } else if (lowerContent.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)) {
      return 'email';
    } else if (lowerContent.match(/\b\d{3}-\d{3}-\d{4}\b/)) {
      return 'phone';
    } else if (lowerContent.match(/\b(toronto|montreal|vancouver|new york|los angeles|chicago|boston|austin|miami|seattle|portland|denver|las vegas|london|paris|tokyo|sydney)\b/i)) {
      return 'location';
    } else if (lowerContent.match(/\b[A-Z][a-z]+ (hotel|restaurant|resort|inn|suites|lodge|cafe|bistro|grill|bar|pub)\b/i)) {
      return 'business';
    } else if (content.length > 100) {
      return 'long_text';
    } else {
      return 'text';
    }
  }
  
  calculateSessionTimespan(sessionItems) {
    if (sessionItems.length < 2) return 0;
    
    const timestamps = sessionItems.map(item => new Date(item.timestamp)).sort((a, b) => a - b);
    const timespan = timestamps[timestamps.length - 1] - timestamps[0];
    
    return Math.round(timespan / (1000 * 60)); // Return in minutes
  }

  organizeKeyFindingsByAspect(researchResults) {
    // Implementation for organizing key findings by aspect
    // This method should return an object where keys are aspects and values are arrays of key findings
    // You can use this method to organize research findings by their aspect
  }
}

module.exports = SessionManager; 