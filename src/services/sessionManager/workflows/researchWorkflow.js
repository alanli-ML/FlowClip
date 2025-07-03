/**
 * Research workflow management for sessions
 */

const { SessionLogger, ProgressTracker } = require('../utils');

class ResearchWorkflow {
  constructor(aiService, aiSummarizer, databaseUtils) {
    this.aiService = aiService;
    this.aiSummarizer = aiSummarizer;
    this.databaseUtils = databaseUtils;
  }

  /**
   * Perform comprehensive session research
   */
  async performSessionResearch(sessionId, progressCallback = null) {
    const progressTracker = new ProgressTracker(progressCallback);
    
    try {
      SessionLogger.log(`Performing comprehensive session research for session ${sessionId}`);
      
      // Get session and all its items
      const session = await this.databaseUtils.getSession(sessionId);
      const sessionItems = await this.databaseUtils.getSessionItems(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }
      
      if (sessionItems.length === 0) {
        throw new Error('Session has no items to research');
      }

      SessionLogger.log(`Researching session "${session.session_label}" with ${sessionItems.length} items`);

      // Emit research started event
      progressTracker.emitResearchStarted(sessionId, session.session_type, session.session_label, sessionItems.length);

      // Analyze each entry's comprehensive analysis to generate specific research queries
      const entrySpecificResearch = await this.generateEntrySpecificResearchQueries(sessionItems, session.session_type);
      
      SessionLogger.log(`Generated ${entrySpecificResearch.totalQueries} specific research queries from ${entrySpecificResearch.entries.length} entries`);

      // Emit query generation completed
      progressTracker.emitProgress(sessionId, 'queries_generated', 0, `Generated ${entrySpecificResearch.totalQueries} research queries`, {
        totalQueries: entrySpecificResearch.totalQueries,
        entriesWithQueries: entrySpecificResearch.entries.length
      });

      // Check if LangGraph is available
      if (!this.aiService?.langGraphClient) {
        SessionLogger.log(`LangGraph not available, skipping comprehensive session research`);
        progressTracker.emitProgress(sessionId, 'failed', 0, 'LangGraph not available for research');
        return null;
      }

      // Execute targeted research for each specific query with progress tracking
      const researchResults = await this.executeResearchQueries(
        entrySpecificResearch, 
        sessionId, 
        progressTracker
      );

      SessionLogger.log(`Completed ${researchResults.length} specific research queries`);

      // Emit consolidation phase
      progressTracker.emitProgress(sessionId, 'consolidating', 95, `Consolidating ${researchResults.length} research results...`, {
        researchResultsCount: researchResults.length
      });

      // Consolidate and structure all research results
      const consolidatedResults = await this.consolidateEntrySpecificResearch(sessionId, researchResults, entrySpecificResearch);

      // Emit final completion
      progressTracker.emitResearchCompleted(sessionId, session.session_type, {
        keyFindings: consolidatedResults?.keyFindings?.length || 0,
        totalSources: consolidatedResults?.totalSources || 0,
        researchQuality: consolidatedResults?.researchQuality || 'unknown'
      });

      return consolidatedResults;

    } catch (error) {
      SessionLogger.error('Error performing session research', '', error);
      progressTracker.emitProgress(sessionId, 'failed', 0, error.message);
      throw error;
    }
  }

