class ConsolidatedSessionSummarizer {
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Consolidated session research summarization that generates all required fields in a single AI call
   * @param {Array} researchResults - Array of research results from performSessionResearch
   * @param {Object} entrySpecificResearch - Entry-specific research data 
   * @param {Object} session - Session object with metadata
   * @param {Array} sessionItems - Session items for context
   * @returns {Object} Complete session research summary with all required fields
   */
  async generateCompleteSessionSummary(researchResults, entrySpecificResearch, session, sessionItems) {
    try {
      console.log(`ConsolidatedSessionSummarizer: Processing ${researchResults.length} research results for comprehensive summary`);
      
      // Extract and organize research data
      const processedData = this.processResearchData(researchResults, entrySpecificResearch, session);
      
      // Check if AI service is available
      if (!this.aiService?.langGraphClient) {
        console.log('ConsolidatedSessionSummarizer: LangGraph not available, using fallback');
        return this.generateFallbackSummary(processedData, session);
      }

      // Create comprehensive research context for the AI workflow
      const workflowInput = this.buildWorkflowInput(processedData, session, sessionItems);
      
      // Call the new consolidated LangGraph workflow
      console.log('ConsolidatedSessionSummarizer: Calling session_research_consolidation workflow');
      const result = await this.aiService.langGraphClient.executeWorkflow('session_research_consolidation', workflowInput);
      
      if (result && this.validateWorkflowResult(result)) {
        console.log('ConsolidatedSessionSummarizer: Successfully generated comprehensive session summary');
        return this.formatWorkflowResult(result, processedData, session);
      } else {
        console.log('ConsolidatedSessionSummarizer: Invalid workflow result, using fallback');
        return this.generateFallbackSummary(processedData, session);
      }
      
    } catch (error) {
      console.error('ConsolidatedSessionSummarizer: Error generating consolidated summary:', error.message);
      return this.generateFallbackSummary(this.processResearchData(researchResults, entrySpecificResearch, session), session);
    }
  }

  /**
   * Process and organize research data for AI consumption
   */
  processResearchData(researchResults, entrySpecificResearch, session) {
    // Extract entities from research entries and results
    const entitiesResearched = [];
    const aspectsCovered = [];
    
    // Process entries to extract entities and aspects
    if (entrySpecificResearch.entries) {
      entrySpecificResearch.entries.forEach(entry => {
        // Extract entities from tags
        if (entry.tags && Array.isArray(entry.tags)) {
          entry.tags.forEach(tag => {
            if (!entitiesResearched.includes(tag)) {
              entitiesResearched.push(tag);
            }
          });
        }
        
        // Extract aspects from research queries
        if (entry.researchQueries && Array.isArray(entry.researchQueries)) {
          entry.researchQueries.forEach(query => {
            if (query.aspect && !aspectsCovered.includes(query.aspect)) {
              aspectsCovered.push(query.aspect);
            }
          });
        }
      });
    }

    // Extract from research results
    researchResults.forEach(result => {
      if (result.aspect && !aspectsCovered.includes(result.aspect)) {
        aspectsCovered.push(result.aspect);
      }
      
      // Extract entities from research query terms
      if (result.query) {
        const queryTerms = result.query.split(' ').slice(0, 3);
        queryTerms.forEach(term => {
          if (term.length > 3 && !entitiesResearched.includes(term)) {
            entitiesResearched.push(term);
          }
        });
      }
    });

    // Organize research findings by aspect
    const organizedFindings = this.organizeFindings(researchResults);
    
    // Extract all research content
    const allResearchContent = researchResults.map(result => ({
      aspect: result.aspect,
      query: result.query,
      findings: result.result?.key_findings || result.result?.keyFindings || [],
      summary: result.result?.research_summary || result.result?.researchSummary || '',
      sources: result.result?.sources || []
    }));

    // Calculate metrics
    const totalSources = allResearchContent.reduce((total, content) => {
      return total + (content.sources ? content.sources.length : 0);
    }, 0);

    const totalFindings = allResearchContent.reduce((total, content) => {
      return total + (content.findings ? content.findings.length : 0);
    }, 0);

    // Apply fallbacks if needed
    if (entitiesResearched.length === 0) {
      entitiesResearched.push(session.session_type.replace('_', ' '));
    }
    
    if (aspectsCovered.length === 0) {
      aspectsCovered.push('general_information');
    }

    return {
      entitiesResearched,
      aspectsCovered,
      organizedFindings,
      allResearchContent,
      totalSources,
      totalFindings,
      researchQuality: this.assessResearchQuality(researchResults)
    };
  }

