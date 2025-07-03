const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

// Import utility modules
const { 
  SessionLogger, 
  DatabaseUtils, 
  JSONUtils, 
  ContentAnalyzer, 
  ThemeDetector, 
  LabelGenerator 
} = require('./sessionManager/utils');

// Import constants
const {
  SESSION_TYPES,
  SESSION_STATUS,
  SESSION_LABEL_TEMPLATES,
  TIMING_CONFIG
} = require('./sessionManager/constants');

// Import workflow modules
const ResearchWorkflow = require('./sessionManager/workflows/researchWorkflow');
const SessionAnalysisWorkflow = require('./sessionManager/workflows/sessionAnalysis');

class SessionManagerRefactored extends EventEmitter {
  constructor(database, aiService, externalApiService = null, workflowEngine = null, aiSummarizer) {
    super();
    this.database = database;
    this.aiService = aiService;
    this.externalApiService = externalApiService;
    this.workflowEngine = workflowEngine;
    this.aiSummarizer = aiSummarizer;
    this.activeSessions = new Map();
    this.sessionTimeout = TIMING_CONFIG.SESSION_TIMEOUT;
    this.sessionCleanupInterval = null;
    this.isInitialized = false;

    // Initialize utility modules
    this.dbUtils = new DatabaseUtils(database);
    this.researchWorkflow = new ResearchWorkflow(aiService, aiSummarizer, this.dbUtils);
    this.analysisWorkflow = new SessionAnalysisWorkflow(this.dbUtils, aiService);
  }

  async init() {
    if (this.isInitialized) return;
    
    // Initialize database tables for session management
    await this.createSessionTables();
    
    // Start session cleanup interval
    this.sessionCleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, TIMING_CONFIG.CLEANUP_INTERVAL);
    
    this.isInitialized = true;
    SessionLogger.log('SessionManager initialized');
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
    SessionLogger.log(`Processing clipboard item for session detection: "${clipboardItem.content.substring(0, 30)}..."`);
    SessionLogger.log(`Source app: ${clipboardItem.source_app}, Window: ${clipboardItem.window_title}`);
    
