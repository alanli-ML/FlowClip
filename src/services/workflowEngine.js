const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class WorkflowEngine extends EventEmitter {
  constructor(database, aiService) {
    super();
    this.database = database;
    this.aiService = aiService;
    this.workflows = new Map();
    this.runningWorkflows = new Map();
    this.isInitialized = false;
    // Access LangGraph client through AI service
    this.useLangGraph = process.env.USE_LANGGRAPH !== 'false';
  }

  async init() {
    if (this.isInitialized) return;
    
    // Register built-in workflows
    await this.registerBuiltInWorkflows();
    
    this.isInitialized = true;
    console.log('WorkflowEngine initialized');
  }

  async registerBuiltInWorkflows() {
    // Content Analysis Workflow
    this.registerWorkflow('content-analysis', {
      name: 'Content Analysis',
      description: 'Analyze clipboard content for tags, sentiment, and classification',
      steps: [
        { id: 'extract-text', type: 'text-extraction' },
        { id: 'analyze-content', type: 'ai-analysis', params: { task: 'analyze' } },
        { id: 'extract-tags', type: 'ai-analysis', params: { task: 'tags' } },
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

    // Action Recommendation Workflow
    this.registerWorkflow('action-recommendation', {
      name: 'Smart Action Recommendations',
      description: 'Analyze content and context to recommend intelligent actions',
      steps: [
        { id: 'analyze-content', type: 'ai-analysis', params: { task: 'analyze' } },
        { id: 'recommend-actions', type: 'ai-analysis', params: { task: 'actions' } },
        { id: 'save-recommendations', type: 'database-save' }
      ],
      triggers: ['clipboard-change', 'manual'],
      autoRun: true
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
      
      this.emit('workflow-completed', { executionId, result });
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
      try {
        return await this.executeLangGraphAnalysis(task, clipboardItem);
      } catch (error) {
        console.error(`LangGraph analysis failed for '${task}', falling back to legacy:`, error.message);
        // Fall through to legacy analysis
      }
    }

    // Legacy AI service analysis
    try {
      switch (task) {
        case 'analyze':
          // Use detectContentType for content analysis
          return await this.aiService.detectContentType(clipboardItem);
        
        case 'tags':
          // Use generateTags method
          return await this.aiService.generateTags(clipboardItem);
        
        case 'summarize':
          // Use triggerTask method for consistent interface
          const summaryResult = await this.aiService.triggerTask(clipboardItem.id, 'summarize');
          return summaryResult.result;
        
        case 'research':
          // Use triggerTask method for consistent interface
          const researchResult = await this.aiService.triggerTask(clipboardItem.id, 'research');
          return researchResult.result;
        
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
    
    const workflowData = {
      content: clipboardItem.content,
      context: {
        sourceApp: clipboardItem.source_app,
        windowTitle: clipboardItem.window_title,
        surroundingText: clipboardItem.surrounding_text,
        timestamp: clipboardItem.timestamp
      }
    };

    switch (task) {
      case 'analyze':
        // Use content analysis workflow
        const analysisResult = await this.aiService.langGraphClient.executeWorkflow('content_analysis', workflowData);
        return {
          type: analysisResult.contentType,
          category: analysisResult.purpose,
          sentiment: analysisResult.sentiment,
          confidence: analysisResult.confidence / 100, // Convert to 0-1 scale
          language: 'unknown', // LangGraph doesn't detect language yet
          insights: analysisResult.contextInsights
        };
      
      case 'tags':
        // Use tagging workflow
        const taggingResult = await this.aiService.langGraphClient.executeWorkflow('tagging', workflowData);
        return taggingResult.finalTags || [];
      
      case 'summarize':
        // Use summarization workflow
        const summaryResult = await this.aiService.langGraphClient.executeWorkflow('summarization', workflowData);
        return {
          summary: summaryResult.finalSummary || summaryResult.summary,
          qualityScore: summaryResult.qualityScore,
          keyPoints: summaryResult.keyPoints,
          word_count: clipboardItem.content.split(' ').length,
          summary_ratio: summaryResult.finalSummary ? 
            Math.round((summaryResult.finalSummary.split(' ').length / clipboardItem.content.split(' ').length) * 100) : 0
        };
      
      case 'research':
        // Use research workflow
        const researchResult = await this.aiService.langGraphClient.executeWorkflow('research', workflowData);
        
        // Handle new comprehensive research structure
        if (researchResult.researchSummary) {
          const processedResult = {
            research_summary: researchResult.researchSummary,
            key_findings: researchResult.keyFindings || [],
            sources: researchResult.sources || [],
            total_sources: researchResult.totalSources || 0,
            confidence: researchResult.confidence || 0.7,
            research_quality: researchResult.sources?.length > 3 ? 'comprehensive' : 'basic',
            research_categories: ['langgraph', 'ai-assisted', 'contextual'],
            suggested_keywords: researchResult.researchQueries || []
          };
          
          return processedResult;
        }
        
        // Fallback for old structure (backward compatibility)
        return {
          research_suggestions: researchResult.researchQuestions ? researchResult.researchQuestions.join('\n') : 'Research analysis completed',
          suggested_keywords: researchResult.keyTerms || [],
          search_queries: researchResult.searchQueries || [],
          research_categories: ['langgraph', 'ai-assisted', 'contextual'],
          readyForExternalResearch: researchResult.readyForExternalResearch
        };
      
      case 'entities':
        // Use content analysis workflow to extract entities
        const entityAnalysis = await this.aiService.langGraphClient.executeWorkflow('content_analysis', workflowData);
        // Combine LangGraph insights with simple extraction
        const simpleEntities = this.extractSimpleEntities(clipboardItem.content);
        return { 
          entities: simpleEntities,
          contentType: entityAnalysis.contentType,
          insights: entityAnalysis.contextInsights
        };
      
      case 'claims':
        // Use content analysis to understand content, then extract claims
        const claimAnalysis = await this.aiService.langGraphClient.executeWorkflow('content_analysis', workflowData);
        const simpleClaims = this.extractSimpleClaims(clipboardItem.content);
        return { 
          claims: simpleClaims,
          contentType: claimAnalysis.contentType,
          confidence: claimAnalysis.confidence,
          sentiment: claimAnalysis.sentiment
        };

      case 'actions':
        // Use action recommendation workflow
        const enhancedWorkflowData = {
          ...workflowData,
          context: {
            ...workflowData.context,
            screenshotPath: clipboardItem.screenshot_path,
            sourceApp: clipboardItem.source_app,
            windowTitle: clipboardItem.window_title
          }
        };
        const actionResult = await this.aiService.langGraphClient.executeWorkflow('action_recommendation', enhancedWorkflowData);
        return {
          recommendedActions: actionResult.recommendedActions,
          actionConfidence: actionResult.confidence,
          actionReasons: actionResult.actionReasons,
          contentAnalysis: actionResult.contentAnalysis,
          visualContext: actionResult.visualContext,
          sourceAppAnalysis: actionResult.sourceAppAnalysis
        };
      
      default:
        throw new Error(`LangGraph analysis task '${task}' not supported`);
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

      if (Object.keys(aiResults).length > 0) {
        await this.database.saveAITask({
          id: uuidv4(),
          clipboard_item_id: clipboardItemId,
          task_type: 'workflow',
          task_data: { workflow: 'content-analysis', results: aiResults },
          result: JSON.stringify(aiResults),
          status: 'completed',
          created_at: new Date().toISOString()
        });
      }

      return { saved: true, results: aiResults };
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
}

module.exports = WorkflowEngine; 