  /**
   * Build comprehensive input for the LangGraph workflow
   */
  buildWorkflowInput(processedData, session, sessionItems) {
    const sessionContext = {
      sessionId: session.id,
      sessionType: session.session_type,
      sessionLabel: session.session_label,
      itemCount: sessionItems ? sessionItems.length : 0,
      timespan: this.calculateSessionTimespan(sessionItems)
    };

    const researchScope = {
      entitiesResearched: processedData.entitiesResearched,
      aspectsCovered: processedData.aspectsCovered,
      totalSources: processedData.totalSources,
      totalFindings: processedData.totalFindings,
      researchQuality: processedData.researchQuality
    };

    const researchData = {
      findings: processedData.organizedFindings,
      content: processedData.allResearchContent,
      aspectBreakdown: this.groupFindingsByAspect(processedData.organizedFindings),
      uniqueSources: this.extractUniqueSources(processedData.allResearchContent)
    };

    return {
      content: `Consolidate comprehensive session research for ${session.session_type} session analyzing ${processedData.entitiesResearched.join(', ')} across ${processedData.aspectsCovered.join(', ')} aspects`,
      context: {
        sourceApp: 'ConsolidatedSessionSummarizer',
        windowTitle: 'Session Research Consolidation',
        sessionContext,
        researchScope,
        consolidationType: 'complete_session_summary'
      },
      existingAnalysis: {
        contentType: 'session_research_consolidation',
        tags: ['session', 'research', 'consolidation', session.session_type],
        contextInsights: `Consolidate research on ${processedData.entitiesResearched.join(', ')} covering ${processedData.aspectsCovered.join(', ')} with ${processedData.totalSources} sources and ${processedData.totalFindings} findings`,
        researchData
      }
    };
  }

  /**
   * Validate that the workflow result contains all required fields
   */
  validateWorkflowResult(result) {
    const requiredFields = ['researchObjective', 'summary', 'primaryIntent', 'researchGoals', 'nextSteps'];
    return requiredFields.every(field => result.hasOwnProperty(field));
  }

  /**
   * Format and structure the workflow result
   */
  formatWorkflowResult(result, processedData, session) {
    return {
      sessionId: session.id,
      researchObjective: result.researchObjective || result.objective || `${session.session_type.replace('_', ' ')} analysis`,
      summary: result.summary || result.comprehensiveSummary || `Research completed with ${processedData.totalFindings} findings from ${processedData.totalSources} sources`,
      primaryIntent: result.primaryIntent || result.intent || 'Information gathering and analysis',
      keyFindings: processedData.organizedFindings.map(f => f.finding),
      researchGoals: Array.isArray(result.researchGoals) ? result.researchGoals : (result.goals ? [result.goals] : ['Complete comprehensive analysis']),
      nextSteps: Array.isArray(result.nextSteps) ? result.nextSteps : (result.actions ? [result.actions] : ['Review findings']),
      entitiesResearched: processedData.entitiesResearched,
      aspectsCovered: processedData.aspectsCovered,
      totalSources: processedData.totalSources,
      researchQuality: processedData.researchQuality,
      timestamp: new Date().toISOString(),
      
      // Detailed research data
      researchData: {
        sources: this.extractUniqueSources(processedData.allResearchContent),
        aspectBreakdown: this.groupFindingsByAspect(processedData.organizedFindings),
        confidenceLevel: this.calculateResearchConfidence(processedData.organizedFindings)
      }
    };
  }

  /**
   * Generate fallback summary when AI is not available
   */
  generateFallbackSummary(processedData, session) {
    console.log('ConsolidatedSessionSummarizer: Generating fallback summary');
    
    const entities = processedData.entitiesResearched;
    const aspects = processedData.aspectsCovered;
    const sessionType = session.session_type;

    // Generate basic objective
    let objective = `${sessionType.replace('_', ' ')} analysis`;
    if (entities.length > 1) {
      objective = `Compare ${entities.slice(0, 2).join(' and ')}`;
    } else if (entities.length === 1) {
      objective = `Research ${entities[0]}`;
    }

    // Generate basic summary
    const summary = `Completed ${sessionType.replace('_', ' ')} with ${processedData.totalFindings} key findings from ${processedData.totalSources} sources covering ${aspects.join(', ')}.`;

    // Generate basic goals and next steps based on session type
    const { goals, nextSteps } = this.generateFallbackGoalsAndSteps(sessionType, entities);

    return {
      sessionId: session.id,
      researchObjective: objective,
      summary: summary,
      primaryIntent: entities.length > 1 ? `Compare ${entities.slice(0, 2).join(' and ')}` : `Research ${entities[0] || 'information'}`,
      keyFindings: processedData.organizedFindings.map(f => f.finding),
      researchGoals: goals,
      nextSteps: nextSteps,
      entitiesResearched: processedData.entitiesResearched,
      aspectsCovered: processedData.aspectsCovered,
      totalSources: processedData.totalSources,
      researchQuality: processedData.researchQuality,
      timestamp: new Date().toISOString(),
      
      researchData: {
        sources: this.extractUniqueSources(processedData.allResearchContent),
        aspectBreakdown: this.groupFindingsByAspect(processedData.organizedFindings),
        confidenceLevel: this.calculateResearchConfidence(processedData.organizedFindings)
      }
    };
  }

