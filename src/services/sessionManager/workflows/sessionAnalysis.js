/**
 * Session analysis workflow for intent and content analysis
 */

const { 
  SessionLogger, 
  JSONUtils, 
  ContentAnalyzer, 
  ThemeDetector, 
  IntentAnalyzer 
} = require('../utils');

const {
  SESSION_TYPES,
  COMPLEMENTARY_SESSION_TYPES,
  TIMING_CONFIG
} = require('../constants');

class SessionAnalysisWorkflow {
  constructor(databaseUtils, aiService) {
    this.databaseUtils = databaseUtils;
    this.aiService = aiService;
  }

  /**
   * Evaluate session membership for clipboard item
   */
  async evaluateSessionMembership(clipboardItem, sessionCandidates) {
    SessionLogger.log(`Evaluating membership for "${clipboardItem.content.substring(0, 30)}..." against ${sessionCandidates.length} session candidates`);
    
    // Try LangGraph analysis first for intelligent membership evaluation
    if (this.aiService?.langGraphClient) {
      SessionLogger.log('Using LangGraph for intelligent session membership evaluation...');
          
      for (const session of sessionCandidates) {
        try {
          const sessionItems = await this.databaseUtils.getSessionItems(session.id);
          SessionLogger.log(`Evaluating membership in session: ${session.session_label} (${session.session_type}) with ${sessionItems.length} items`);
          
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

          SessionLogger.log(`LangGraph membership result:`, membershipResult);
          SessionLogger.log(`Membership confidence: ${membershipResult?.membershipConfidence}, belongs: ${membershipResult?.belongsToSession}`);

          // Enhanced criteria: accept high confidence OR detect cross-session-type themes
          if (membershipResult?.belongsToSession) {
            if (membershipResult.membershipConfidence > 0.6) {
              SessionLogger.log(`High confidence membership (${membershipResult.membershipConfidence}) - joining session`);
              return session;
            } else if (membershipResult.membershipConfidence > 0.4 && this.detectCrossSessionTheme(clipboardItem, session, sessionItems)) {
              SessionLogger.log(`Cross-session theme detected with moderate confidence (${membershipResult.membershipConfidence}) - joining session`);
              return session;
            }
          }

          // Check for thematic compatibility even with different session types
          if (membershipResult.membershipConfidence > 0.3) {
            const themeCompatibility = await this.evaluateThematicCompatibility(clipboardItem, session, sessionItems);
            if (themeCompatibility.isCompatible) {
              SessionLogger.log(`Thematic compatibility detected: ${themeCompatibility.theme} - joining session across types`);
              // Update session type to be more general if joining across types
              if (session.session_type !== themeCompatibility.suggestedSessionType) {
                await this.updateSessionType(session.id, themeCompatibility.suggestedSessionType, themeCompatibility.theme);
              }
              return session;
            }
          }

        } catch (error) {
          SessionLogger.log(`Error in LangGraph membership evaluation for session ${session.id}: ${error.message}`);
        }
      }
    }

    SessionLogger.log('Falling back to enhanced pattern-based membership evaluation...');
    // Enhanced fallback with theme detection
    return this.evaluateSessionMembershipWithThemes(clipboardItem, sessionCandidates);
  }