    try {
      // Ensure clipboard item exists in database before session processing
      SessionLogger.log(`Ensuring clipboard item ${clipboardItem.id} exists in database...`);
      await this.ensureClipboardItemInDatabase(clipboardItem);
      SessionLogger.log(`Clipboard item saved to database successfully`);
      
      // Find potential session candidates
      SessionLogger.log(`Finding session candidates...`);
      const sessionCandidates = await this.findSessionCandidates(clipboardItem);
      SessionLogger.log(`Found ${sessionCandidates.length} session candidates`);
      
      let targetSession = null;
      
      if (sessionCandidates.length > 0) {
        SessionLogger.log(`Found ${sessionCandidates.length} candidates, evaluating membership...`);
        // Check if item belongs to existing session using analysis workflow
        targetSession = await this.analysisWorkflow.evaluateSessionMembership(clipboardItem, sessionCandidates);
        if (targetSession) {
          SessionLogger.log(`Item belongs to existing session ${targetSession.id} (${targetSession.session_type})`);
        } else {
          SessionLogger.log(`Item does not belong to any existing session`);
        }
      }
      
      if (!targetSession) {
        SessionLogger.log(`No existing session found, creating new standalone session...`);
        // Create a new standalone session immediately (marked as inactive)
        targetSession = await this.createStandaloneSession(clipboardItem);
        if (targetSession) {
          SessionLogger.log(`Created new standalone session ${targetSession.id} (inactive until second item joins)`);
        } else {
          SessionLogger.log(`Failed to create standalone session`);
        }
      }
      
      if (targetSession) {
        SessionLogger.log(`Adding item ${clipboardItem.id} to session ${targetSession.id}`);
        // Add item to session (this will also trigger automatic research)
        await this.addItemToSession(targetSession.id, clipboardItem);
        SessionLogger.log(`Item added to session successfully`);
        
        // Check if this addition activates the session
        const sessionItemCount = await this.dbUtils.getSessionItemCount(targetSession.id);
        if (sessionItemCount >= 2 && targetSession.status === SESSION_STATUS.INACTIVE) {
          SessionLogger.log(`Session ${targetSession.id} now has ${sessionItemCount} items - activating session`);
          await this.activateSession(targetSession.id);
        }
        
        // Emit session updated event
        this.emit('session-updated', {
          sessionId: targetSession.id,
          sessionType: targetSession.session_type,
          itemCount: sessionItemCount,
          newItem: clipboardItem,
          sessionActivated: sessionItemCount >= 2 && targetSession.status === SESSION_STATUS.INACTIVE
        });
        SessionLogger.log(`Session-updated event emitted`);
      } else {
        SessionLogger.log(`No session created or found, item remains standalone`);
      }
      
    } catch (error) {
      SessionLogger.error('Error processing clipboard item for session detection', '', error);
    }
  }

  async ensureClipboardItemInDatabase(clipboardItem) {
    try {
      // Check if the clipboard item already exists
      const existingItem = await this.database.getClipboardItem(clipboardItem.id);
      
      if (!existingItem) {
        SessionLogger.log(`Saving clipboard item ${clipboardItem.id} to database for session processing`);
        await this.database.saveClipboardItem(clipboardItem);
      } else {
        SessionLogger.log(`Clipboard item ${clipboardItem.id} already exists in database`);
      }
    } catch (error) {
      SessionLogger.error('Error ensuring clipboard item in database', '', error);
      throw error;
    }
  }

  async findSessionCandidates(clipboardItem) {
    const currentTime = new Date();
    const timeWindow = new Date(currentTime.getTime() - this.sessionTimeout);
    
    SessionLogger.log(`Looking for candidates - current time: ${currentTime.toISOString()}, window: ${timeWindow.toISOString()}`);
    
    // Get both active and inactive sessions within time window
    const candidates = await this.dbUtils.select(`
      SELECT * FROM clipboard_sessions 
      WHERE (status = ? OR status = ?) 
      AND datetime(last_activity) >= datetime(?)
      ORDER BY datetime(last_activity) DESC
    `, [SESSION_STATUS.ACTIVE, SESSION_STATUS.INACTIVE, timeWindow.toISOString()]);
    
    SessionLogger.log(`Found ${candidates.length} session candidates (active and inactive) within ${this.sessionTimeout / 1000}s`);
    
    candidates.forEach(session => {
      SessionLogger.log(`  Candidate: ${session.session_label} (${session.session_type}) - status: ${session.status} - last activity: ${session.last_activity}`);
    });
    
    return candidates;
  }

  async detectNewSessionType(clipboardItem) {
    SessionLogger.log(`Detecting session type for "${clipboardItem.content.substring(0, 30)}..."`);
    SessionLogger.log(`Source app: ${clipboardItem.source_app}`);
    SessionLogger.log(`Window title: ${clipboardItem.window_title}`);
    
    // Always try LangGraph first for intelligent session type detection
    try {
      if (this.aiService?.langGraphClient) {
        SessionLogger.log('Using LangGraph for session type detection');
        
        const sessionTypeResult = await this.aiService.langGraphClient.executeWorkflow('session_type_detection', {
          content: clipboardItem.content,
          context: {
            sourceApp: clipboardItem.source_app,
            windowTitle: clipboardItem.window_title,
            screenshotPath: clipboardItem.screenshot_path
          }
        });

        SessionLogger.log(`LangGraph session type result:`, sessionTypeResult);
        SessionLogger.log(`Session type: ${sessionTypeResult?.sessionType}, confidence: ${sessionTypeResult?.sessionConfidence}`);

        if (sessionTypeResult && sessionTypeResult.sessionType && sessionTypeResult.sessionConfidence > 0.6) {
          SessionLogger.log(`→ Creating new session type via LangGraph: ${sessionTypeResult.sessionType}`);
          return sessionTypeResult.sessionType;
        } else {
          SessionLogger.log(`→ LangGraph confidence too low (${sessionTypeResult?.sessionConfidence}) or no session type detected`);
        }
      } else {
        SessionLogger.log('LangGraph not available for session type detection');
      }
    } catch (error) {
      SessionLogger.error('Session type detection failed', '', error);
    }

    SessionLogger.log('Falling back to minimal session type detection...');
    // Use ContentAnalyzer for fallback detection
    const result = ContentAnalyzer.detectSessionType(clipboardItem);
    SessionLogger.log(`Minimal detection result: ${result}`);
    return result;
  }

  async addItemToSession(sessionId, clipboardItem) {
    const sequenceOrder = await this.dbUtils.getNextSequenceOrder(sessionId);
    
    await this.dbUtils.addItemToSession(sessionId, clipboardItem.id, sequenceOrder);
    await this.dbUtils.updateSessionActivity(sessionId);
    
    SessionLogger.log(`Added item ${clipboardItem.id} to session ${sessionId}`);
    
    // Always update session metadata for the new item
    await this.updateSessionMetadataForNewItem(sessionId, clipboardItem);
    
    // Check session size to determine if comprehensive research should run
    const sessionItemCount = await this.dbUtils.getSessionItemCount(sessionId);
    SessionLogger.log(`Session now has ${sessionItemCount} items`);
    
    // Trigger comprehensive session research if session has 2+ items
    if (sessionItemCount >= 2) {
      SessionLogger.log(`Session has ${sessionItemCount} items - triggering comprehensive session research`);
      
      // Run comprehensive session research (non-blocking)
      this.researchWorkflow.performSessionResearch(sessionId, (progress) => {
        this.emit('session-research-progress', progress);
      }).catch(error => {
        SessionLogger.error('Background comprehensive session research failed', '', error);
      });
    } else {
      SessionLogger.log(`Session only has ${sessionItemCount} item - skipping comprehensive research`);
    }
  }

  async updateSessionMetadataForNewItem(sessionId, clipboardItem) {
    try {
      SessionLogger.log(`Updating session metadata for item ${clipboardItem.id} (regardless of research)`);
      
      // Get current session data
      const session = await this.dbUtils.getSession(sessionId);
      const sessionItems = await this.dbUtils.getSessionItems(sessionId);
      
      // Parse existing session data using JSONUtils
      const { contextSummary, intentAnalysis } = JSONUtils.parseSessionData(session);

      // Update basic session statistics
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
      const itemTypes = ContentAnalyzer.analyzeItemTypes(sessionItems);
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
        timespan: ContentAnalyzer.calculateSessionTimespan(sessionItems),
        lastUpdated: new Date().toISOString()
      };

      // Extract keywords from all content
      const allMetadata = sessionItems.map(item => `${item.source_app} ${item.window_title}`).join(' ');
      const basicKeywords = ContentAnalyzer.extractBasicKeywords(allMetadata);
      
      if (!intentAnalysis.contentKeywords) {
        intentAnalysis.contentKeywords = [];
      }
      
      // Merge new keywords with existing ones
      intentAnalysis.contentKeywords = [...new Set([...intentAnalysis.contentKeywords, ...basicKeywords])].slice(0, 15);

      // Save updated session data using DatabaseUtils
      await this.dbUtils.updateSessionData(sessionId, contextSummary, intentAnalysis);

      SessionLogger.log('Successfully updated session metadata for new item');
      SessionLogger.log(`Session now has ${sessionItems.length} total items with comprehensive tracking`);

    } catch (error) {
      SessionLogger.error('Error updating session metadata for new item', '', error);
    }
  }

  async updateSessionWithResearchResults(sessionId, structuredResults) {
    try {
      SessionLogger.log(`Updating session ${sessionId} with comprehensive research results`);
      
      // Get current session data
      const session = await this.dbUtils.getSession(sessionId);
      
      // Parse existing session data using JSONUtils
      const { contextSummary, intentAnalysis } = JSONUtils.parseSessionData(session);

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
      await this.dbUtils.execute(`
        UPDATE clipboard_sessions 
        SET session_label = ?, context_summary = ?, intent_analysis = ?, last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [focusedTitle, JSONUtils.safeStringify(contextSummary), JSONUtils.safeStringify(intentAnalysis), sessionId]);

      SessionLogger.log(`Successfully updated session with research results and new title: "${focusedTitle}"`);

    } catch (error) {
      SessionLogger.error('Error updating session with research results', '', error);
    }
  }

  generateFocusedSessionTitle(session, structuredResults) {
    const sessionType = session.session_type;
    const keyFindings = structuredResults.keyFindings || [];
    const researchObjective = structuredResults.researchObjective || '';
    const primaryIntent = structuredResults.primaryIntent || '';
    
    // Try to extract specific information from key findings and research objective
    let focusedTitle = '';
    
    // Use primary intent if available and concise
    if (primaryIntent && primaryIntent !== 'Unknown' && primaryIntent.length < 50) {
      focusedTitle = primaryIntent;
    } else {
      // Extract key information from research objective to create concise title
      if (sessionType === SESSION_TYPES.HOTEL_RESEARCH) {
        const locationMatch = researchObjective.match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i);
        const brandMatch = researchObjective.match(/\b(Hilton|Marriott|Hyatt|Sheraton|Ritz|Four Seasons|Shangri)\b/gi);
        
        if (locationMatch && brandMatch) {
          focusedTitle = `${brandMatch.slice(0, 2).join(' vs ')} - ${locationMatch[0]}`;
        } else if (locationMatch) {
          focusedTitle = `Hotels in ${locationMatch[0]}`;
        } else if (brandMatch) {
          focusedTitle = `${brandMatch[0]} Hotels`;
        } else {
          focusedTitle = 'Hotel Research';
        }
      } else if (sessionType === SESSION_TYPES.RESTAURANT_RESEARCH) {
        const locationMatch = researchObjective.match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i);
        const cuisineMatch = researchObjective.match(/\b(Italian|French|Japanese|Chinese|Mexican|Thai|Indian|Mediterranean|Steakhouse)\b/i);
        
        if (locationMatch && cuisineMatch) {
          focusedTitle = `${cuisineMatch[0]} Restaurants - ${locationMatch[0]}`;
        } else if (locationMatch) {
          focusedTitle = `Restaurants in ${locationMatch[0]}`;
        } else if (cuisineMatch) {
          focusedTitle = `${cuisineMatch[0]} Restaurant Research`;
        } else {
          focusedTitle = 'Restaurant Research';
        }
      } else {
        // Extract key terms from research objective
        const keyTerms = researchObjective.match(/\b[A-Z][a-z]+(?:\s+[a-z]+){0,1}\b/g)?.slice(0, 2) || [];
        if (keyTerms.length > 0) {
          focusedTitle = `Research: ${keyTerms.join(' & ')}`;
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
      SessionLogger.log(`Creating standalone session for item: "${clipboardItem.content.substring(0, 30)}..."`);
      
      // Detect session type for the item
      const sessionType = await this.detectNewSessionType(clipboardItem);
      if (!sessionType) {
        SessionLogger.log(`Could not determine session type, skipping session creation`);
        return null;
      }
      
      const sessionId = uuidv4();
      const now = new Date().toISOString();
      
      // Generate session label using LabelGenerator
      const sessionLabel = LabelGenerator.generateSessionLabel(sessionType, clipboardItem, SESSION_LABEL_TEMPLATES);
      
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
      
      await this.dbUtils.execute(`
        INSERT INTO clipboard_sessions (
          id, session_type, session_label, start_time, last_activity, status, context_summary, intent_analysis
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        sessionId, 
        sessionType, 
        sessionLabel, 
        now, 
        now,
        SESSION_STATUS.INACTIVE,
        JSONUtils.safeStringify(contextSummary),
        JSONUtils.safeStringify(intentAnalysis)
      ]);
      
      const session = {
        id: sessionId,
        session_type: sessionType,
        session_label: sessionLabel,
        start_time: now,
        last_activity: now,
        status: SESSION_STATUS.INACTIVE,
        context_summary: JSONUtils.safeStringify(contextSummary),
        intent_analysis: JSONUtils.safeStringify(intentAnalysis)
      };
      
      this.activeSessions.set(sessionId, session);
      
      SessionLogger.log(`Created new standalone ${sessionType} session: ${sessionLabel} (inactive)`);
      
      this.emit('session-created', { session, clipboardItem, standalone: true });
      
      return session;
      
    } catch (error) {
      SessionLogger.error('Error creating standalone session', '', error);
      return null;
    }
  }

  async activateSession(sessionId) {
    try {
      SessionLogger.log(`Activating session ${sessionId}`);
      
      await this.dbUtils.updateSessionStatus(sessionId, SESSION_STATUS.ACTIVE);
      
      // Update in-memory cache
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = SESSION_STATUS.ACTIVE;
        session.last_activity = new Date().toISOString();
      }
      
      // Get session data and items for intent analysis
      const sessionData = await this.dbUtils.getSession(sessionId);
      const sessionItems = await this.dbUtils.getSessionItems(sessionId);
      
      if (sessionData && sessionItems.length >= 2) {
        SessionLogger.log(`Performing intent analysis for newly activated session with ${sessionItems.length} items`);
        
        // Perform intent analysis immediately upon activation using the analysis workflow
        const analysisResult = await this.analysisWorkflow.performSessionIntentAnalysis(sessionId, sessionData, sessionItems);
        
        // Emit session intent analyzed event
        this.emit('session-intent-analyzed', {
          sessionId: sessionId,
          ...analysisResult
        });
      }
      
      SessionLogger.log(`Session ${sessionId} activated successfully`);
      
      this.emit('session-activated', { sessionId });
      
    } catch (error) {
      SessionLogger.error('Error activating session', '', error);
    }
  }

  // Standard CRUD operations using DatabaseUtils
  async getSession(sessionId) {
    return this.dbUtils.getSession(sessionId);
  }

  async getSessionItems(sessionId) {
    return this.dbUtils.getSessionItems(sessionId);
  }

  async getSessionItemCount(sessionId) {
    return this.dbUtils.getSessionItemCount(sessionId);
  }

  async getActiveSessions() {
    return this.dbUtils.select(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      GROUP BY s.id
      ORDER BY s.last_activity DESC
    `);
  }

  async getSessionsByType(sessionType) {
    return this.dbUtils.select(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      WHERE s.session_type = ?
      GROUP BY s.id
      ORDER BY s.last_activity DESC
    `, [sessionType]);
  }

  cleanupExpiredSessions() {
    // Sessions never expire - they remain active indefinitely for persistent UI display
    SessionLogger.log('Session expiration disabled - all sessions remain active');
    return;
  }

  async clearAllSessions() {
    try {
      SessionLogger.log('Clearing all sessions...');
      
      // Delete all session members first (due to foreign key constraints)
      await this.dbUtils.execute('DELETE FROM session_members');
      
      // Delete all sessions
      const result = await this.dbUtils.execute('DELETE FROM clipboard_sessions');
      
      // Clear in-memory sessions
      this.activeSessions.clear();
      
      SessionLogger.log(`Cleared ${result.changes} sessions and all associated data`);
      
      // Emit event to notify UI
      this.emit('all-sessions-cleared');
      
      return { success: true, clearedSessions: result.changes };
    } catch (error) {
      SessionLogger.error('Error clearing all sessions', '', error);
      throw error;
    }
  }

  // External automation management
  enableExternalAutomation(externalApiService) {
    this.externalApiService = externalApiService;
    SessionLogger.log('External automation enabled');
  }

  disableExternalAutomation() {
    this.externalApiService = null;
    SessionLogger.log('External automation disabled');
  }

  isExternalAutomationEnabled() {
    return this.externalApiService !== null;
  }

  // Delegate research workflow operations
  async performSessionResearch(sessionId, progressCallback = null) {
    return this.researchWorkflow.performSessionResearch(sessionId, progressCallback);
  }

  // Delegate analysis workflow operations
  async updateComprehensiveSessionAnalysis(sessionId) {
    return this.analysisWorkflow.updateComprehensiveSessionAnalysis(sessionId);
  }

  destroy() {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
  }
}

module.exports = SessionManagerRefactored; 