  /**
   * Generate session-type specific goals and next steps for fallback
   */
  generateFallbackGoalsAndSteps(sessionType, entities) {
    const goals = [];
    const nextSteps = [];

    switch (sessionType) {
      case 'hotel_research':
        goals.push('Select optimal accommodation', 'Compare pricing and amenities');
        nextSteps.push('Check availability and rates', 'Make reservation');
        break;
      case 'restaurant_research':
        goals.push('Choose best dining option', 'Evaluate cuisine and atmosphere');
        nextSteps.push('Check availability', 'Make reservation');
        break;
      case 'product_research':
        goals.push('Make informed purchase decision', 'Compare features and pricing');
        nextSteps.push('Finalize product selection', 'Proceed with purchase');
        break;
      case 'travel_research':
        goals.push('Plan comprehensive itinerary', 'Optimize travel logistics');
        nextSteps.push('Book accommodations', 'Arrange transportation');
        break;
      case 'academic_research':
        goals.push('Gather comprehensive information', 'Analyze research findings');
        nextSteps.push('Synthesize findings', 'Prepare analysis');
        break;
      default:
        goals.push('Complete comprehensive analysis', 'Make informed decisions');
        nextSteps.push('Review findings', 'Take appropriate action');
    }

    if (entities.length > 1) {
      goals.unshift(`Finalize selection between ${entities.slice(0, 2).join(' and ')}`);
    }

    return { goals: goals.slice(0, 4), nextSteps: nextSteps.slice(0, 3) };
  }

  // Helper methods
  organizeFindings(researchResults) {
    const organizedFindings = [];
    
    researchResults.forEach(result => {
      try {
        const findings = result.result?.key_findings || result.result?.keyFindings || [];
        findings.forEach(finding => {
          if (finding && typeof finding === 'string') {
            organizedFindings.push({
              aspect: result.aspect,
              finding: finding,
              entryId: result.entryId,
              query: result.query,
              sources: result.result?.sources?.length || 0
            });
          }
        });
      } catch (error) {
        console.log(`ConsolidatedSessionSummarizer: Error processing research result:`, error.message);
      }
    });
    
    return organizedFindings;
  }

  assessResearchQuality(researchResults) {
    if (!researchResults || researchResults.length === 0) return 'none';
    
    const totalFindings = researchResults.reduce((total, result) => {
      return total + (result.result?.key_findings?.length || result.result?.keyFindings?.length || 0);
    }, 0);
    
    const totalSources = researchResults.reduce((total, result) => {
      return total + (result.result?.sources?.length || 0);
    }, 0);
    
    if (totalFindings >= 10 && totalSources >= 5) return 'high';
    if (totalFindings >= 5 && totalSources >= 3) return 'good';
    if (totalFindings >= 2 && totalSources >= 1) return 'moderate';
    return 'basic';
  }

  extractUniqueSources(allResearchContent) {
    const allSources = allResearchContent.flatMap(content => content.sources || []);
    const uniqueUrls = [...new Set(allSources.map(source => {
      if (typeof source === 'string') return source;
      return source.url || source.link || 'unknown';
    }))];
    
    return uniqueUrls.map(url => ({ url, title: this.extractTitleFromUrl(url) }));
  }

  extractTitleFromUrl(url) {
    if (!url || typeof url !== 'string') return 'Unknown Source';
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch {
      return 'Unknown Source';
    }
  }

  groupFindingsByAspect(organizedFindings) {
    const aspectBreakdown = {};
    
    organizedFindings.forEach(finding => {
      const aspect = finding.aspect || 'general';
      if (!aspectBreakdown[aspect]) {
        aspectBreakdown[aspect] = {
          count: 0,
          findings: [],
          sources: 0
        };
      }
      
      aspectBreakdown[aspect].count++;
      aspectBreakdown[aspect].findings.push(finding.finding);
      aspectBreakdown[aspect].sources += finding.sources || 0;
    });
    
    return aspectBreakdown;
  }

  calculateResearchConfidence(organizedFindings) {
    if (!organizedFindings || organizedFindings.length === 0) return 0;
    
    const totalFindings = organizedFindings.length;
    const aspectCoverage = [...new Set(organizedFindings.map(f => f.aspect))].length;
    const avgSourcesPerFinding = organizedFindings.reduce((total, f) => total + f.sources, 0) / totalFindings;
    
    // Base confidence on coverage and source quality
    const baseConfidence = Math.min(totalFindings / 10, 1.0); // Up to 10 findings = 100%
    const aspectBonus = Math.min(aspectCoverage / 5, 0.2); // Up to 5 aspects = 20% bonus
    const sourceBonus = Math.min(avgSourcesPerFinding / 3, 0.2); // Up to 3 avg sources = 20% bonus
    
    return Math.min(baseConfidence + aspectBonus + sourceBonus, 1.0);
  }

  calculateSessionTimespan(sessionItems) {
    if (!sessionItems || sessionItems.length === 0) return 0;
    
    const timestamps = sessionItems.map(item => new Date(item.timestamp).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    
    return Math.round((maxTime - minTime) / (1000 * 60)); // Return in minutes
  }
}

module.exports = ConsolidatedSessionSummarizer;