  /**
   * Evaluate thematic compatibility between clipboard item and session
   */
  async evaluateThematicCompatibility(clipboardItem, session, sessionItems) {
    try {
      SessionLogger.log(`Evaluating thematic compatibility between new item and session ${session.session_label}`);
      
      if (this.aiService?.langGraphClient) {
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
        const locationThemes = ThemeDetector.extractLocationThemes(clipboardItem, sessionItems);
        if (locationThemes.commonLocation) {
          return {
            isCompatible: true,
            theme: `${locationThemes.commonLocation} Planning`,
            suggestedSessionType: SESSION_TYPES.TRAVEL_RESEARCH,
            reasoning: `Both involve ${locationThemes.commonLocation} - combining travel planning activities`,
            confidence: 0.8
          };
        }

        // Look for event-based themes
        const eventThemes = ThemeDetector.extractEventThemes(clipboardItem, sessionItems);
        if (eventThemes.commonEvent) {
          return {
            isCompatible: true,
            theme: `${eventThemes.commonEvent} Planning`,
            suggestedSessionType: SESSION_TYPES.EVENT_PLANNING,
            reasoning: `Both related to ${eventThemes.commonEvent}`,
            confidence: 0.75
          };
        }

        // Look for temporal themes (same time period)
        const temporalThemes = ThemeDetector.extractTemporalThemes(clipboardItem, sessionItems);
        if (temporalThemes.commonTimeframe) {
          return {
            isCompatible: true,
            theme: `${temporalThemes.commonTimeframe} Planning`,
            suggestedSessionType: SESSION_TYPES.GENERAL_RESEARCH,
            reasoning: `Activities planned for ${temporalThemes.commonTimeframe}`,
            confidence: 0.65
          };
        }

        // Look for project/work themes
        const projectThemes = ThemeDetector.extractProjectThemes(clipboardItem, sessionItems);
        if (projectThemes.commonProject) {
          return {
            isCompatible: true,
            theme: `${projectThemes.commonProject}`,
            suggestedSessionType: SESSION_TYPES.PROJECT_RESEARCH,
            reasoning: `Related to ${projectThemes.commonProject} project`,
            confidence: 0.7
          };
        }
      }

      return { isCompatible: false };
    } catch (error) {
      SessionLogger.log(`Theme compatibility analysis failed: ${error.message}`);
      return { isCompatible: false };
    }
  }

