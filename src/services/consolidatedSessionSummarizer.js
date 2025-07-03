class ConsolidatedSessionSummarizer {
  constructor(aiService) {
    this.aiService = aiService;
  }

  /**
   * Consolidated session research summarization with intelligent entity relationship analysis
   * @param {Array} researchResults - Array of research results from performSessionResearch
   * @param {Object} entrySpecificResearch - Entry-specific research data 
   * @param {Object} session - Session object with metadata
   * @param {Array} sessionItems - Session items for context
   * @returns {Object} Complete session research summary with intelligent consolidation
   */
  async generateCompleteSessionSummary(researchResults, entrySpecificResearch, session, sessionItems) {
    try {
      console.log(`ConsolidatedSessionSummarizer: Processing ${(researchResults || []).length} research results with intelligent consolidation`);
      
      // Add safety checks for input parameters
      if (!session) {
        console.log('ConsolidatedSessionSummarizer: No session provided, using fallback');
        return this.generateFallbackSummary({ entitiesResearched: ['research'], aspectsCovered: ['general'], organizedFindings: [], allResearchContent: [], totalSources: 0, totalFindings: 0, researchQuality: 'none' }, { session_type: 'general_research' });
      }
      
      const safeResearchResults = researchResults || [];
      const safeSessionItems = sessionItems || [];
      
      // Step 1: Analyze entity relationships and determine consolidation strategy
      const entityAnalysis = await this.analyzeEntityRelationships(safeResearchResults, safeSessionItems, session);
      
      if (!entityAnalysis || !entityAnalysis.consolidationStrategy) {
        console.log('ConsolidatedSessionSummarizer: Entity analysis failed, using generic fallback');
        const fallbackData = this.processResearchData(safeResearchResults, entrySpecificResearch || { entries: [], totalQueries: 0 }, session);
        return this.generateFallbackSummary(fallbackData, session);
      }
      
      console.log(`ConsolidatedSessionSummarizer: Entity analysis complete - Strategy: ${entityAnalysis.consolidationStrategy}`);
      
      // Step 2: Apply appropriate consolidation strategy based on entity relationships
      let consolidatedResults;
      try {
        switch (entityAnalysis.consolidationStrategy) {
          case 'COMPARE':
            consolidatedResults = await this.generateComparisonSummary(safeResearchResults, entityAnalysis, session, safeSessionItems);
            break;
          case 'MERGE':
            consolidatedResults = await this.generateMergedSummary(safeResearchResults, entityAnalysis, session, safeSessionItems);
            break;
          case 'COMPLEMENT':
            consolidatedResults = await this.generateComplementarySummary(safeResearchResults, entityAnalysis, session, safeSessionItems);
            break;
          default:
            consolidatedResults = await this.generateGenericSummary(safeResearchResults, entityAnalysis, session, safeSessionItems);
            break;
        }
      } catch (strategyError) {
        console.error(`ConsolidatedSessionSummarizer: Error in ${entityAnalysis.consolidationStrategy} strategy:`, strategyError.message);
        // Fallback to generic strategy
        consolidatedResults = await this.generateGenericSummary(safeResearchResults, entityAnalysis, session, safeSessionItems);
      }
      
      // Step 3: Enhance results with entity context
      if (consolidatedResults) {
        consolidatedResults.entityAnalysis = entityAnalysis;
        consolidatedResults.consolidationStrategy = entityAnalysis.consolidationStrategy;
        console.log(`ConsolidatedSessionSummarizer: Successfully consolidated using ${entityAnalysis.consolidationStrategy} strategy`);
        return consolidatedResults;
      } else {
        console.log('ConsolidatedSessionSummarizer: Consolidation returned null, using fallback');
        const fallbackData = this.processResearchData(safeResearchResults, entrySpecificResearch || { entries: [], totalQueries: 0 }, session);
        return this.generateFallbackSummary(fallbackData, session);
      }
      
    } catch (error) {
      console.error('ConsolidatedSessionSummarizer: Error in intelligent consolidation:', error.message);
      
      try {
        // Final fallback - create basic summary
        const safeResearchResults = researchResults || [];
        const fallbackData = this.processResearchData(safeResearchResults, entrySpecificResearch || { entries: [], totalQueries: 0 }, session || { session_type: 'general_research' });
        return this.generateFallbackSummary(fallbackData, session || { session_type: 'general_research' });
      } catch (fallbackError) {
        console.error('ConsolidatedSessionSummarizer: Even fallback failed:', fallbackError.message);
        
        // Absolute last resort - minimal summary
        return {
          sessionId: session?.id || 'unknown',
          researchObjective: 'Session research analysis',
          summary: 'Session research completed with basic processing due to system errors',
          primaryIntent: 'Information gathering',
          keyFindings: [],
          researchGoals: ['Complete research analysis'],
          nextSteps: ['Review available information'],
          entitiesResearched: ['research items'],
          aspectsCovered: ['general'],
          totalSources: 0,
          researchQuality: 'error_fallback',
          timestamp: new Date().toISOString(),
          researchData: {
            sources: [],
            aspectBreakdown: {},
            confidenceLevel: 0.1
          },
          entityAnalysis: {
            consolidationStrategy: 'ERROR_FALLBACK',
            relationshipType: 'UNKNOWN',
            entities: [],
            reasoning: 'System error occurred during analysis',
            confidence: 0.1
          }
        };
      }
    }
  }

  /**
   * Analyze entity relationships to determine optimal consolidation strategy
   */
  async analyzeEntityRelationships(researchResults, sessionItems, session) {
    try {
      console.log('ConsolidatedSessionSummarizer: Analyzing entity relationships...');
      
      // Check if AI service is available
      if (!this.aiService?.langGraphClient) {
        console.log('ConsolidatedSessionSummarizer: LangGraph not available, using pattern-based analysis');
        return this.analyzeEntityRelationshipsPattern(researchResults, sessionItems, session);
      }

      // Prepare data for entity analysis
      const analysisInput = {
        content: `Analyze entity relationships for intelligent consolidation of ${session.session_type} research`,
        context: {
          sourceApp: 'ConsolidatedSessionSummarizer',
          windowTitle: 'Entity Relationship Analysis',
          sessionType: session.session_type,
          sessionLabel: session.session_label,
          analysisType: 'entity_relationship_analysis',
          sessionItems: sessionItems.map(item => ({
            id: item.id,
            content: item.content,
            source_app: item.source_app,
            window_title: item.window_title
          })),
          researchResults: researchResults.map(result => ({
            entryId: result.entryId,
            aspect: result.aspect,
            query: result.query,
            keyFindings: result.result?.key_findings?.slice(0, 5) || [],
            summary: result.result?.research_summary || ''
          }))
        }
      };

      // Use session_management workflow for entity analysis
      const entityAnalysis = await this.aiService.langGraphClient.executeWorkflow('session_management', analysisInput);
      
      if (entityAnalysis && entityAnalysis.entityRelationships) {
        const processedResult = this.processEntityAnalysisResult(entityAnalysis, researchResults, sessionItems);
        if (processedResult) {
          return processedResult;
        } else {
          console.log('ConsolidatedSessionSummarizer: AI entity analysis processing failed, using pattern-based fallback');
          return this.analyzeEntityRelationshipsPattern(researchResults, sessionItems, session);
        }
      } else {
        console.log('ConsolidatedSessionSummarizer: AI entity analysis failed - no entityRelationships in result, using pattern-based fallback');
        return this.analyzeEntityRelationshipsPattern(researchResults, sessionItems, session);
      }
      
    } catch (error) {
      console.error('ConsolidatedSessionSummarizer: Error in entity relationship analysis:', error.message);
      return this.analyzeEntityRelationshipsPattern(researchResults, sessionItems, session);
    }
  }

  /**
   * Process AI entity analysis result into standardized format
   */
  processEntityAnalysisResult(entityAnalysis, researchResults, sessionItems) {
    console.log('ConsolidatedSessionSummarizer: Processing entity analysis result:', {
      hasEntityRelationships: !!entityAnalysis.entityRelationships,
      entityAnalysisKeys: Object.keys(entityAnalysis),
      entityRelationshipsValue: entityAnalysis.entityRelationships
    });
    
    const relationships = entityAnalysis.entityRelationships || {};
    
    // If we don't have a valid consolidation strategy from AI, return null to trigger fallback
    if (!relationships.consolidationStrategy || relationships.consolidationStrategy === 'GENERIC') {
      console.log('ConsolidatedSessionSummarizer: AI analysis returned no valid strategy, will use pattern-based fallback');
      return null;
    }
    
    // IMPORTANT: Always extract entities from actual sessionItems, not AI-generated placeholder entities
    // The AI often returns fake entities with placeholder IDs like "item1", "item2" 
    // We need the real clipboard item IDs to match research results
    const realEntities = this.extractEntitiesFromItems(sessionItems);
    console.log('ConsolidatedSessionSummarizer: Extracted real entities from sessionItems:', realEntities.map(e => ({
      id: e.id,
      name: e.name,
      clipboardItemId: e.clipboardItemId,
      type: e.type
    })));
    
    return {
      consolidationStrategy: relationships.consolidationStrategy,
      relationshipType: relationships.type || 'INDEPENDENT_ENTITIES',
      entities: realEntities, // Use real entities, not AI placeholders
      comparisonDimensions: relationships.comparisonDimensions || ['features', 'pricing', 'quality'],
      reasoning: relationships.reasoning || 'AI-based entity analysis',
      confidence: relationships.confidence || 0.7
    };
  }

  /**
   * Pattern-based entity relationship analysis (fallback)
   */
  analyzeEntityRelationshipsPattern(researchResults, sessionItems, session) {
    console.log('ConsolidatedSessionSummarizer: Using pattern-based entity analysis');
    
    // Add safety checks
    if (!sessionItems || !Array.isArray(sessionItems) || sessionItems.length === 0) {
      console.log('ConsolidatedSessionSummarizer: No session items available for entity analysis');
      return {
        consolidationStrategy: 'GENERIC',
        relationshipType: 'INDEPENDENT_ENTITIES',
        entities: [],
        comparisonDimensions: [],
        reasoning: 'No session items available for analysis',
        confidence: 0.3
      };
    }
    
    const entities = this.extractEntitiesFromItems(sessionItems);
    const sessionType = session?.session_type || 'general_research';
    
    // Determine relationship type based on content analysis
    if (entities.length <= 1) {
      return {
        consolidationStrategy: 'MERGE',
        relationshipType: 'SAME_ENTITY',
        entities: entities,
        comparisonDimensions: [],
        reasoning: 'Single entity or very similar entities detected',
        confidence: 0.8
      };
    }
    
    // Check if entities are of the same type (e.g., multiple hotels)
    const entityTypes = [...new Set(entities.map(e => e.type))];
    if (entityTypes.length === 1 && sessionType.includes('research')) {
      return {
        consolidationStrategy: 'COMPARE',
        relationshipType: 'COMPARABLE_ENTITIES',
        entities: entities,
        comparisonDimensions: this.getComparisonDimensions(sessionType),
        reasoning: `Multiple ${entityTypes[0]} entities detected - comparison needed`,
        confidence: 0.75
      };
    }
    
    // Check if entities are complementary (e.g., hotel + restaurant)
    if (entityTypes.length > 1 && this.areComplementaryTypes(entityTypes)) {
      return {
        consolidationStrategy: 'COMPLEMENT',
        relationshipType: 'COMPLEMENTARY_ENTITIES',
        entities: entities,
        comparisonDimensions: [],
        reasoning: 'Complementary entities detected (e.g., hotel + restaurant)',
        confidence: 0.7
      };
    }
    
    // Default to generic consolidation
    return {
      consolidationStrategy: 'GENERIC',
      relationshipType: 'INDEPENDENT_ENTITIES',
      entities: entities,
      comparisonDimensions: [],
      reasoning: 'Independent entities - generic consolidation',
      confidence: 0.6
    };
  }

  /**
   * Extract entities from session items
   */
  extractEntitiesFromItems(sessionItems) {
    console.log('ConsolidatedSessionSummarizer: Debugging extractEntitiesFromItems...');
    console.log('ConsolidatedSessionSummarizer: SessionItems input:', sessionItems);
    console.log('ConsolidatedSessionSummarizer: SessionItems structure:', sessionItems?.map(item => ({
      id: item?.id,
      content: item?.content?.substring(0, 50),
      hasId: !!item?.id,
      keys: Object.keys(item || {})
    })));
    
    if (!sessionItems || !Array.isArray(sessionItems)) {
      console.log('ConsolidatedSessionSummarizer: SessionItems is null or not an array');
      return [];
    }
    
    return sessionItems.map((item, index) => {
      console.log(`ConsolidatedSessionSummarizer: Processing sessionItem ${index}:`, {
        id: item?.id,
        content: item?.content?.substring(0, 30),
        source_app: item?.source_app,
        keys: Object.keys(item || {})
      });
      
      if (!item || !item.content) {
        console.log(`ConsolidatedSessionSummarizer: Item ${index} has no content, creating unknown entity`);
        return {
          id: item?.id || `unknown_${index}`,
          name: 'Unknown Item',
          type: 'general',
          clipboardItemId: item?.id || `unknown_${index}`,
          originalContent: item?.content || '',
          sourceApp: item?.source_app || 'unknown'
        };
      }
      
      const content = item.content.toLowerCase();
      
      // Detect entity type based on content
      let entityType = 'general';
      if (content.includes('hotel') || content.includes('resort') || content.includes('inn')) {
        entityType = 'hotel';
      } else if (content.includes('restaurant') || content.includes('dining') || content.includes('menu')) {
        entityType = 'restaurant';
      } else if (content.includes('product') || content.includes('buy') || content.includes('price')) {
        entityType = 'product';
      }
      
      // Extract entity name (first few words or key terms)
      const entityName = this.extractEntityName(item.content, entityType);
      
      const entity = {
        id: item.id || `entity_${index}`,
        name: entityName,
        type: entityType,
        clipboardItemId: item.id || `unknown_id_${index}`,
        originalContent: item.content,
        sourceApp: item.source_app
      };
      
      console.log(`ConsolidatedSessionSummarizer: Created entity ${index}:`, {
        id: entity.id,
        name: entity.name,
        clipboardItemId: entity.clipboardItemId,
        type: entity.type
      });
      
      return entity;
    });
  }

  /**
   * Extract meaningful entity name from content
   */
  extractEntityName(content, entityType) {
    // Try to extract proper names, hotel names, restaurant names, etc.
    const words = content.split(' ');
    
    // Look for capitalized words (likely proper names)
    const properNames = words.filter(word => 
      word.length > 2 && 
      word[0] === word[0].toUpperCase() && 
      !['The', 'A', 'An', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For', 'With'].includes(word)
    );
    
    if (properNames.length > 0) {
      return properNames.slice(0, 3).join(' ');
    }
    
    // Fallback to first few words
    return words.slice(0, 4).join(' ');
  }

  /**
   * Get comparison dimensions based on session type
   */
  getComparisonDimensions(sessionType) {
    const dimensionMap = {
      'hotel_research': ['price', 'amenities', 'location', 'reviews', 'availability'],
      'restaurant_research': ['cuisine', 'price', 'atmosphere', 'reviews', 'location'],
      'product_research': ['features', 'price', 'quality', 'reviews', 'availability'],
      'academic_research': ['relevance', 'authority', 'methodology', 'findings'],
      'travel_research': ['cost', 'convenience', 'experience', 'reviews']
    };
    
    return dimensionMap[sessionType] || ['features', 'quality', 'value', 'reviews'];
  }

  /**
   * Check if entity types are complementary
   */
  areComplementaryTypes(entityTypes) {
    const complementaryPairs = [
      ['hotel', 'restaurant'],
      ['hotel', 'travel'],
      ['restaurant', 'travel'],
      ['product', 'service'],
      ['academic', 'practical']
    ];
    
    return complementaryPairs.some(pair => 
      pair.every(type => entityTypes.some(entityType => entityType.includes(type)))
    );
  }

  /**
   * Generate comparison-focused summary for competing entities
   */
  async generateComparisonSummary(researchResults, entityAnalysis, session, sessionItems) {
    try {
      console.log('ConsolidatedSessionSummarizer: Generating comparison summary');
      
      const organizedData = this.organizeResearchByEntity(researchResults, entityAnalysis.entities);
      
      if (!this.aiService?.langGraphClient) {
        return this.generateComparisonFallback(organizedData, entityAnalysis, session);
      }

      // Prepare comprehensive research data for the AI workflow
      const detailedResearchData = {
        // Organized data by entity (preferred if IDs match)
        organizedByEntity: organizedData,
        
        // Raw research results as fallback (always available)
        rawResearchResults: researchResults.map(r => ({
          entryId: r.entryId,
          aspect: r.aspect,
          query: r.query,
          keyFindings: r.result?.key_findings || [],
          researchSummary: r.result?.research_summary || '',
          sources: r.result?.sources || [],
          sourcesCount: r.result?.sources?.length || 0,
          findingsCount: r.result?.key_findings?.length || 0
        })),
        
        // Consolidated findings and sources for easy access
        allFindings: researchResults.flatMap(r => 
          (r.result?.key_findings || []).map(finding => ({
            finding: finding,
            source: r.query,
            aspect: r.aspect,
            entryId: r.entryId
          }))
        ),
        
        allSources: researchResults.flatMap(r => r.result?.sources || []),
        
        // Summary statistics
        totalFindings: researchResults.reduce((total, r) => total + (r.result?.key_findings?.length || 0), 0),
        totalSources: researchResults.reduce((total, r) => total + (r.result?.sources?.length || 0), 0),
        researchQuality: this.assessResearchQuality(researchResults),
        
        // Entity information for context
        entities: entityAnalysis.entities.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          originalContent: e.originalContent
        }))
      };
      
      console.log('ConsolidatedSessionSummarizer: Prepared detailed research data:', {
        organizedEntitiesCount: Object.keys(organizedData).length,
        rawResultsCount: detailedResearchData.rawResearchResults.length,
        totalFindings: detailedResearchData.totalFindings,
        totalSources: detailedResearchData.totalSources,
        entitiesCount: detailedResearchData.entities.length
      });

      const workflowInput = {
        content: `Generate comprehensive comparison between ${entityAnalysis.entities.map(e => e.name).join(' and ')} for ${session.session_type} based on actual research findings`,
        context: {
          sourceApp: 'ConsolidatedSessionSummarizer',
          windowTitle: 'Comparison Analysis',
          consolidationType: 'entity_comparison',
          sessionType: session.session_type,
          comparisonDimensions: entityAnalysis.comparisonDimensions,
          entityCount: entityAnalysis.entities.length,
          hasDetailedData: detailedResearchData.totalFindings > 0,
          dataQuality: detailedResearchData.researchQuality
        },
        existingAnalysis: {
          contentType: 'comparison_analysis',
          consolidationStrategy: 'COMPARE',
          entities: entityAnalysis.entities,
          researchData: detailedResearchData, // Enhanced research data
          comparisonDimensions: entityAnalysis.comparisonDimensions,
          contextInsights: `Comparing ${entityAnalysis.entities.map(e => e.name).join(' vs ')} with ${detailedResearchData.totalFindings} research findings from ${detailedResearchData.totalSources} sources. Use the actual research data to generate specific, factual comparisons.`
        }
      };

      const result = await this.aiService.langGraphClient.executeWorkflow('session_research_consolidation', workflowInput);
      
      if (result && this.validateWorkflowResult(result)) {
        return this.formatComparisonResult(result, entityAnalysis, organizedData, session);
      } else {
        return this.generateComparisonFallback(organizedData, entityAnalysis, session);
      }
      
    } catch (error) {
      console.error('ConsolidatedSessionSummarizer: Error generating comparison summary:', error.message);
      const organizedData = this.organizeResearchByEntity(researchResults, entityAnalysis.entities);
      return this.generateComparisonFallback(organizedData, entityAnalysis, session);
    }
  }

  /**
   * Generate merged summary for same entity research
   */
  async generateMergedSummary(researchResults, entityAnalysis, session, sessionItems) {
    try {
      console.log('ConsolidatedSessionSummarizer: Generating merged summary for same entity');
      
      const mergedData = this.mergeResearchForSameEntity(researchResults, entityAnalysis.entities[0]);
      
      if (!this.aiService?.langGraphClient) {
        return this.generateMergedFallback(mergedData, entityAnalysis, session);
      }

      // Prepare comprehensive research data for merged analysis
      const detailedResearchData = {
        // Merged data (preferred)
        mergedData: mergedData,
        
        // Raw research results as fallback
        rawResearchResults: researchResults.map(r => ({
          entryId: r.entryId,
          aspect: r.aspect,
          query: r.query,
          keyFindings: r.result?.key_findings || [],
          researchSummary: r.result?.research_summary || '',
          sources: r.result?.sources || [],
          sourcesCount: r.result?.sources?.length || 0,
          findingsCount: r.result?.key_findings?.length || 0
        })),
        
        // Consolidated findings and sources
        allFindings: researchResults.flatMap(r => 
          (r.result?.key_findings || []).map(finding => ({
            finding: finding,
            source: r.query,
            aspect: r.aspect,
            entryId: r.entryId
          }))
        ),
        
        allSources: researchResults.flatMap(r => r.result?.sources || []),
        aspectsCovered: [...new Set(researchResults.map(r => r.aspect))],
        
        // Summary statistics
        totalFindings: researchResults.reduce((total, r) => total + (r.result?.key_findings?.length || 0), 0),
        totalSources: researchResults.reduce((total, r) => total + (r.result?.sources?.length || 0), 0),
        researchQuality: this.assessResearchQuality(researchResults),
        
        // Entity information
        entity: entityAnalysis.entities[0]
      };
      
      console.log('ConsolidatedSessionSummarizer: Prepared detailed merged research data:', {
        mergedDataAvailable: !!mergedData,
        rawResultsCount: detailedResearchData.rawResearchResults.length,
        totalFindings: detailedResearchData.totalFindings,
        totalSources: detailedResearchData.totalSources,
        aspectsCovered: detailedResearchData.aspectsCovered.length
      });

      const workflowInput = {
        content: `Generate comprehensive merged profile for ${entityAnalysis.entities[0]?.name || 'researched entity'} based on actual research findings`,
        context: {
          sourceApp: 'ConsolidatedSessionSummarizer',
          windowTitle: 'Merged Analysis',
          consolidationType: 'entity_merger',
          sessionType: session.session_type,
          entityName: entityAnalysis.entities[0]?.name,
          hasDetailedData: detailedResearchData.totalFindings > 0,
          dataQuality: detailedResearchData.researchQuality
        },
        existingAnalysis: {
          contentType: 'merged_analysis',
          consolidationStrategy: 'MERGE',
          entity: entityAnalysis.entities[0],
          researchData: detailedResearchData, // Enhanced research data
          aspectsCovered: detailedResearchData.aspectsCovered,
          contextInsights: `Merging research on ${entityAnalysis.entities[0]?.name} with ${detailedResearchData.totalFindings} findings from ${detailedResearchData.totalSources} sources across ${detailedResearchData.aspectsCovered.length} aspects. Use the actual research data to create a comprehensive entity profile.`
        }
      };

      const result = await this.aiService.langGraphClient.executeWorkflow('session_research_consolidation', workflowInput);
      
      if (result && this.validateWorkflowResult(result)) {
        return this.formatMergedResult(result, entityAnalysis, mergedData, session);
      } else {
        return this.generateMergedFallback(mergedData, entityAnalysis, session);
      }
      
    } catch (error) {
      console.error('ConsolidatedSessionSummarizer: Error generating merged summary:', error.message);
      const mergedData = this.mergeResearchForSameEntity(researchResults, entityAnalysis.entities[0]);
      return this.generateMergedFallback(mergedData, entityAnalysis, session);
    }
  }

  /**
   * Generate complementary summary for related entities
   */
  async generateComplementarySummary(researchResults, entityAnalysis, session, sessionItems) {
    try {
      console.log('ConsolidatedSessionSummarizer: Generating complementary summary');
      
      const complementaryData = this.organizeComplementaryResearch(researchResults, entityAnalysis.entities);
      
      if (!this.aiService?.langGraphClient) {
        return this.generateComplementaryFallback(complementaryData, entityAnalysis, session);
      }

      // Prepare comprehensive research data for complementary analysis
      const detailedResearchData = {
        // Complementary data (preferred)
        complementaryData: complementaryData,
        
        // Raw research results as fallback
        rawResearchResults: researchResults.map(r => ({
          entryId: r.entryId,
          aspect: r.aspect,
          query: r.query,
          keyFindings: r.result?.key_findings || [],
          researchSummary: r.result?.research_summary || '',
          sources: r.result?.sources || [],
          sourcesCount: r.result?.sources?.length || 0,
          findingsCount: r.result?.key_findings?.length || 0
        })),
        
        // Consolidated findings and sources
        allFindings: researchResults.flatMap(r => 
          (r.result?.key_findings || []).map(finding => ({
            finding: finding,
            source: r.query,
            aspect: r.aspect,
            entryId: r.entryId
          }))
        ),
        
        allSources: researchResults.flatMap(r => r.result?.sources || []),
        
        // Summary statistics
        totalFindings: researchResults.reduce((total, r) => total + (r.result?.key_findings?.length || 0), 0),
        totalSources: researchResults.reduce((total, r) => total + (r.result?.sources?.length || 0), 0),
        researchQuality: this.assessResearchQuality(researchResults),
        
        // Entity information
        entities: entityAnalysis.entities,
        entityTypes: [...new Set(entityAnalysis.entities.map(e => e.type))],
        relationshipType: entityAnalysis.relationshipType
      };
      
      console.log('ConsolidatedSessionSummarizer: Prepared detailed complementary research data:', {
        complementaryDataAvailable: !!complementaryData,
        rawResultsCount: detailedResearchData.rawResearchResults.length,
        totalFindings: detailedResearchData.totalFindings,
        totalSources: detailedResearchData.totalSources,
        entitiesCount: detailedResearchData.entities.length,
        entityTypes: detailedResearchData.entityTypes
      });

      const workflowInput = {
        content: `Generate complementary analysis showing how ${entityAnalysis.entities.map(e => e.name).join(' and ')} work together based on actual research findings`,
        context: {
          sourceApp: 'ConsolidatedSessionSummarizer',
          windowTitle: 'Complementary Analysis',
          consolidationType: 'entity_complementary',
          sessionType: session.session_type,
          entityTypes: detailedResearchData.entityTypes,
          hasDetailedData: detailedResearchData.totalFindings > 0,
          dataQuality: detailedResearchData.researchQuality
        },
        existingAnalysis: {
          contentType: 'complementary_analysis',
          consolidationStrategy: 'COMPLEMENT',
          entities: entityAnalysis.entities,
          researchData: detailedResearchData, // Enhanced research data
          relationshipType: entityAnalysis.relationshipType,
          contextInsights: `Analyzing complementary relationships between ${entityAnalysis.entities.map(e => e.name).join(' and ')} with ${detailedResearchData.totalFindings} research findings from ${detailedResearchData.totalSources} sources. Use the actual research data to identify synergies and coordination opportunities.`
        }
      };

      const result = await this.aiService.langGraphClient.executeWorkflow('session_research_consolidation', workflowInput);
      
      if (result && this.validateWorkflowResult(result)) {
        return this.formatComplementaryResult(result, entityAnalysis, complementaryData, session);
      } else {
        return this.generateComplementaryFallback(complementaryData, entityAnalysis, session);
      }
      
    } catch (error) {
      console.error('ConsolidatedSessionSummarizer: Error generating complementary summary:', error.message);
      const complementaryData = this.organizeComplementaryResearch(researchResults, entityAnalysis.entities);
      return this.generateComplementaryFallback(complementaryData, entityAnalysis, session);
    }
  }

  /**
   * Generate generic summary (fallback for complex cases)
   */
  async generateGenericSummary(researchResults, entityAnalysis, session, sessionItems) {
    try {
      console.log('ConsolidatedSessionSummarizer: Generating generic summary');
      
      // Create a valid entrySpecificResearch object instead of passing null
      const entrySpecificResearch = {
        entries: sessionItems.map(item => ({
          itemId: item.id,
          content: item.content,
          contentType: 'unknown',
          tags: [],
          contextInsights: '',
          researchQueries: []
        })),
        totalQueries: researchResults.length,
        sessionType: session.session_type
      };
      
      // Use the original processing method but with entity context
      const processedData = this.processResearchData(researchResults, entrySpecificResearch, session);
      
      if (!this.aiService?.langGraphClient) {
        return this.generateFallbackSummary(processedData, session);
      }

      const workflowInput = this.buildWorkflowInput(processedData, session, sessionItems);
      const result = await this.aiService.langGraphClient.executeWorkflow('session_research_consolidation', workflowInput);
      
      if (result && this.validateWorkflowResult(result)) {
        const formattedResult = this.formatWorkflowResult(result, processedData, session);
        formattedResult.entityAnalysis = entityAnalysis;
        return formattedResult;
      } else {
        return this.generateFallbackSummary(processedData, session);
      }
      
    } catch (error) {
      console.error('ConsolidatedSessionSummarizer: Error generating generic summary:', error.message);
      // Create a minimal fallback processedData object
      const fallbackProcessedData = {
        entitiesResearched: entityAnalysis.entities?.map(e => e.name) || ['research items'],
        aspectsCovered: [...new Set(researchResults.map(r => r.aspect))],
        organizedFindings: researchResults.flatMap(r => 
          (r.result?.key_findings || []).map(finding => ({
            aspect: r.aspect,
            finding: finding,
            entryId: r.entryId,
            query: r.query,
            sources: r.result?.sources?.length || 0
          }))
        ),
        allResearchContent: researchResults.map(r => ({
          aspect: r.aspect,
          query: r.query,
          findings: r.result?.key_findings || [],
          summary: r.result?.research_summary || '',
          sources: r.result?.sources || []
        })),
        totalSources: researchResults.reduce((total, r) => total + (r.result?.sources?.length || 0), 0),
        totalFindings: researchResults.reduce((total, r) => total + (r.result?.key_findings?.length || 0), 0),
        researchQuality: 'basic'
      };
      
      return this.generateFallbackSummary(fallbackProcessedData, session);
    }
  }

  /**
   * Organize research results by entity for comparison
   */
  organizeResearchByEntity(researchResults, entities) {
    console.log('ConsolidatedSessionSummarizer: Debugging organizeResearchByEntity...');
    console.log('ConsolidatedSessionSummarizer: Research results structure:', researchResults.map(r => ({
      entryId: r.entryId,
      aspect: r.aspect,
      query: r.query,
      hasResult: !!r.result,
      keyFindingsCount: r.result?.key_findings?.length || 0,
      sourcesCount: r.result?.sources?.length || 0
    })));
    console.log('ConsolidatedSessionSummarizer: Entities structure:', entities.map(e => ({
      id: e.id,
      name: e.name,
      clipboardItemId: e.clipboardItemId,
      type: e.type
    })));

    const organizedData = {};
    
    entities.forEach(entity => {
      console.log(`ConsolidatedSessionSummarizer: Looking for research results with entryId: ${entity.clipboardItemId} for entity: ${entity.name}`);
      
      const entityResearch = researchResults.filter(r => {
        const matches = r.entryId === entity.clipboardItemId;
        console.log(`ConsolidatedSessionSummarizer: Research result entryId: ${r.entryId}, entity clipboardItemId: ${entity.clipboardItemId}, matches: ${matches}`);
        return matches;
      });
      
      console.log(`ConsolidatedSessionSummarizer: Found ${entityResearch.length} research results for entity ${entity.name}`);
      
      organizedData[entity.id] = {
        name: entity.name,
        type: entity.type,
        originalContent: entity.originalContent,
        research: entityResearch.map(r => ({
          aspect: r.aspect,
          query: r.query,
          keyFindings: r.result?.key_findings || [],
          summary: r.result?.research_summary || '',
          sources: r.result?.sources || []
        }))
      };
      
      const totalFindings = organizedData[entity.id].research.reduce((total, research) => total + research.keyFindings.length, 0);
      const totalSources = organizedData[entity.id].research.reduce((total, research) => total + research.sources.length, 0);
      console.log(`ConsolidatedSessionSummarizer: Entity ${entity.name} organized data - ${organizedData[entity.id].research.length} research entries, ${totalFindings} total findings, ${totalSources} total sources`);
    });
    
    const totalOrganizedFindings = Object.values(organizedData).reduce((total, entity) => 
      total + entity.research.reduce((entityTotal, research) => entityTotal + research.keyFindings.length, 0), 0
    );
    const totalOrganizedSources = Object.values(organizedData).reduce((total, entity) => 
      total + entity.research.reduce((entityTotal, research) => entityTotal + research.sources.length, 0), 0
    );
    
    console.log(`ConsolidatedSessionSummarizer: Final organized data summary - ${totalOrganizedFindings} total findings, ${totalOrganizedSources} total sources across ${entities.length} entities`);
    
    return organizedData;
  }

  /**
   * Merge research results for the same entity
   */
  mergeResearchForSameEntity(researchResults, entity) {
    const allFindings = [];
    const allSources = [];
    const aspectData = {};
    
    researchResults.forEach(result => {
      if (result.result?.key_findings) {
        allFindings.push(...result.result.key_findings);
      }
      if (result.result?.sources) {
        allSources.push(...result.result.sources);
      }
      
      if (!aspectData[result.aspect]) {
        aspectData[result.aspect] = [];
      }
      aspectData[result.aspect].push({
        query: result.query,
        findings: result.result?.key_findings || [],
        summary: result.result?.research_summary || ''
      });
    });
    
    return {
      entity: entity,
      allFindings: [...new Set(allFindings)],
      allSources: [...new Set(allSources.map(s => typeof s === 'string' ? s : s.url))],
      aspectData: aspectData,
      totalFindings: allFindings.length,
      totalSources: allSources.length
    };
  }

  /**
   * Organize complementary research
   */
  organizeComplementaryResearch(researchResults, entities) {
    const complementaryData = {
      entities: {},
      relationships: [],
      commonThemes: [],
      synergies: []
    };
    
    entities.forEach(entity => {
      const entityResearch = researchResults.filter(r => r.entryId === entity.clipboardItemId);
      
      complementaryData.entities[entity.id] = {
        name: entity.name,
        type: entity.type,
        research: entityResearch,
        keyFindings: entityResearch.flatMap(r => r.result?.key_findings || [])
      };
    });
    
    // Find common themes across entities
    const allFindings = Object.values(complementaryData.entities).flatMap(e => e.keyFindings);
    complementaryData.commonThemes = this.extractCommonThemes(allFindings);
    
    return complementaryData;
  }

  /**
   * Extract common themes from findings
   */
  extractCommonThemes(findings) {
    const themes = new Map();
    const keywords = ['location', 'price', 'quality', 'service', 'amenities', 'reviews', 'convenience'];
    
    keywords.forEach(keyword => {
      const relevantFindings = findings.filter(f => 
        f.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (relevantFindings.length > 1) {
        themes.set(keyword, relevantFindings);
      }
    });
    
    return Array.from(themes.entries()).map(([theme, findings]) => ({
      theme,
      findings: findings.slice(0, 3)
    }));
  }

  /**
   * Consolidated session research summarization that generates all required fields in a single AI call
   * @param {Array} researchResults - Array of research results from performSessionResearch
   * @param {Object} entrySpecificResearch - Entry-specific research data 
   * @param {Object} session - Session object with metadata
   * @param {Array} sessionItems - Session items for context
   * @returns {Object} Complete session research summary with all required fields
   */
  async generateCompleteSessionSummaryFallback(researchResults, entrySpecificResearch, session, sessionItems) {
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
    
    // Process entries to extract entities and aspects (with null safety)
    if (entrySpecificResearch && entrySpecificResearch.entries && Array.isArray(entrySpecificResearch.entries)) {
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

    // Extract from research results (always available)
    if (researchResults && Array.isArray(researchResults)) {
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
    }

    // Organize research findings by aspect
    const organizedFindings = this.organizeFindings(researchResults);
    
    // Extract all research content
    const allResearchContent = (researchResults || []).map(result => ({
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
      if (session && session.session_type) {
      entitiesResearched.push(session.session_type.replace('_', ' '));
      } else {
        entitiesResearched.push('research items');
      }
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
      researchQuality: this.assessResearchQuality(researchResults || [])
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
    
    // Add null safety check
    if (!researchResults || !Array.isArray(researchResults)) {
      console.log('ConsolidatedSessionSummarizer: No research results to organize');
      return organizedFindings;
    }
    
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
    if (!researchResults || !Array.isArray(researchResults) || researchResults.length === 0) {
      return 'none';
    }
    
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

  /**
   * Format comparison analysis result
   */
  formatComparisonResult(result, entityAnalysis, organizedData, session) {
    const entities = entityAnalysis.entities;
    const comparisonMatrix = result.comparisonMatrix || {};
    
    // Extract recommendations with entity context
    const recommendations = result.recommendations || this.generateComparisonRecommendations(organizedData, entities);
    
    // Create structured comparison summary
    const baseSummary = result.summary || this.buildComparisonSummary(entities, organizedData);
    
    // Format comparison matrix for display
    const formattedMatrix = this.formatComparisonMatrix(comparisonMatrix, entities, entityAnalysis.comparisonDimensions);
    
    // Combine base summary with formatted comparison matrix
    const comparisonSummary = baseSummary + 
      (formattedMatrix ? '\n\n' + formattedMatrix : '');
    
    // Aggregate all findings and sources
    const allFindings = Object.values(organizedData).flatMap(entity => 
      entity.research.flatMap(r => r.keyFindings)
    );
    const allSources = Object.values(organizedData).flatMap(entity => 
      entity.research.flatMap(r => r.sources)
    );
    
    return {
      sessionId: session.id,
      researchObjective: result.researchObjective || `Compare ${entities.map(e => e.name).join(' vs ')} for ${session.session_type.replace('_', ' ')}`,
      summary: comparisonSummary,
      primaryIntent: result.primaryIntent || `Compare and select between ${entities.length} ${entities[0]?.type || 'options'}`,
      keyFindings: allFindings.slice(0, 15),
      researchGoals: result.researchGoals || [`Compare ${entities.map(e => e.name).join(' and ')}`, 'Identify best option', 'Make informed decision'],
      nextSteps: recommendations.map(r => `${r.scenario}: Choose ${r.entity}`).slice(0, 3),
      entitiesResearched: entities.map(e => e.name),
      aspectsCovered: entityAnalysis.comparisonDimensions,
      totalSources: allSources.length,
      researchQuality: this.assessComparisonQuality(organizedData),
      timestamp: new Date().toISOString(),
      
      comparisonData: {
        entities: entities,
        comparisonMatrix: comparisonMatrix,
        recommendations: recommendations,
        winnerByCategory: this.determineWinnerByCategory(organizedData, entityAnalysis.comparisonDimensions)
      },
      
      researchData: {
        sources: this.extractUniqueSources(allSources),
        aspectBreakdown: this.groupComparisonByAspect(organizedData),
        confidenceLevel: this.calculateComparisonConfidence(organizedData)
      }
    };
  }

  /**
   * Format comparison matrix for clean display with aligned entries
   */
  formatComparisonMatrix(comparisonMatrix, entities, comparisonDimensions) {
    if (!comparisonMatrix || Object.keys(comparisonMatrix).length === 0) {
      return '';
    }
    
    const entityNames = entities.map(e => e.name);
    const dimensions = comparisonDimensions || Object.keys(comparisonMatrix);
    
    if (dimensions.length === 0 || entityNames.length === 0) {
      return '';
    }
    
    let matrixOutput = '\n\n';
    
    // Create table header
    const maxDimensionLength = Math.max(...dimensions.map(d => d.length), 8);
    const maxEntityLength = Math.max(...entityNames.map(n => n.length), 6);
    
    // Header row
    matrixOutput += `| ${'Aspect'.padEnd(maxDimensionLength)} |`;
    entityNames.forEach(name => {
      matrixOutput += ` ${name.padEnd(maxEntityLength)} |`;
    });
    matrixOutput += '\n';
    
    // Separator row
    matrixOutput += `|${'-'.repeat(maxDimensionLength + 2)}|`;
    entityNames.forEach(() => {
      matrixOutput += `${'-'.repeat(maxEntityLength + 2)}|`;
    });
    matrixOutput += '\n';
    
    // Data rows
    dimensions.forEach(dimension => {
      matrixOutput += `| ${dimension.padEnd(maxDimensionLength)} |`;
      
      entityNames.forEach(entityName => {
        const value = comparisonMatrix[dimension]?.[entityName] || 
                     comparisonMatrix[entityName]?.[dimension] || 
                     'N/A';
        const displayValue = typeof value === 'string' ? value : String(value);
        const truncatedValue = displayValue.length > maxEntityLength ? 
                              displayValue.substring(0, maxEntityLength - 3) + '...' : 
                              displayValue;
        matrixOutput += ` ${truncatedValue.padEnd(maxEntityLength)} |`;
      });
      matrixOutput += '\n';
    });
    
    return matrixOutput;
  }

  // Helper methods for quality assessment and grouping

  assessComparisonQuality(organizedData) {
    const entityCount = Object.keys(organizedData).length;
    const totalFindings = Object.values(organizedData).reduce((total, entity) => 
      total + entity.research.reduce((subtotal, r) => subtotal + r.keyFindings.length, 0), 0);
    
    if (entityCount >= 2 && totalFindings >= 10) return 'high';
    if (entityCount >= 2 && totalFindings >= 5) return 'good';
    return 'moderate';
  }

  assessMergedQuality(mergedData) {
    const aspectCount = Object.keys(mergedData.aspectData).length;
    const findingCount = mergedData.totalFindings;
    
    if (aspectCount >= 3 && findingCount >= 8) return 'high';
    if (aspectCount >= 2 && findingCount >= 4) return 'good';
    return 'moderate';
  }

  assessComplementaryQuality(complementaryData) {
    const entityCount = Object.keys(complementaryData.entities).length;
    const themeCount = complementaryData.commonThemes.length;
    
    if (entityCount >= 2 && themeCount >= 2) return 'good';
    if (entityCount >= 2) return 'moderate';
    return 'basic';
  }

  buildComparisonSummary(entities, organizedData) {
    return `Comprehensive comparison of ${entities.map(e => e.name).join(' vs ')} analyzing ${Object.values(organizedData).reduce((total, entity) => total + entity.research.length, 0)} research aspects to help make an informed decision.`;
  }

  buildMergedSummary(mergedData, entity) {
    return `Complete analysis of ${entity.name} consolidating ${mergedData.totalFindings} findings across ${Object.keys(mergedData.aspectData).length} research aspects.`;
  }

  buildComplementarySummary(entities, complementaryData) {
    return `Analysis of how ${entities.map(e => e.name).join(' and ')} complement each other, identifying ${complementaryData.commonThemes.length} synergies and coordination opportunities.`;
  }

  generateComparisonRecommendations(organizedData, entities) {
    // Simple recommendation based on research depth
    const recommendations = [];
    entities.forEach(entity => {
      const entityData = organizedData[entity.id];
      const findingCount = entityData.research.reduce((total, r) => total + r.keyFindings.length, 0);
      
      if (findingCount > 5) {
        recommendations.push({
          entity: entity.name,
          scenario: 'Well-researched option',
          reasoning: `Has ${findingCount} research findings`
        });
      }
    });
    
    return recommendations;
  }

  determineWinnerByCategory(organizedData, comparisonDimensions) {
    const winners = {};
    // This would require more sophisticated analysis
    // For now, return placeholder structure
    comparisonDimensions.forEach(dimension => {
      winners[dimension] = Object.keys(organizedData)[0] || 'unknown';
    });
    return winners;
  }

  groupComparisonByAspect(organizedData) {
    const aspectBreakdown = {};
    Object.values(organizedData).forEach(entity => {
      entity.research.forEach(research => {
        if (!aspectBreakdown[research.aspect]) {
          aspectBreakdown[research.aspect] = [];
        }
        aspectBreakdown[research.aspect].push({
          entity: entity.name,
          findings: research.keyFindings,
          summary: research.summary
        });
      });
    });
    return aspectBreakdown;
  }

  groupMergedByAspect(aspectData) {
    const aspectBreakdown = {};
    Object.keys(aspectData).forEach(aspect => {
      aspectBreakdown[aspect] = {
        queries: aspectData[aspect].length,
        findings: aspectData[aspect].flatMap(a => a.findings),
        summaries: aspectData[aspect].map(a => a.summary).filter(Boolean)
      };
    });
    return aspectBreakdown;
  }

  groupComplementaryByAspect(complementaryData) {
    const aspectBreakdown = {};
    Object.values(complementaryData.entities).forEach(entity => {
      entity.research.forEach(research => {
        if (!aspectBreakdown[research.aspect]) {
          aspectBreakdown[research.aspect] = [];
        }
        aspectBreakdown[research.aspect].push({
          entity: entity.name,
          findings: research.result?.key_findings || []
        });
      });
    });
    return aspectBreakdown;
  }

  calculateComparisonConfidence(organizedData) {
    const entityCount = Object.keys(organizedData).length;
    const avgFindings = Object.values(organizedData).reduce((total, entity) => 
      total + entity.research.reduce((subtotal, r) => subtotal + r.keyFindings.length, 0), 0) / entityCount;
    
    return Math.min(0.5 + (avgFindings / 10), 1.0);
  }

  calculateMergedConfidence(mergedData) {
    const aspectCount = Object.keys(mergedData.aspectData).length;
    const findingRatio = mergedData.totalFindings / 15; // Target 15 findings for high confidence
    
    return Math.min(0.6 + (aspectCount / 10) + (findingRatio / 3), 1.0);
  }

  calculateComplementaryConfidence(complementaryData) {
    const entityCount = Object.keys(complementaryData.entities).length;
    const themeCount = complementaryData.commonThemes.length;
    
    return Math.min(0.5 + (entityCount / 5) + (themeCount / 10), 1.0);
  }

  /**
   * Format merged analysis result
   */
  formatMergedResult(result, entityAnalysis, mergedData, session) {
    const entity = entityAnalysis.entities[0];
    const consolidatedProfile = result.consolidatedProfile || {};
    
    return {
      sessionId: session.id,
      researchObjective: result.researchObjective || `Comprehensive analysis of ${entity.name}`,
      summary: result.summary || result.comprehensiveAnalysis || this.buildMergedSummary(mergedData, entity),
      primaryIntent: result.primaryIntent || `Research and understand ${entity.name} thoroughly`,
      keyFindings: mergedData.allFindings.slice(0, 15),
      researchGoals: result.researchGoals || [`Complete analysis of ${entity.name}`, 'Understand all aspects', 'Make informed decision'],
      nextSteps: result.nextSteps || ['Review comprehensive findings', 'Evaluate suitability', 'Proceed with decision'],
      entitiesResearched: [entity.name],
      aspectsCovered: Object.keys(mergedData.aspectData),
      totalSources: mergedData.totalSources,
      researchQuality: this.assessMergedQuality(mergedData),
      timestamp: new Date().toISOString(),
      
      mergedData: {
        entity: entity,
        consolidatedProfile: consolidatedProfile,
        aspectAnalysis: mergedData.aspectData,
        comprehensiveView: true
      },
      
      researchData: {
        sources: this.extractUniqueSources(mergedData.allSources),
        aspectBreakdown: this.groupMergedByAspect(mergedData.aspectData),
        confidenceLevel: this.calculateMergedConfidence(mergedData)
      }
    };
  }

  /**
   * Format complementary analysis result
   */
  formatComplementaryResult(result, entityAnalysis, complementaryData, session) {
    const entities = entityAnalysis.entities;
    const synergies = result.synergies || complementaryData.commonThemes;
    
    // Extract all findings from complementary entities
    const allFindings = Object.values(complementaryData.entities).flatMap(e => e.keyFindings);
    const allSources = Object.values(complementaryData.entities).flatMap(e => 
      e.research.flatMap(r => r.result?.sources || [])
    );
    
    return {
      sessionId: session.id,
      researchObjective: result.researchObjective || `Understand synergies between ${entities.map(e => e.name).join(' and ')}`,
      summary: result.summary || this.buildComplementarySummary(entities, complementaryData),
      primaryIntent: result.primaryIntent || `Plan coordinated use of ${entities.map(e => e.type).join(' and ')}`,
      keyFindings: allFindings.slice(0, 15),
      researchGoals: result.researchGoals || [`Understand synergies between ${entities.map(e => e.name).join(' and ')}`, 'Plan coordinated approach', 'Optimize combined experience'],
      nextSteps: result.nextSteps || ['Plan coordinated approach', 'Consider timing and proximity', 'Book complementary services'],
      entitiesResearched: entities.map(e => e.name),
      aspectsCovered: [...new Set(Object.values(complementaryData.entities).flatMap(e => e.research.map(r => r.aspect)))],
      totalSources: allSources.length,
      researchQuality: this.assessComplementaryQuality(complementaryData),
      timestamp: new Date().toISOString(),
      
      complementaryData: {
        entities: entities,
        synergies: synergies,
        commonThemes: complementaryData.commonThemes,
        coordinationOpportunities: result.coordinationOpportunities || []
      },
      
      researchData: {
        sources: this.extractUniqueSources(allSources),
        aspectBreakdown: this.groupComplementaryByAspect(complementaryData),
        confidenceLevel: this.calculateComplementaryConfidence(complementaryData)
      }
    };
  }

  /**
   * Generate comparison fallback when AI is not available
   */
  generateComparisonFallback(organizedData, entityAnalysis, session) {
    console.log('ConsolidatedSessionSummarizer: Generating comparison fallback');
    
    const entities = entityAnalysis.entities;
    const allFindings = Object.values(organizedData).flatMap(entity => 
      entity.research.flatMap(r => r.keyFindings)
    );
    const allSources = Object.values(organizedData).flatMap(entity => 
      entity.research.flatMap(r => r.sources)
    );
    
    const summary = `Comparison analysis of ${entities.map(e => e.name).join(' vs ')} with ${allFindings.length} findings across ${entityAnalysis.comparisonDimensions.join(', ')}.`;
    
    return {
      sessionId: session.id,
      researchObjective: `Compare ${entities.map(e => e.name).join(' vs ')}`,
      summary: summary,
      primaryIntent: `Select best option from ${entities.length} alternatives`,
      keyFindings: allFindings.slice(0, 15),
      researchGoals: ['Compare all options', 'Identify strengths and weaknesses', 'Make informed choice'],
      nextSteps: ['Review comparison', 'Consider priorities', 'Make final selection'],
      entitiesResearched: entities.map(e => e.name),
      aspectsCovered: entityAnalysis.comparisonDimensions,
      totalSources: allSources.length,
      researchQuality: 'comparison_basic',
      timestamp: new Date().toISOString(),
      
      comparisonData: {
        entities: entities,
        comparisonMatrix: {},
        recommendations: [],
        fallbackMode: true
      },
      
      researchData: {
        sources: this.extractUniqueSources(allSources),
        aspectBreakdown: this.groupComparisonByAspect(organizedData),
        confidenceLevel: 0.6
      }
    };
  }

  /**
   * Generate merged fallback when AI is not available
   */
  generateMergedFallback(mergedData, entityAnalysis, session) {
    console.log('ConsolidatedSessionSummarizer: Generating merged fallback');
    
    const entity = entityAnalysis.entities[0];
    const summary = `Comprehensive analysis of ${entity.name} with ${mergedData.totalFindings} findings across ${Object.keys(mergedData.aspectData).length} aspects.`;
    
    return {
      sessionId: session.id,
      researchObjective: `Complete analysis of ${entity.name}`,
      summary: summary,
      primaryIntent: `Thoroughly understand ${entity.name}`,
      keyFindings: mergedData.allFindings.slice(0, 15),
      researchGoals: ['Complete comprehensive analysis', 'Understand all aspects', 'Make informed decision'],
      nextSteps: ['Review complete profile', 'Evaluate against needs', 'Proceed with decision'],
      entitiesResearched: [entity.name],
      aspectsCovered: Object.keys(mergedData.aspectData),
      totalSources: mergedData.totalSources,
      researchQuality: 'merged_basic',
      timestamp: new Date().toISOString(),
      
      mergedData: {
        entity: entity,
        consolidatedProfile: {},
        aspectAnalysis: mergedData.aspectData,
        fallbackMode: true
      },
      
      researchData: {
        sources: this.extractUniqueSources(mergedData.allSources),
        aspectBreakdown: this.groupMergedByAspect(mergedData.aspectData),
        confidenceLevel: 0.7
      }
    };
  }

  /**
   * Generate complementary fallback when AI is not available
   */
  generateComplementaryFallback(complementaryData, entityAnalysis, session) {
    console.log('ConsolidatedSessionSummarizer: Generating complementary fallback');
    
    const entities = entityAnalysis.entities;
    const allFindings = Object.values(complementaryData.entities).flatMap(e => e.keyFindings);
    const summary = `Complementary analysis of ${entities.map(e => e.name).join(' and ')} with ${allFindings.length} findings and ${complementaryData.commonThemes.length} common themes.`;
    
    return {
      sessionId: session.id,
      researchObjective: `Understand synergies between ${entities.map(e => e.name).join(' and ')}`,
      summary: summary,
      primaryIntent: `Coordinate ${entities.map(e => e.type).join(' and ')} for optimal experience`,
      keyFindings: allFindings.slice(0, 15),
      researchGoals: ['Identify synergies', 'Plan coordination', 'Optimize combined experience'],
      nextSteps: ['Plan coordinated approach', 'Consider timing and proximity', 'Book complementary services'],
      entitiesResearched: entities.map(e => e.name),
      aspectsCovered: [...new Set(Object.values(complementaryData.entities).flatMap(e => e.research.map(r => r.aspect)))],
      totalSources: Object.values(complementaryData.entities).reduce((total, e) => 
        total + e.research.reduce((subtotal, r) => subtotal + (r.result?.sources?.length || 0), 0), 0),
      researchQuality: 'complementary_basic',
      timestamp: new Date().toISOString(),
      
      complementaryData: {
        entities: entities,
        synergies: complementaryData.commonThemes,
        commonThemes: complementaryData.commonThemes,
        fallbackMode: true
      },
      
      researchData: {
        sources: [],
        aspectBreakdown: this.groupComplementaryByAspect(complementaryData),
        confidenceLevel: 0.65
      }
    };
  }

  // Helper methods for quality assessment and grouping

  assessComparisonQuality(organizedData) {
    const entityCount = Object.keys(organizedData).length;
    const totalFindings = Object.values(organizedData).reduce((total, entity) => 
      total + entity.research.reduce((subtotal, r) => subtotal + r.keyFindings.length, 0), 0);
    
    if (entityCount >= 2 && totalFindings >= 10) return 'high';
    if (entityCount >= 2 && totalFindings >= 5) return 'good';
    return 'moderate';
  }

  assessMergedQuality(mergedData) {
    const aspectCount = Object.keys(mergedData.aspectData).length;
    const findingCount = mergedData.totalFindings;
    
    if (aspectCount >= 3 && findingCount >= 8) return 'high';
    if (aspectCount >= 2 && findingCount >= 4) return 'good';
    return 'moderate';
  }

  assessComplementaryQuality(complementaryData) {
    const entityCount = Object.keys(complementaryData.entities).length;
    const themeCount = complementaryData.commonThemes.length;
    
    if (entityCount >= 2 && themeCount >= 2) return 'good';
    if (entityCount >= 2) return 'moderate';
    return 'basic';
  }

  buildComparisonSummary(entities, organizedData) {
    return `Comprehensive comparison of ${entities.map(e => e.name).join(' vs ')} analyzing ${Object.values(organizedData).reduce((total, entity) => total + entity.research.length, 0)} research aspects to help make an informed decision.`;
  }

  buildMergedSummary(mergedData, entity) {
    return `Complete analysis of ${entity.name} consolidating ${mergedData.totalFindings} findings across ${Object.keys(mergedData.aspectData).length} research aspects.`;
  }

  buildComplementarySummary(entities, complementaryData) {
    return `Analysis of how ${entities.map(e => e.name).join(' and ')} complement each other, identifying ${complementaryData.commonThemes.length} synergies and coordination opportunities.`;
  }

  generateComparisonRecommendations(organizedData, entities) {
    // Simple recommendation based on research depth
    const recommendations = [];
    entities.forEach(entity => {
      const entityData = organizedData[entity.id];
      const findingCount = entityData.research.reduce((total, r) => total + r.keyFindings.length, 0);
      
      if (findingCount > 5) {
        recommendations.push({
          entity: entity.name,
          scenario: 'Well-researched option',
          reasoning: `Has ${findingCount} research findings`
        });
      }
    });
    
    return recommendations;
  }

  determineWinnerByCategory(organizedData, comparisonDimensions) {
    const winners = {};
    // This would require more sophisticated analysis
    // For now, return placeholder structure
    comparisonDimensions.forEach(dimension => {
      winners[dimension] = Object.keys(organizedData)[0] || 'unknown';
    });
    return winners;
  }

  groupComparisonByAspect(organizedData) {
    const aspectBreakdown = {};
    Object.values(organizedData).forEach(entity => {
      entity.research.forEach(research => {
        if (!aspectBreakdown[research.aspect]) {
          aspectBreakdown[research.aspect] = [];
        }
        aspectBreakdown[research.aspect].push({
          entity: entity.name,
          findings: research.keyFindings,
          summary: research.summary
        });
      });
    });
    return aspectBreakdown;
  }

  groupMergedByAspect(aspectData) {
    const aspectBreakdown = {};
    Object.keys(aspectData).forEach(aspect => {
      aspectBreakdown[aspect] = {
        queries: aspectData[aspect].length,
        findings: aspectData[aspect].flatMap(a => a.findings),
        summaries: aspectData[aspect].map(a => a.summary).filter(Boolean)
      };
    });
    return aspectBreakdown;
  }

  groupComplementaryByAspect(complementaryData) {
    const aspectBreakdown = {};
    Object.values(complementaryData.entities).forEach(entity => {
      entity.research.forEach(research => {
        if (!aspectBreakdown[research.aspect]) {
          aspectBreakdown[research.aspect] = [];
        }
        aspectBreakdown[research.aspect].push({
          entity: entity.name,
          findings: research.result?.key_findings || []
        });
      });
    });
    return aspectBreakdown;
  }

  calculateComparisonConfidence(organizedData) {
    const entityCount = Object.keys(organizedData).length;
    const avgFindings = Object.values(organizedData).reduce((total, entity) => 
      total + entity.research.reduce((subtotal, r) => subtotal + r.keyFindings.length, 0), 0) / entityCount;
    
    return Math.min(0.5 + (avgFindings / 10), 1.0);
  }

  calculateMergedConfidence(mergedData) {
    const aspectCount = Object.keys(mergedData.aspectData).length;
    const findingRatio = mergedData.totalFindings / 15; // Target 15 findings for high confidence
    
    return Math.min(0.6 + (aspectCount / 10) + (findingRatio / 3), 1.0);
  }

  calculateComplementaryConfidence(complementaryData) {
    const entityCount = Object.keys(complementaryData.entities).length;
    const themeCount = complementaryData.commonThemes.length;
    
    return Math.min(0.5 + (entityCount / 5) + (themeCount / 10), 1.0);
  }
}

module.exports = ConsolidatedSessionSummarizer;
