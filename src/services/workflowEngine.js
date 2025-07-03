const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class WorkflowEngine extends EventEmitter {
  constructor(database, aiService) {
    super();
    this.database = database;
    this.aiService = aiService;
    this.workflows = new Map();
    this.runningWorkflows = new Map();
    this.useLangGraph = true; // Enable LangGraph by default

    // Only initialize cache cleanup timer, no need for comprehensive analysis cache
    this.cacheCleanupInterval = 10 * 1000; // 10 seconds
    this.cacheCleanupTimer = null;
  }

  async init() {
    // Register built-in workflows
    await this.registerBuiltInWorkflows();
    console.log('WorkflowEngine initialized successfully');
  }

  async registerBuiltInWorkflows() {
    // Unified Content Analysis Workflow - combines analysis, tags, and actions in one step
    this.registerWorkflow('content-analysis', {
      name: 'Content Analysis',
      description: 'Comprehensive analysis of clipboard content including tags, sentiment, classification, and actions',
      steps: [
        { id: 'extract-text', type: 'text-extraction' },
        { id: 'comprehensive-analysis', type: 'ai-analysis', params: { task: 'comprehensive' } },
        { id: 'save-results', type: 'database-save' }
      ],
      triggers: ['clipboard-change'],
      autoRun: true
    });

    // Summarization Workflow
    this.registerWorkflow('summarize-content', {
      name: 'Summarize Content',
      description: 'Create a concise summary of clipboard content',
      steps: [
        { id: 'validate-length', type: 'content-validation', params: { minLength: 100 } },
        { id: 'summarize', type: 'ai-analysis', params: { task: 'summarize' } },
        { id: 'save-summary', type: 'database-save' }
      ],
      triggers: ['manual'],
      autoRun: false
    });

    // Research Workflow
    this.registerWorkflow('research-content', {
      name: 'Research Content',
      description: 'Generate research suggestions based on clipboard content',
      steps: [
        { id: 'extract-entities', type: 'ai-analysis', params: { task: 'entities' } },
        { id: 'generate-research', type: 'ai-analysis', params: { task: 'research' } },
        { id: 'save-research', type: 'database-save' }
      ],
      triggers: ['manual'],
      autoRun: false
    });

    // Fact-checking Workflow
    this.registerWorkflow('fact-check', {
      name: 'Fact Check',
      description: 'Verify factual claims in clipboard content',
      steps: [
        { id: 'extract-claims', type: 'ai-analysis', params: { task: 'claims' } },
        { id: 'check-facts', type: 'ai-analysis', params: { task: 'fact-check' } },
        { id: 'save-fact-check', type: 'database-save' }
      ],
      triggers: ['manual'],
      autoRun: false
    });

    console.log(`Registered ${this.workflows.size} built-in workflows`);
  }

  registerWorkflow(id, workflow) {
    workflow.id = id;
    workflow.createdAt = new Date().toISOString();
    this.workflows.set(id, workflow);
    this.emit('workflow-registered', { id, workflow });
  }

  getWorkflow(id) {
    return this.workflows.get(id);
  }

  getAllWorkflows() {
    return Array.from(this.workflows.values());
  }

  getWorkflowsByTrigger(trigger) {
    return Array.from(this.workflows.values()).filter(workflow => 
      workflow.triggers.includes(trigger)
    );
  }

  async executeWorkflow(workflowId, data, options = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = uuidv4();
    const execution = {
      id: executionId,
      workflowId,
      status: 'running',
      data,
      options,
      startTime: new Date().toISOString(),
      steps: [],
      currentStep: 0,
      results: {},
      errors: []
    };

    this.runningWorkflows.set(executionId, execution);
    this.emit('workflow-started', { executionId, workflowId, data });

    try {
      const result = await this.runWorkflowSteps(execution, workflow);
      
      execution.status = 'completed';
      execution.endTime = new Date().toISOString();
      execution.duration = Date.now() - new Date(execution.startTime).getTime();
      
      this.emit('workflow-completed', { executionId, workflowId, result });
      return result;
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date().toISOString();
      execution.error = error.message;
      
      this.emit('workflow-failed', { executionId, error });
      throw error;
    } finally {
      // Keep execution record for a while for debugging
      setTimeout(() => {
        this.runningWorkflows.delete(executionId);
      }, 300000); // 5 minutes
    }
  }

  async runWorkflowSteps(execution, workflow) {
    const results = {};
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      execution.currentStep = i;
      
      const stepExecution = {
        id: step.id,
        type: step.type,
        params: step.params || {},
        startTime: new Date().toISOString(),
        status: 'running'
      };
      
      execution.steps.push(stepExecution);
      this.emit('workflow-step-started', { 
        executionId: execution.id, 
        step: stepExecution 
      });

      try {
        const stepResult = await this.executeStep(step, execution.data, results);
        
        stepExecution.status = 'completed';
        stepExecution.endTime = new Date().toISOString();
        stepExecution.result = stepResult;
        
        results[step.id] = stepResult;
        
        this.emit('workflow-step-completed', { 
          executionId: execution.id, 
          step: stepExecution,
          result: stepResult
        });
        
      } catch (error) {
        stepExecution.status = 'failed';
        stepExecution.endTime = new Date().toISOString();
        stepExecution.error = error.message;
        
        execution.errors.push({
          step: step.id,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        this.emit('workflow-step-failed', { 
          executionId: execution.id, 
          step: stepExecution,
          error
        });

        // Decide whether to continue or stop
        if (step.continueOnError !== true) {
          throw error;
        }
      }
    }

    execution.results = results;
    return results;
  }

  async executeStep(step, inputData, previousResults) {
    switch (step.type) {
      case 'text-extraction':
        return this.executeTextExtraction(step, inputData);
      
      case 'ai-analysis':
        return this.executeAIAnalysis(step, inputData, previousResults);
      
      case 'content-validation':
        return this.executeContentValidation(step, inputData);
      
      case 'database-save':
        return this.executeDatabaseSave(step, inputData, previousResults);
      
      case 'condition':
        return this.executeCondition(step, inputData, previousResults);
      
      case 'transform':
        return this.executeTransform(step, inputData, previousResults);
      
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  async executeTextExtraction(step, inputData) {
    // Extract text content from various formats
    let text = '';
    
    if (typeof inputData === 'string') {
      text = inputData;
    } else if (inputData.content) {
      text = inputData.content;
    } else if (inputData.clipboardItem) {
      text = inputData.clipboardItem.content;
    }

    return {
      text: text,
      length: text.length,
      wordCount: text.split(/\s+/).length,
      hasContent: text.length > 0
    };
  }

  async executeAIAnalysis(step, inputData, previousResults) {
    const { task } = step.params;
    let clipboardItem = inputData.clipboardItem || inputData;
    
    console.log(`WorkflowEngine: executeAIAnalysis called with task '${task}'`);
    
    // If we have a clipboardItem ID, fetch the full item
    if (typeof clipboardItem === 'string') {
      clipboardItem = await this.database.getClipboardItem(clipboardItem);
    }

    if (!clipboardItem) {
      throw new Error('No clipboard item found for AI analysis');
    }

    // Check if AI service is configured
    if (!this.aiService.isConfigured()) {
      console.log('AI service not configured, skipping AI analysis');
      return { skipped: true, reason: 'AI service not configured' };
    }

    // Use LangGraph workflows when available for supported tasks
    if (this.useLangGraph && this.aiService.langGraphClient) {
      console.log(`WorkflowEngine: Using LangGraph for task '${task}'`);
      try {
        return await this.executeLangGraphAnalysis(task, clipboardItem);
      } catch (error) {
        console.error(`LangGraph analysis failed for '${task}', falling back to legacy:`, error.message);
        // Fall through to legacy analysis
      }
    } else {
      console.log(`WorkflowEngine: LangGraph not available (useLangGraph: ${this.useLangGraph}, langGraphClient: ${!!this.aiService.langGraphClient}), using legacy analysis`);
    }

    // Legacy AI service analysis
    try {
      switch (task) {
        case 'comprehensive':
          // New unified task that combines analysis, tags, and actions
          const [analysisResult, tagsResult, actionsResult] = await Promise.all([
            this.aiService.detectContentType(clipboardItem),
            this.aiService.generateTags(clipboardItem),
            this.aiService.suggestActions(clipboardItem)
          ]);
          
          return {
            analysis: analysisResult,
            tags: tagsResult,
            actions: actionsResult,
            unified: true
          };
        
        case 'analyze':
          // Use detectContentType for content analysis
          return await this.aiService.detectContentType(clipboardItem);
        
        case 'tags':
          // Use generateTags method
          return await this.aiService.generateTags(clipboardItem);
        
        case 'summarize':
          // Use optimized summarization workflow
          const summaryResult = await this.aiService.langGraphClient.executeWorkflow('summarization', workflowData);
          
          // Merge summarization results back into comprehensive analysis
          if (summaryResult && clipboardItem.id) {
            console.log('WorkflowEngine: Merging summarization results into comprehensive analysis...');
            try {
              await this.database.mergeWorkflowResults(clipboardItem.id, 'summarize', summaryResult);
              console.log('WorkflowEngine: Successfully merged summarization results into comprehensive analysis');
            } catch (mergeError) {
              console.error('WorkflowEngine: Error merging summarization results:', mergeError);
            }
          }
          
          return {
            summary: summaryResult.finalSummary || summaryResult.summary,
            qualityScore: summaryResult.qualityScore,
            keyPoints: summaryResult.keyPoints,
            word_count: clipboardItem.content.split(' ').length,
            summary_ratio: summaryResult.finalSummary ? 
              Math.round((summaryResult.finalSummary.split(' ').length / clipboardItem.content.split(' ').length) * 100) : 0,
            contextAware: true,
            analysisMethod: 'optimized_summarization'
          };
        
        case 'research':
          // Check for existing comprehensive analysis first
          let existingAnalysis = null;
          console.log(`WorkflowEngine: Executing research task for clipboard item ${clipboardItem.id}`);
          
          // Ensure comprehensive analysis is available before proceeding
          console.log('WorkflowEngine: Ensuring comprehensive analysis is available for legacy research...');
          await this.ensureComprehensiveAnalysisAvailable(clipboardItem);
          
          try {
            const existingClipboardItem = await this.database.getClipboardItem(clipboardItem.id);
            console.log(`WorkflowEngine: Retrieved clipboard item from database:`, !!existingClipboardItem);
            
            if (existingClipboardItem && existingClipboardItem.analysis_data) {
              console.log(`WorkflowEngine: Found analysis_data in clipboard item`);
              console.log(`WorkflowEngine: Analysis data length:`, existingClipboardItem.analysis_data.length);
              
              existingAnalysis = JSON.parse(existingClipboardItem.analysis_data);
              console.log('WorkflowEngine: Found existing comprehensive analysis for research workflow');
              console.log('WorkflowEngine: Analysis content type:', existingAnalysis.contentType);
              console.log('WorkflowEngine: Analysis has visual context:', existingAnalysis.hasVisualContext);
            } else {
              console.log(`WorkflowEngine: No analysis_data found in clipboard item`);
            }
          } catch (error) {
            console.log('WorkflowEngine: Error loading existing comprehensive analysis:', error.message);
            console.log('WorkflowEngine: Continuing with research without existing analysis');
          }

          // Enhance workflow data with existing analysis
          const enhancedWorkflowData = {
            ...workflowData,
            existingAnalysis: existingAnalysis
          };
          
          console.log('WorkflowEngine: Enhanced workflow data keys:', Object.keys(enhancedWorkflowData));
          console.log('WorkflowEngine: Passing existingAnalysis to LangGraph:', !!enhancedWorkflowData.existingAnalysis);

          // Use research workflow with enhanced context
          const researchResult = await this.aiService.langGraphClient.executeWorkflow('research', enhancedWorkflowData);
          
          // Merge research results back into comprehensive analysis
          if (researchResult && clipboardItem.id) {
            console.log('WorkflowEngine: Merging research results into comprehensive analysis...');
            try {
              await this.database.mergeWorkflowResults(clipboardItem.id, 'research', researchResult);
              console.log('WorkflowEngine: Successfully merged research results into comprehensive analysis');
            } catch (mergeError) {
              console.error('WorkflowEngine: Error merging research results:', mergeError);
            }
          }
          
          if (researchResult.researchSummary) {
            return {
              research_summary: researchResult.researchSummary,
              key_findings: researchResult.keyFindings || [],
              sources: researchResult.sources || [],
              total_sources: researchResult.totalSources || 0,
              confidence: researchResult.confidence || 0.7,
              research_quality: researchResult.sources?.length > 3 ? 'comprehensive' : 'basic',
              research_categories: ['langgraph', 'ai-assisted', 'contextual'],
              suggested_keywords: researchResult.researchQueries || [],
              usedExistingAnalysis: !!existingAnalysis
            };
          }
          
          return {
            research_suggestions: researchResult.researchQuestions ? researchResult.researchQuestions.join('\n') : 'Research analysis completed',
            suggested_keywords: researchResult.keyTerms || [],
            search_queries: researchResult.searchQueries || [],
            research_categories: ['langgraph', 'ai-assisted', 'contextual'],
            readyForExternalResearch: researchResult.readyForExternalResearch,
            usedExistingAnalysis: !!existingAnalysis
          };
        
        case 'fact-check':
          // Use factCheckContent method
          return await this.aiService.factCheckContent(clipboardItem);
        
        case 'entities':
          // Extract entities from content analysis
          const contentAnalysis = await this.aiService.detectContentType(clipboardItem);
          return { entities: this.extractSimpleEntities(clipboardItem.content) };
        
        case 'claims':
          // Extract claims using fact-check analysis
          const factCheck = await this.aiService.factCheckContent(clipboardItem);
          return { claims: this.extractSimpleClaims(clipboardItem.content) };
        
        case 'actions':
          // Use suggestActions method
          return await this.aiService.suggestActions(clipboardItem);
        
        case 'explain':
          // Use explainContent method
          return await this.aiService.explainContent(clipboardItem);
        
        case 'translate':
          // Use translateContent method
          return await this.aiService.translateContent(clipboardItem);
        
        case 'create-task':
          // Use createTaskFromContent method
          return await this.aiService.createTaskFromContent(clipboardItem);
        
        default:
          throw new Error(`Unknown AI analysis task: ${task}`);
      }
    } catch (error) {
      console.error(`AI analysis task '${task}' failed:`, error.message);
      return { error: error.message, task: task };
    }
  }

  async executeLangGraphAnalysis(task, clipboardItem) {
    console.log(`WorkflowEngine: Executing LangGraph analysis for task '${task}'`);
    console.log(`WorkflowEngine: Clipboard item ID: ${clipboardItem.id}`);
    console.log(`WorkflowEngine: Clipboard item content preview: ${clipboardItem.content?.substring(0, 50)}...`);
    
    // For research tasks, ensure comprehensive analysis is available
    if (task === 'research') {
      console.log('WorkflowEngine: Research task detected, ensuring comprehensive analysis is available...');
      await this.ensureComprehensiveAnalysisAvailable(clipboardItem);
    }
    
    const workflowData = {
      content: clipboardItem.content,
      context: {
        sourceApp: clipboardItem.source_app,
        windowTitle: clipboardItem.window_title,
        surroundingText: clipboardItem.surrounding_text,
        screenshotPath: clipboardItem.screenshot_path,
        timestamp: clipboardItem.timestamp
      }
    };

    switch (task) {
      case 'comprehensive':
        // New unified comprehensive analysis - combines analysis, tags, and actions
        console.log(`WorkflowEngine: Running unified comprehensive analysis`);
        const comprehensiveResult = await this.aiService.langGraphClient.executeWorkflow('comprehensive_content_analysis', workflowData);
        
        return {
          analysis: {
            type: comprehensiveResult.contentType,
            category: comprehensiveResult.purpose,
            sentiment: comprehensiveResult.sentiment,
            confidence: comprehensiveResult.confidence / 100,
            language: 'unknown',
            insights: comprehensiveResult.contextInsights,
            visualContext: comprehensiveResult.visualContext,
            hasVisualContext: comprehensiveResult.hasVisualContext,
            analysisMethod: 'comprehensive'
          },
          tags: comprehensiveResult.tags || [],
          actions: {
            recommendedActions: comprehensiveResult.recommendedActions || [],
            actionConfidence: comprehensiveResult.actionConfidence || 0.7,
            actionReasons: comprehensiveResult.actionReasons || {},
            contentAnalysis: {
              contentType: comprehensiveResult.contentType,
              sentiment: comprehensiveResult.sentiment,
              purpose: comprehensiveResult.purpose,
              confidence: comprehensiveResult.confidence
            },
            visualContext: comprehensiveResult.visualContext,
            contextInsights: comprehensiveResult.contextInsights
          },
          unified: true
        };

      case 'analyze':
      case 'tags':
      case 'actions':
        // Legacy support - these are now handled by the comprehensive task above
        // But keep for backward compatibility
        const legacyResult = await this.aiService.langGraphClient.executeWorkflow('comprehensive_content_analysis', workflowData);
        
        if (task === 'analyze') {
          return {
            type: legacyResult.contentType,
            category: legacyResult.purpose,
            sentiment: legacyResult.sentiment,
            confidence: legacyResult.confidence / 100,
            language: 'unknown',
            insights: legacyResult.contextInsights,
            visualContext: legacyResult.visualContext,
            hasVisualContext: legacyResult.hasVisualContext,
            analysisMethod: 'comprehensive'
          };
        }
        
        if (task === 'tags') {
          return legacyResult.tags || [];
        }
        
        if (task === 'actions') {
          return {
            recommendedActions: legacyResult.recommendedActions || [],
            actionConfidence: legacyResult.actionConfidence || 0.7,
            actionReasons: legacyResult.actionReasons || {},
            contentAnalysis: {
              contentType: legacyResult.contentType,
              sentiment: legacyResult.sentiment,
              purpose: legacyResult.purpose,
              confidence: legacyResult.confidence
            },
            visualContext: legacyResult.visualContext,
            contextInsights: legacyResult.contextInsights
          };
        }
        break;
      
      case 'summarize':
        // Use optimized summarization workflow
        const summaryResult = await this.aiService.langGraphClient.executeWorkflow('summarization', workflowData);
        
        // Merge summarization results back into comprehensive analysis
        if (summaryResult && clipboardItem.id) {
          console.log('WorkflowEngine: Merging summarization results into comprehensive analysis...');
          try {
            await this.database.mergeWorkflowResults(clipboardItem.id, 'summarize', summaryResult);
            console.log('WorkflowEngine: Successfully merged summarization results into comprehensive analysis');
          } catch (mergeError) {
            console.error('WorkflowEngine: Error merging summarization results:', mergeError);
          }
        }
        
        return {
          summary: summaryResult.finalSummary || summaryResult.summary,
          qualityScore: summaryResult.qualityScore,
          keyPoints: summaryResult.keyPoints,
          word_count: clipboardItem.content.split(' ').length,
          summary_ratio: summaryResult.finalSummary ? 
            Math.round((summaryResult.finalSummary.split(' ').length / clipboardItem.content.split(' ').length) * 100) : 0,
          contextAware: true,
          analysisMethod: 'optimized_summarization'
        };
      
      case 'research':
        // Check for existing comprehensive analysis first
        let existingAnalysis = null;
        console.log(`WorkflowEngine: Executing research task for clipboard item ${clipboardItem.id}`);
        
        // Ensure comprehensive analysis is available before proceeding
        console.log('WorkflowEngine: Ensuring comprehensive analysis is available for legacy research...');
        await this.ensureComprehensiveAnalysisAvailable(clipboardItem);
        
        try {
          const existingClipboardItem = await this.database.getClipboardItem(clipboardItem.id);
          console.log(`WorkflowEngine: Retrieved clipboard item from database:`, !!existingClipboardItem);
          
          if (existingClipboardItem && existingClipboardItem.analysis_data) {
            console.log(`WorkflowEngine: Found analysis_data in clipboard item`);
            console.log(`WorkflowEngine: Analysis data length:`, existingClipboardItem.analysis_data.length);
            
            existingAnalysis = JSON.parse(existingClipboardItem.analysis_data);
            console.log('WorkflowEngine: Found existing comprehensive analysis for research workflow');
            console.log('WorkflowEngine: Analysis content type:', existingAnalysis.contentType);
            console.log('WorkflowEngine: Analysis has visual context:', existingAnalysis.hasVisualContext);
          } else {
            console.log(`WorkflowEngine: No analysis_data found in clipboard item`);
          }
        } catch (error) {
          console.log('WorkflowEngine: Error loading existing comprehensive analysis:', error.message);
          console.log('WorkflowEngine: Continuing with research without existing analysis');
        }

        // Enhance workflow data with existing analysis
        const enhancedWorkflowData = {
          ...workflowData,
          existingAnalysis: existingAnalysis
        };
        
        console.log('WorkflowEngine: Enhanced workflow data keys:', Object.keys(enhancedWorkflowData));
        console.log('WorkflowEngine: Passing existingAnalysis to LangGraph:', !!enhancedWorkflowData.existingAnalysis);

        // Use research workflow with enhanced context
        const researchResult = await this.aiService.langGraphClient.executeWorkflow('research', enhancedWorkflowData);
        
        // Merge research results back into comprehensive analysis
        if (researchResult && clipboardItem.id) {
          console.log('WorkflowEngine: Merging research results into comprehensive analysis...');
          try {
            await this.database.mergeWorkflowResults(clipboardItem.id, 'research', researchResult);
            console.log('WorkflowEngine: Successfully merged research results into comprehensive analysis');
          } catch (mergeError) {
            console.error('WorkflowEngine: Error merging research results:', mergeError);
          }
        }
        
        if (researchResult.researchSummary) {
          return {
            research_summary: researchResult.researchSummary,
            key_findings: researchResult.keyFindings || [],
            sources: researchResult.sources || [],
            total_sources: researchResult.totalSources || 0,
            confidence: researchResult.confidence || 0.7,
            research_quality: researchResult.sources?.length > 3 ? 'comprehensive' : 'basic',
            research_categories: ['langgraph', 'ai-assisted', 'contextual'],
            suggested_keywords: researchResult.researchQueries || [],
            usedExistingAnalysis: !!existingAnalysis
          };
        }
        
        return {
          research_suggestions: researchResult.researchQuestions ? researchResult.researchQuestions.join('\n') : 'Research analysis completed',
          suggested_keywords: researchResult.keyTerms || [],
          search_queries: researchResult.searchQueries || [],
          research_categories: ['langgraph', 'ai-assisted', 'contextual'],
          readyForExternalResearch: researchResult.readyForExternalResearch,
          usedExistingAnalysis: !!existingAnalysis
        };
      
      case 'entities':
        const entityAnalysis = await this.aiService.langGraphClient.executeWorkflow('comprehensive_content_analysis', workflowData);
        const simpleEntities = this.extractSimpleEntities(clipboardItem.content);
        return { 
          entities: simpleEntities,
          contentType: entityAnalysis.contentType,
          insights: entityAnalysis.contextInsights,
          visualContext: entityAnalysis.visualContext,
          contextualEntities: true
        };
      
      case 'claims':
        const claimAnalysis = await this.aiService.langGraphClient.executeWorkflow('comprehensive_content_analysis', workflowData);
        const simpleClaims = this.extractSimpleClaims(clipboardItem.content);
        return { 
          claims: simpleClaims,
          contentType: claimAnalysis.contentType,
          confidence: claimAnalysis.confidence,
          sentiment: claimAnalysis.sentiment,
          contextInsights: claimAnalysis.contextInsights,
          visualContext: claimAnalysis.visualContext
        };

      case 'session_analysis':
      case 'session_type':
      case 'session_membership':
        const sessionData = {
          ...workflowData,
          existingSession: workflowData.existingSession
        };
        
        const sessionResult = await this.aiService.langGraphClient.executeWorkflow('session_management', sessionData);
        
        if (task === 'session_type') {
          return {
            sessionType: sessionResult.sessionType,
            confidence: sessionResult.sessionConfidence,
            reasoning: sessionResult.sessionReasoning
          };
        }
        
        if (task === 'session_membership') {
          return {
            belongs: sessionResult.belongsToSession,
            confidence: sessionResult.membershipConfidence,
            reasoning: sessionResult.membershipReasoning
          };
        }
        
        return {
          analysis: {
            sessionType: sessionResult.sessionType,
            belongs: sessionResult.belongsToSession,
            confidence: Math.min(sessionResult.sessionConfidence || 0, sessionResult.membershipConfidence || 0),
            reasoning: `${sessionResult.sessionReasoning} ${sessionResult.membershipReasoning}`.trim()
          },
          sessionRecommendations: sessionResult.sessionRecommendations || []
        };
      
      default:
        throw new Error(`Unsupported LangGraph task: ${task}`);
    }
  }

  // Helper methods for simple entity and claim extraction
  extractSimpleEntities(text) {
    const entities = [];
    
    // Simple email detection
    const emails = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
    if (emails) entities.push(...emails.map(email => ({ type: 'email', value: email })));
    
    // Simple URL detection
    const urls = text.match(/https?:\/\/[^\s]+/g);
    if (urls) entities.push(...urls.map(url => ({ type: 'url', value: url })));
    
    // Simple phone number detection
    const phones = text.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g);
    if (phones) entities.push(...phones.map(phone => ({ type: 'phone', value: phone })));
    
    return entities;
  }

  extractSimpleClaims(text) {
    const claims = [];
    
    // Simple claim detection based on common patterns
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      
      // Look for factual statements
      if (trimmed.match(/\b(is|are|was|were|will be|has|have|had)\b/i) &&
          trimmed.match(/\b\d+\b/) || 
          trimmed.match(/\b(according to|study shows|research indicates|data shows)\b/i)) {
        claims.push({
          claim: trimmed,
          confidence: 0.7,
          type: 'factual'
        });
      }
    }
    
    return claims.slice(0, 5); // Limit to 5 claims
  }

  async executeContentValidation(step, inputData) {
    const { minLength, maxLength, requiredFields } = step.params;
    let content = inputData;
    
    if (typeof inputData === 'object' && inputData.content) {
      content = inputData.content;
    }

    const validation = {
      valid: true,
      checks: [],
      content: content
    };

    // Length validation
    if (minLength && content.length < minLength) {
      validation.valid = false;
      validation.checks.push(`Content too short (${content.length} < ${minLength})`);
    }

    if (maxLength && content.length > maxLength) {
      validation.valid = false;
      validation.checks.push(`Content too long (${content.length} > ${maxLength})`);
    }

    // Required fields validation
    if (requiredFields && typeof inputData === 'object') {
      for (const field of requiredFields) {
        if (!inputData[field]) {
          validation.valid = false;
          validation.checks.push(`Missing required field: ${field}`);
        }
      }
    }

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.checks.join(', ')}`);
    }

    return validation;
  }

  async executeDatabaseSave(step, inputData, previousResults) {
    const { table, data } = step.params || {};
    
    // Default behavior: save AI task results
    if (!table || table === 'ai_tasks') {
      const clipboardItemId = inputData.clipboardItem?.id || inputData.id;
      if (!clipboardItemId) {
        throw new Error('No clipboard item ID for database save');
      }

      // Combine all AI analysis results
      const aiResults = {};
      for (const [key, result] of Object.entries(previousResults)) {
        if (result && typeof result === 'object') {
          aiResults[key] = result;
        }
      }

      // Extract tags, actions, and comprehensive analysis from unified comprehensive analysis result
      let tagsToUpdate = [];
      let actionsToSave = [];
      let comprehensiveAnalysis = null;
      
      // Check for the new unified comprehensive-analysis result
      if (previousResults['comprehensive-analysis'] && previousResults['comprehensive-analysis'].unified) {
        const comprehensiveResult = previousResults['comprehensive-analysis'];
        
        // Store the comprehensive analysis for use by subsequent workflows
        comprehensiveAnalysis = {
          contentType: comprehensiveResult.analysis?.type || 'text',
          purpose: comprehensiveResult.analysis?.category || 'general',
          sentiment: comprehensiveResult.analysis?.sentiment || 'neutral',
          confidence: comprehensiveResult.analysis?.confidence || 0.7,
          insights: comprehensiveResult.analysis?.insights || '',
          visualContext: comprehensiveResult.analysis?.visualContext || {},
          hasVisualContext: comprehensiveResult.analysis?.hasVisualContext || false,
          analysisMethod: comprehensiveResult.analysis?.analysisMethod || 'comprehensive',
          tags: comprehensiveResult.tags || [],
          actionRecommendations: comprehensiveResult.actions?.recommendedActions || [],
          timestamp: new Date().toISOString()
        };
        
        // Extract tags from unified result
        if (comprehensiveResult.tags && Array.isArray(comprehensiveResult.tags)) {
          tagsToUpdate = comprehensiveResult.tags;
          console.log(`WorkflowEngine: Found ${tagsToUpdate.length} tags from comprehensive analysis`);
        }
        
        // Extract actions from unified result
        if (comprehensiveResult.actions && comprehensiveResult.actions.recommendedActions) {
          actionsToSave = comprehensiveResult.actions.recommendedActions;
          console.log(`WorkflowEngine: Found ${actionsToSave.length} actions from comprehensive analysis`);
        }
      } else {
        // Legacy support: Look for tags in separate results (backward compatibility)
        if (previousResults['extract-tags'] && Array.isArray(previousResults['extract-tags'])) {
          tagsToUpdate = previousResults['extract-tags'];
          console.log(`WorkflowEngine: Found ${tagsToUpdate.length} tags to update on clipboard item`);
        } else {
          // Check if tags are nested in any result object
          for (const [key, result] of Object.entries(previousResults)) {
            if (result && result.tags && Array.isArray(result.tags)) {
              tagsToUpdate = result.tags;
              console.log(`WorkflowEngine: Found ${tagsToUpdate.length} tags in ${key} result`);
              break;
            }
          }
        }
        
        // Legacy support: Look for recommended actions in separate results
        if (previousResults['recommend-actions'] && previousResults['recommend-actions'].recommendedActions) {
          actionsToSave = previousResults['recommend-actions'].recommendedActions;
          console.log(`WorkflowEngine: Found ${actionsToSave.length} recommended actions to save`);
        } else {
          // Check if actions are nested in any result object
          for (const [key, result] of Object.entries(previousResults)) {
            if (result && result.recommendedActions && Array.isArray(result.recommendedActions)) {
              actionsToSave = result.recommendedActions;
              console.log(`WorkflowEngine: Found ${actionsToSave.length} actions in ${key} result`);
              break;
            }
          }
        }
      }

      // Update clipboard item with tags and comprehensive analysis if found
      if (tagsToUpdate.length > 0) {
        try {
          await this.database.addTags(clipboardItemId, tagsToUpdate);
          console.log(`WorkflowEngine: Updated clipboard item ${clipboardItemId} with ${tagsToUpdate.length} tags`);
        } catch (error) {
          console.error('WorkflowEngine: Error updating tags on clipboard item:', error);
        }
      }

      // Save comprehensive analysis to clipboard item for use by subsequent workflows
      if (comprehensiveAnalysis) {
        try {
          console.log('WorkflowEngine: Attempting to save comprehensive analysis to clipboard item...');
          console.log('WorkflowEngine: Comprehensive analysis keys:', Object.keys(comprehensiveAnalysis));
          console.log('WorkflowEngine: Analysis JSON length:', JSON.stringify(comprehensiveAnalysis).length);
          
          const updateResult = await this.database.updateClipboardItem(clipboardItemId, {
            analysis_data: JSON.stringify(comprehensiveAnalysis)
          });
          
          console.log('WorkflowEngine: Database update result:', updateResult);
          
          if (updateResult) {
            console.log(`WorkflowEngine: ✅ Saved comprehensive analysis to clipboard item ${clipboardItemId}`);
            
            // Verify it was saved by re-querying
            const verifyItem = await this.database.getClipboardItem(clipboardItemId);
            if (verifyItem && verifyItem.analysis_data) {
              console.log('WorkflowEngine: ✅ Verified: analysis_data exists in database');
              console.log('WorkflowEngine: Saved analysis data length:', verifyItem.analysis_data.length);
            } else {
              console.log('WorkflowEngine: ❌ Verification failed: analysis_data not found in database');
            }
          } else {
            console.log(`WorkflowEngine: ❌ Database update returned false for clipboard item ${clipboardItemId}`);
          }
        } catch (error) {
          console.error('WorkflowEngine: Error saving comprehensive analysis to clipboard item:', error);
          console.error('WorkflowEngine: Error details:', error.message);
          console.error('WorkflowEngine: Error stack:', error.stack);
        }
      } else {
        console.log('WorkflowEngine: No comprehensive analysis to save (comprehensiveAnalysis is null/undefined)');
      }

      // Save the complete workflow results (including actions) to ai_tasks
      if (Object.keys(aiResults).length > 0) {
        const taskId = uuidv4();
        const workflowType = inputData.workflowId || 'content-analysis';
        
        // If we have actions, save them with a specific task type for easier retrieval
        if (actionsToSave.length > 0) {
          const taskData = { 
            workflow: workflowType, 
            results: aiResults,
            actions: actionsToSave, // Store actions directly for easy access
            comprehensiveAnalysis: comprehensiveAnalysis // Include comprehensive analysis
          };
          
        await this.database.saveAITask({
            id: taskId,
            clipboard_item_id: clipboardItemId,
            task_type: 'workflow_actions',
            task_data: JSON.stringify(taskData), // Store as JSON string
            result: JSON.stringify(aiResults),
            status: 'completed',
            created_at: new Date().toISOString()
          });
          console.log(`WorkflowEngine: Saved unified workflow results with actions to ai_tasks`);
        } else {
          // Save regular workflow results
          const taskData = { 
            workflow: workflowType, 
            results: aiResults,
            comprehensiveAnalysis: comprehensiveAnalysis
          };
          
          await this.database.saveAITask({
            id: taskId,
          clipboard_item_id: clipboardItemId,
          task_type: 'workflow',
            task_data: JSON.stringify(taskData),
          result: JSON.stringify(aiResults),
          status: 'completed',
          created_at: new Date().toISOString()
        });
      }
      }

      return { 
        saved: true, 
        results: aiResults,
        tagsUpdated: tagsToUpdate.length > 0,
        actionsStored: actionsToSave.length > 0,
        comprehensiveAnalysisSaved: !!comprehensiveAnalysis,
        unified: previousResults['comprehensive-analysis']?.unified || false
      };
    }
    
    // Custom database operations can be added here
    return { saved: false, reason: 'Custom database operations not implemented' };
  }

  async executeCondition(step, inputData, previousResults) {
    const { condition, field, operator, value } = step.params;
    let testValue;

    if (field) {
      testValue = this.getValueByPath(inputData, field) || 
                  this.getValueByPath(previousResults, field);
    } else {
      testValue = inputData;
    }

    let result = false;
    switch (operator) {
      case 'equals':
        result = testValue === value;
        break;
      case 'contains':
        result = String(testValue).includes(value);
        break;
      case 'greater':
        result = Number(testValue) > Number(value);
        break;
      case 'less':
        result = Number(testValue) < Number(value);
        break;
      case 'exists':
        result = testValue !== undefined && testValue !== null;
        break;
      default:
        throw new Error(`Unknown condition operator: ${operator}`);
    }

    return { condition: result, testValue, operator, value };
  }

  async executeTransform(step, inputData, previousResults) {
    const { operation, source, target } = step.params;
    
    switch (operation) {
      case 'extract':
        return this.getValueByPath(previousResults, source);
      
      case 'combine':
        const values = source.map(path => this.getValueByPath(previousResults, path));
        return values.join(' ');
      
      case 'count':
        const data = this.getValueByPath(previousResults, source);
        return Array.isArray(data) ? data.length : 0;
      
      default:
        throw new Error(`Unknown transform operation: ${operation}`);
    }
  }

  getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  // Trigger workflows based on events
  async triggerWorkflows(trigger, data) {
    const workflows = this.getWorkflowsByTrigger(trigger);
    const executions = [];

    for (const workflow of workflows) {
      if (workflow.autoRun) {
        try {
          const execution = this.executeWorkflow(workflow.id, data);
          executions.push(execution);
        } catch (error) {
          console.error(`Failed to trigger workflow ${workflow.id}:`, error);
        }
      }
    }

    return executions;
  }

  // Manual workflow execution
  async runWorkflow(workflowId, data, options = {}) {
    return await this.executeWorkflow(workflowId, data, options);
  }

  // Get execution status
  getExecution(executionId) {
    return this.runningWorkflows.get(executionId);
  }

  getAllExecutions() {
    return Array.from(this.runningWorkflows.values());
  }

  // Cancel running workflow
  cancelExecution(executionId) {
    const execution = this.runningWorkflows.get(executionId);
    if (execution) {
      execution.status = 'cancelled';
      execution.endTime = new Date().toISOString();
      this.emit('workflow-cancelled', { executionId });
      return true;
    }
    return false;
  }

  // Workflow management
  updateWorkflow(id, updates) {
    const workflow = this.workflows.get(id);
    if (workflow) {
      Object.assign(workflow, updates);
      workflow.updatedAt = new Date().toISOString();
      this.emit('workflow-updated', { id, workflow });
      return workflow;
    }
    return null;
  }

  deleteWorkflow(id) {
    const deleted = this.workflows.delete(id);
    if (deleted) {
      this.emit('workflow-deleted', { id });
    }
    return deleted;
  }

  // Statistics and monitoring
  getStats() {
    const workflows = Array.from(this.workflows.values());
    const executions = Array.from(this.runningWorkflows.values());
    
    return {
      totalWorkflows: workflows.length,
      autoRunWorkflows: workflows.filter(w => w.autoRun).length,
      runningExecutions: executions.filter(e => e.status === 'running').length,
      completedExecutions: executions.filter(e => e.status === 'completed').length,
      failedExecutions: executions.filter(e => e.status === 'failed').length
    };
  }
  
  // Clean up resources when the engine is destroyed
  destroy() {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }
    console.log('WorkflowEngine: Resources cleaned up');
  }

  async ensureComprehensiveAnalysisAvailable(clipboardItem) {
    console.log('WorkflowEngine: Checking if comprehensive analysis is available...');
    console.log('WorkflowEngine: Clipboard item ID:', clipboardItem.id);
    
    // First, check if analysis data already exists
    try {
      console.log('WorkflowEngine: Querying database for existing analysis...');
      const existingItem = await this.database.getClipboardItem(clipboardItem.id);
      console.log('WorkflowEngine: Database query result:', !!existingItem);
      
      if (existingItem) {
        console.log('WorkflowEngine: Existing item keys:', Object.keys(existingItem));
        console.log('WorkflowEngine: Has analysis_data field:', 'analysis_data' in existingItem);
        console.log('WorkflowEngine: analysis_data value type:', typeof existingItem.analysis_data);
        console.log('WorkflowEngine: analysis_data truthy:', !!existingItem.analysis_data);
        
        if (existingItem.analysis_data) {
          console.log('WorkflowEngine: Analysis data length:', existingItem.analysis_data.length);
          console.log('WorkflowEngine: Analysis data preview:', existingItem.analysis_data.substring(0, 100));
          console.log('WorkflowEngine: Comprehensive analysis already available');
          return;
        } else {
          console.log('WorkflowEngine: analysis_data is null/empty/undefined');
        }
      } else {
        console.log('WorkflowEngine: No clipboard item found in database with ID:', clipboardItem.id);
      }
    } catch (error) {
      console.log('WorkflowEngine: Error checking existing analysis:', error.message);
      console.log('WorkflowEngine: Error stack:', error.stack);
    }
    
    console.log('WorkflowEngine: No existing analysis found, checking for running workflows...');
    
    // Check if there's already a content-analysis workflow running for this item
    const runningWorkflows = Array.from(this.runningWorkflows.values());
    console.log('WorkflowEngine: Total running workflows:', runningWorkflows.length);
    
    const runningContentAnalysis = runningWorkflows.find(execution => {
      const isContentAnalysis = execution.workflowId === 'content-analysis';
      const isRunning = execution.status === 'running';
      const matchesId = (execution.data.clipboardItem?.id === clipboardItem.id || execution.data.id === clipboardItem.id);
      
      console.log(`WorkflowEngine: Checking workflow ${execution.id}:`, {
        workflowId: execution.workflowId,
        isContentAnalysis,
        status: execution.status,
        isRunning,
        dataClipboardItemId: execution.data.clipboardItem?.id,
        dataId: execution.data.id,
        targetId: clipboardItem.id,
        matchesId
      });
      
      return isContentAnalysis && isRunning && matchesId;
    });
    
    if (runningContentAnalysis) {
      console.log('WorkflowEngine: Found running content-analysis workflow, waiting for completion...');
      await this.waitForWorkflowCompletion(runningContentAnalysis.id);
      console.log('WorkflowEngine: Content-analysis workflow completed');
      return;
    }
    
    console.log('WorkflowEngine: No running content-analysis found, triggering new analysis...');
    
    // No existing analysis and no running workflow, so trigger content analysis
    try {
      console.log('WorkflowEngine: Executing content-analysis workflow...');
      const analysisResult = await this.executeWorkflow('content-analysis', {
        clipboardItem: clipboardItem
      });
      console.log('WorkflowEngine: Content analysis workflow completed successfully');
      console.log('WorkflowEngine: Analysis result keys:', Object.keys(analysisResult || {}));
      
      // Verify the analysis was saved
      const verifyItem = await this.database.getClipboardItem(clipboardItem.id);
      if (verifyItem && verifyItem.analysis_data) {
        console.log('WorkflowEngine: ✅ Verified analysis data was saved successfully');
      } else {
        console.log('WorkflowEngine: ❌ Analysis data was NOT saved properly');
      }
    } catch (error) {
      console.log('WorkflowEngine: Content analysis workflow failed:', error.message);
      console.log('WorkflowEngine: Proceeding without analysis');
      // Don't throw - research can still proceed without analysis
    }
  }
  
  async waitForWorkflowCompletion(executionId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkStatus = () => {
        const execution = this.runningWorkflows.get(executionId);
        
        if (!execution) {
          // Workflow has been cleaned up, assume it completed
          resolve();
          return;
        }
        
        if (execution.status === 'completed' || execution.status === 'failed') {
          resolve();
          return;
        }
        
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Workflow ${executionId} did not complete within ${timeoutMs}ms`));
          return;
        }
        
        // Check again in 100ms
        setTimeout(checkStatus, 100);
      };
      
      checkStatus();
    });
  }
}

module.exports = WorkflowEngine; 