  /**
   * Update session type and theme
   */
  async updateSessionType(sessionId, newSessionType, newTheme) {
    try {
      SessionLogger.log(`Updating session ${sessionId} type from existing to ${newSessionType} with theme: ${newTheme}`);
      
      await this.databaseUtils.execute(`
        UPDATE clipboard_sessions 
        SET session_type = ?, session_label = ?, last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newSessionType, newTheme, sessionId]);
      
      SessionLogger.log(`Session type updated to ${newSessionType} with label: ${newTheme}`);
    } catch (error) {
      SessionLogger.error('Error updating session type', '', error);
    }
  }

  /**
   * Detect cross-session themes
   */
  detectCrossSessionTheme(clipboardItem, session, sessionItems) {
    SessionLogger.log(`Detecting cross-session themes between ${clipboardItem.content.substring(0, 30)}... and session ${session.session_label}`);
    
    // Location-based themes
    const locationMatch = ThemeDetector.extractLocationThemes(clipboardItem, sessionItems);
    if (locationMatch.commonLocation) {
      SessionLogger.log(`Location theme detected: ${locationMatch.commonLocation}`);
      return true;
    }
    
    // Event-based themes
    const eventMatch = ThemeDetector.extractEventThemes(clipboardItem, sessionItems);
    if (eventMatch.commonEvent) {
      SessionLogger.log(`Event theme detected: ${eventMatch.commonEvent}`);
      return true;
    }
    
    // Check for complementary session types
    const currentType = ContentAnalyzer.detectSessionType(clipboardItem);
    if (COMPLEMENTARY_SESSION_TYPES[session.session_type]?.includes(currentType)) {
      SessionLogger.log(`Complementary session types detected: ${session.session_type} + ${currentType}`);
      return true;
    }
    
    return false;
  }

  /**
   * Enhanced session membership evaluation with themes
   */
  async evaluateSessionMembershipWithThemes(clipboardItem, sessionCandidates) {
    SessionLogger.log('Enhanced pattern-based evaluation with theme detection...');
    
    for (const session of sessionCandidates) {
      SessionLogger.log(`Checking session: ${session.session_label} (${session.session_type})`);
      
      const sessionItems = await this.databaseUtils.getSessionItems(session.id);
      const timeDiff = new Date() - new Date(session.last_activity);
      
      // First check exact session type membership
      const exactMatch = this.evaluateSessionMembershipMinimal(clipboardItem, [session]);
      if (exactMatch) {
        SessionLogger.log(`Exact session type match found`);
        return exactMatch;
      }
      
      // Then check thematic compatibility with extended time window
      if (timeDiff < TIMING_CONFIG.THEME_MATCHING_WINDOW) {
        const themeCompatibility = await this.evaluateThematicCompatibility(clipboardItem, session, sessionItems);
        if (themeCompatibility.isCompatible) {
          SessionLogger.log(`Thematic compatibility found: ${themeCompatibility.theme}`);
          
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
    
      SessionLogger.log(`No membership found for session ${session.session_label}`);
    }
    
    return null;
  }

  /**
   * Minimal session membership evaluation
   */
  evaluateSessionMembershipMinimal(clipboardItem, sessionCandidates) {
    // Simple membership evaluation based on session type matching
    for (const session of sessionCandidates) {
      const content = clipboardItem.content.toLowerCase();
      const sessionType = session.session_type;
      
      // Check if content matches the session type
      if (sessionType === SESSION_TYPES.HOTEL_RESEARCH) {
        if (this.hasKeywords(content, 'hotel')) {
          return session;
        }
      } else if (sessionType === SESSION_TYPES.RESTAURANT_RESEARCH) {
        if (this.hasKeywords(content, 'restaurant')) {
          return session;
        }
      } else if (sessionType === SESSION_TYPES.GENERAL_RESEARCH) {
        // General research accepts most content types
        if (content.length > 5 && !content.startsWith('http')) {
          return session;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if content has keywords for a specific type
   */
  hasKeywords(content, type) {
    const keywordMap = {
      hotel: ['hotel', 'resort', 'inn', 'suite', 'booking', 'marriott', 'hilton', 'hyatt', 'sheraton', 'ritz', 'four seasons', 'shangri'],
      restaurant: ['restaurant', 'menu', 'reservation', 'dining', 'cuisine', 'michelin', 'yelp']
    };
    
    const keywords = keywordMap[type] || [];
    return keywords.some(keyword => content.includes(keyword));
  }

  /**
   * Perform session intent analysis
   */
  async performSessionIntentAnalysis(sessionId, session, sessionItems) {
    try {
      SessionLogger.log(`Analyzing intent for session ${sessionId} with ${sessionItems.length} items`);
      
      // Parse existing session data
      const { contextSummary, intentAnalysis } = JSONUtils.parseSessionData(session);
      
      // Create analysis context from session items
      const sessionContext = {
        sessionId: sessionId,
        sessionType: session.session_type,
        sessionLabel: session.session_label,
        itemCount: sessionItems.length,
        items: sessionItems.map(item => ({
          content: item.content,
          contentType: ContentAnalyzer.detectContentType(item.content),
          sourceApp: item.source_app,
          windowTitle: item.window_title,
          timestamp: item.timestamp
        }))
      };
      
      // Determine primary intent based on session type and content
      const primaryIntent = IntentAnalyzer.derivePrimaryIntent(session.session_type, sessionItems);
      
      // Determine progress status based on session content
      const progressStatus = IntentAnalyzer.deriveProgressStatus(sessionItems);
      
      // Extract content themes and keywords
      const contentThemes = ThemeDetector.extractContentThemes(sessionItems);
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
        contentTypes: sessionItems.map(item => ContentAnalyzer.detectContentType(item.content)),
        sourceApplications: sourceApps,
        timespan: ContentAnalyzer.calculateSessionTimespan(sessionItems),
        lastUpdated: new Date().toISOString()
      };
      
      // Remove standalone flags
      delete intentAnalysis.standaloneSession;
      delete intentAnalysis.awaitingSecondItem;
      intentAnalysis.sessionActivated = true;
      
      // Save updated session data
      await this.databaseUtils.updateSessionData(sessionId, contextSummary, intentAnalysis);
      
      SessionLogger.log(`Intent analysis completed for session ${sessionId}`);
      SessionLogger.log(`Primary intent: ${primaryIntent}, Progress: ${progressStatus}`);
      
      return {
        primaryIntent,
        progressStatus,
        contentThemes,
        itemCount: sessionItems.length
      };
      
    } catch (error) {
      SessionLogger.error('Error performing session intent analysis', '', error);
      throw error;
    }
  }

  /**
   * Update comprehensive session analysis
   */
  async updateComprehensiveSessionAnalysis(sessionId) {
    try {
      SessionLogger.log(`Running comprehensive session analysis for session ${sessionId}`);
      
      // Get current session and all its items
      const session = await this.databaseUtils.getSession(sessionId);
      const sessionItems = await this.databaseUtils.getSessionItems(sessionId);
      
      if (sessionItems.length === 0) {
        SessionLogger.log('No items in session, skipping comprehensive analysis');
        return;
      }

      SessionLogger.log(`Analyzing ${sessionItems.length} items in session`);

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
            SessionLogger.log(`Error parsing analysis data for item ${item.id}: ${parseError.message}`);
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

      SessionLogger.log(`Found ${allResearchFindings.length} research findings across ${sessionItems.length} items`);
      SessionLogger.log(`${researchedItemCount} items with research, ${nonResearchedItemCount} reference items`);

      // Generate comprehensive session analysis using LangGraph if available
      let comprehensiveAnalysis = null;
      if (this.aiService?.langGraphClient) {
        SessionLogger.log('Running comprehensive session workflow analysis...');
        
        try {
          const basicKeywords = ContentAnalyzer.extractBasicKeywords(sessionItems.map(item => `${item.source_app} ${item.window_title}`).join(' '));
          
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
                contentTypes: ContentAnalyzer.analyzeItemTypes(sessionItems),
                sourceApps: [...new Set(sessionItems.map(item => item.source_app))],
                timespan: ContentAnalyzer.calculateSessionTimespan(sessionItems)
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
          
          SessionLogger.log('Comprehensive session analysis completed');
        } catch (error) {
          SessionLogger.error('Comprehensive session analysis failed', '', error);
        }
      }

      // Update session with comprehensive analysis
      const { contextSummary, intentAnalysis } = JSONUtils.parseSessionData(session);

      // Update context summary with comprehensive findings (includes all items)
      contextSummary.comprehensiveAnalysis = {
        totalItems: sessionItems.length,
        researchedItems: researchedItemCount,
        nonResearchItems: nonResearchedItemCount,
        researchFindings: allResearchFindings.length,
        totalSources: allSources.length,
        keyTopics: [...new Set([...allKeywords, ...ContentAnalyzer.extractBasicKeywords(sessionItems.map(item => `${item.source_app} ${item.window_title}`).join(' '))])].slice(0, 15),
        contentTypes: ContentAnalyzer.analyzeItemTypes(sessionItems),
        sourceApplications: [...new Set(sessionItems.map(item => item.source_app))],
        timespan: ContentAnalyzer.calculateSessionTimespan(sessionItems),
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
        const contentTypes = ContentAnalyzer.analyzeItemTypes(sessionItems);
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
      await this.databaseUtils.updateSessionData(sessionId, contextSummary, intentAnalysis);

      SessionLogger.log('Comprehensive session analysis updated successfully');
      SessionLogger.log(`Session now has ${allResearchFindings.length} research findings integrated`);

      return {
        totalResearchFindings: allResearchFindings.length,
        totalSources: allSources.length,
        keyTopics: [...new Set(allKeywords)].slice(0, 5),
        hasComprehensiveAnalysis: !!comprehensiveAnalysis
      };

    } catch (error) {
      SessionLogger.error('Error in comprehensive session analysis', '', error);
      throw error;
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
    if (sessionType === SESSION_TYPES.HOTEL_RESEARCH) {
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
    
    if (sessionType === SESSION_TYPES.HOTEL_RESEARCH) {
      steps.push('Compare pricing across identified options');
      steps.push('Review customer reviews and ratings');
      if (researchFindings.length > 2) {
        steps.push('Create comparison matrix of key features');
      }
    } else if (sessionType === SESSION_TYPES.RESTAURANT_RESEARCH) {
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
}

module.exports = SessionAnalysisWorkflow; 