  /**
   * Execute research queries with progress tracking
   */
  async executeResearchQueries(entrySpecificResearch, sessionId, progressTracker) {
    const researchResults = [];
    let completedQueries = 0;
    
    for (const entry of entrySpecificResearch.entries) {
      if (entry.researchQueries.length > 0) {
        SessionLogger.log(`Researching entry ${entry.itemId} with ${entry.researchQueries.length} specific queries`);
        
        // Get the actual clipboard item from database to preserve analysis data
        const actualClipboardItem = await this.databaseUtils.database.getClipboardItem(entry.itemId);
        if (!actualClipboardItem) {
          SessionLogger.log(`Could not find clipboard item ${entry.itemId} in database, skipping research`);
          continue;
        }
        
        for (const query of entry.researchQueries) {
          try {
            // Emit progress for current query
            progressTracker.emitProgress(sessionId, 'searching', 
              Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
              `Searching: ${query.searchQuery.substring(0, 60)}${query.searchQuery.length > 60 ? '...' : ''}`,
              {
                totalQueries: entrySpecificResearch.totalQueries,
                completedQueries: completedQueries,
                currentQuery: query.searchQuery,
                currentAspect: query.aspect
              }
            );

            // Create research clipboard item
            const researchClipboardItem = {
              ...actualClipboardItem,
              content: query.searchQuery,
              source_app: actualClipboardItem.source_app,
              window_title: `Research: ${query.aspect} - ${actualClipboardItem.window_title}`,
              surrounding_text: `${query.knownInfo} | Research Gap: ${query.researchGap}`,
              research_context: {
                originalContent: actualClipboardItem.content,
                researchAspect: query.aspect,
                knownInfo: query.knownInfo,
                researchGap: query.researchGap
              }
            };

            // Set up progress callback for LangGraph individual search events
            if (this.aiService?.setLangGraphProgressCallback) {
              this.aiService.setLangGraphProgressCallback((langGraphProgress) => {
                if (langGraphProgress.phase === 'langgraph_web_searching') {
                  progressTracker.emitProgress(sessionId, 'searching',
                    Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                    `Searching: ${query.searchQuery.substring(0, 60)}${query.searchQuery.length > 60 ? '...' : ''}`,
                    {
                      totalQueries: entrySpecificResearch.totalQueries,
                      completedQueries: completedQueries,
                      currentQuery: query.searchQuery,
                      currentAspect: query.aspect,
                      langGraphQuery: langGraphProgress.currentQuery,
                      langGraphStatus: langGraphProgress.currentStatus,
                      langGraphProgress: langGraphProgress.progress,
                      lastCompletedQuery: langGraphProgress.lastCompletedQuery,
                      resultsCount: langGraphProgress.resultsCount
                    }
                  );
                }
              });
            }
            
            const researchResult = await this.aiService.executeLangGraphTask(researchClipboardItem, 'research');
            
            // Clear the progress callback
            if (this.aiService?.clearLangGraphProgressCallback) {
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
              
              SessionLogger.log(`Successfully researched "${query.searchQuery}" with ${researchResult.key_findings?.length || 0} findings`);
              
              progressTracker.emitProgress(sessionId, 'searching',
                Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                `Completed: ${query.searchQuery.substring(0, 50)}${query.searchQuery.length > 50 ? '...' : ''} (${researchResult.key_findings?.length || 0} findings)`,
                {
                  lastCompletedQuery: query.searchQuery,
                  findingsCount: researchResult.key_findings?.length || 0
                }
              );
            } else {
              SessionLogger.log(`No research results returned for "${query.searchQuery}"`);
              progressTracker.emitProgress(sessionId, 'searching',
                Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
                `No results for: ${query.searchQuery.substring(0, 50)}${query.searchQuery.length > 50 ? '...' : ''}`,
                {
                  lastCompletedQuery: query.searchQuery,
                  findingsCount: 0
                }
              );
            }
          } catch (error) {
            SessionLogger.error(`Error researching query "${query.searchQuery}"`, '', error);
            completedQueries++;
            
            progressTracker.emitProgress(sessionId, 'searching',
              Math.round((completedQueries / entrySpecificResearch.totalQueries) * 100),
              `Error searching: ${query.searchQuery.substring(0, 50)}${query.searchQuery.length > 50 ? '...' : ''}`,
              {
                lastCompletedQuery: query.searchQuery,
                error: error.message
              }
            );
          }
        }
      }
    }

    return researchResults;
  }

  /**
   * Generate entry-specific research queries
   */
  async generateEntrySpecificResearchQueries(sessionItems, sessionType) {
    const entries = [];
    let totalQueries = 0;

    for (const item of sessionItems) {
      if (!item.analysis_data) {
        SessionLogger.log(`Skipping item ${item.id} - no comprehensive analysis available`);
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
          SessionLogger.log(`Generated ${researchQueries.length} queries for ${entryAnalysis.contentType} entry`);
        }

      } catch (parseError) {
        SessionLogger.log(`Error parsing analysis data for item ${item.id}: ${parseError.message}`);
      }
    }

    return {
      entries: entries,
      totalQueries: totalQueries,
      sessionType: sessionType
    };
  }

  /**
   * Generate specific research queries for an entry
   */
  async generateSpecificResearchQueries(entryAnalysis, sessionType) {
    try {
      SessionLogger.log(`Using LangGraph for intelligent query generation for ${entryAnalysis.contentType} content`);
      
      // Check if LangGraph is available
      if (!this.aiService?.langGraphClient) {
        SessionLogger.log('LangGraph not available, using basic fallback');
        return this.generateBasicFallbackQueries(entryAnalysis);
      }
      
      // Call the LangGraph workflow for intelligent query generation
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
        SessionLogger.log(`LangGraph generated ${result.researchQueries.length} intelligent research queries`);
        return result.researchQueries;
      } else {
        SessionLogger.log('LangGraph returned invalid result, using fallback');
        return this.generateBasicFallbackQueries(entryAnalysis);
      }
      
    } catch (error) {
      SessionLogger.error('Error calling LangGraph for query generation', '', error);
      return this.generateBasicFallbackQueries(entryAnalysis);
    }
  }

  /**
   * Generate basic fallback queries when LangGraph is not available
   */
  generateBasicFallbackQueries(entryAnalysis) {
    SessionLogger.log('Generating basic fallback queries');
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

  /**
   * Consolidate entry-specific research results
   */
  async consolidateEntrySpecificResearch(sessionId, researchResults, entrySpecificResearch) {
    try {
      SessionLogger.log(`Consolidating ${researchResults.length} research results for session ${sessionId}`);
      
      if (researchResults.length === 0) {
        SessionLogger.log('No research results to consolidate');
        return null;
      }

      // Get session and items for context
      const session = await this.databaseUtils.getSession(sessionId);
      const sessionItems = await this.databaseUtils.getSessionItems(sessionId);
      
      // Use the consolidated session summarizer for single AI call
      SessionLogger.log('Using ConsolidatedSessionSummarizer for unified analysis');
      const consolidatedResults = await this.aiSummarizer.generateCompleteSessionSummary(
        researchResults,
        entrySpecificResearch,
        session,
        sessionItems
      );

      if (consolidatedResults) {
        SessionLogger.log(`Successfully consolidated research with ${consolidatedResults.keyFindings.length} key findings using unified approach`);
        return consolidatedResults;
      } else {
        SessionLogger.log('Consolidated summarizer returned null, generating basic fallback');
        return this.generateBasicFallbackResults(sessionId, researchResults, session);
      }

    } catch (error) {
      SessionLogger.error('Error consolidating research results', '', error);
      
      // Get session for fallback
      let fallbackSession = session;
      if (!fallbackSession) {
        try {
          fallbackSession = await this.databaseUtils.getSession(sessionId);
        } catch (sessionError) {
          SessionLogger.log('Could not retrieve session for fallback');
        }
      }
      
      return this.generateBasicFallbackResults(sessionId, researchResults, fallbackSession);
    }
  }

  /**
   * Generate basic fallback results when consolidation fails
   */
  generateBasicFallbackResults(sessionId, researchResults, session) {
    SessionLogger.log('Generating basic fallback results');
    
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
}

module.exports = ResearchWorkflow; 