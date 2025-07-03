const { StateGraph, END } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { 
  Logger, 
  JSONParser, 
  MessageBuilder, 
  ContentAnalyzer, 
  TextFormatter, 
  CacheManager 
} = require('./utils');
const { 
  ALLOWED_ACTIONS, 
  CACHE_SETTINGS, 
  MODEL_CONFIGS 
} = require('./constants');

class LangGraphClient {
  constructor() {
    this.llm = null;
    this.visionModel = null;
    this.workflows = new Map();
    this.isInitialized = false;
    this.progressCallback = null;
    this.visionAnalysisCache = new CacheManager(CACHE_SETTINGS.VISION_CACHE_MAX_AGE);
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  clearProgressCallback() {
    this.progressCallback = null;
  }

  async initializeWorkflows() {
    try {
      Logger.log('Initializing streamlined workflows...');
      
      await this.setupComprehensiveContentAnalysisWorkflow();
      await this.setupOptimizedSummarizationWorkflow();
      await this.setupResearchWorkflow();
      
      Logger.log('All streamlined workflows initialized successfully');
    } catch (error) {
      Logger.error('Error initializing workflows', '', error);
      throw error;
    }
  }

  async setupComprehensiveContentAnalysisWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        contentType: String,
        sentiment: String,
        purpose: String,
        confidence: Number,
        tags: Array,
        recommendedActions: Array,
        analysisMethod: String
      }
    });

    workflow.addNode("comprehensive_analysis", async (state) => {
      try {
        const systemPrompt = `Perform comprehensive clipboard content analysis.
Return JSON with: contentType, sentiment, purpose, confidence, tags (3-5), recommendedActions.
Use only these actions: ${ALLOWED_ACTIONS.join(', ')}`;

        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, state.context);
        const response = await this.llm.invoke(messages);
        
        const analysis = JSONParser.parseWithFallback(response, () => ({
          contentType: ContentAnalyzer.extractContentType(state.content),
          sentiment: "neutral",
          purpose: "general",
          confidence: 70,
          tags: ContentAnalyzer.generateFallbackTags(state.content, state.context || {}),
          recommendedActions: [{ action: "research", priority: "medium", reason: "Default", confidence: 0.7 }]
        }));

        if (analysis.recommendedActions) {
          analysis.recommendedActions = ContentAnalyzer.validateAndFilterActions(analysis.recommendedActions);
        }
        
        return {
          ...state,
          contentType: analysis.contentType || "text",
          sentiment: analysis.sentiment || "neutral",
          purpose: analysis.purpose || "general",
          confidence: analysis.confidence || 70,
          tags: analysis.tags || [],
          recommendedActions: analysis.recommendedActions || [],
          analysisMethod: 'comprehensive_unified'
        };
      } catch (error) {
        Logger.error('Comprehensive analysis error', 'ContentAnalysis', error);
        return {
          ...state,
          contentType: "text",
          sentiment: "neutral",
          purpose: "general",
          confidence: 50,
          tags: ContentAnalyzer.generateFallbackTags(state.content, state.context || {}),
          recommendedActions: [{ action: 'explain', priority: 'medium', reason: 'Fallback', confidence: 0.5 }],
          analysisMethod: 'fallback'
        };
      }
    });

    workflow.addEdge("comprehensive_analysis", END);
    workflow.setEntryPoint("comprehensive_analysis");
    
    this.workflows.set("comprehensive_content_analysis", workflow.compile());
    this.workflows.set("content_analysis", workflow.compile());
    
    Logger.log('Comprehensive Content Analysis workflow ready');
  }

  async setupOptimizedSummarizationWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        summary: String,
        finalSummary: String
      }
    });

    workflow.addNode("generate_summary", async (state) => {
      try {
        const systemPrompt = `Create a concise 2-3 sentence summary of the content.`;
        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, state.context);
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          summary: response.content,
          finalSummary: response.content
        };
      } catch (error) {
        Logger.error('Summary generation error', 'Summarization', error);
        return {
          ...state,
          summary: state.content.substring(0, 200) + '...',
          finalSummary: state.content.substring(0, 200) + '...'
        };
      }
    });

    workflow.addEdge("generate_summary", END);
    workflow.setEntryPoint("generate_summary");
    
    this.workflows.set("summarization", workflow.compile());
    Logger.log('Optimized Summarization workflow ready');
  }

  async setupResearchWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        researchQueries: Array,
        searchResults: Array,
        researchSummary: String,
        keyFindings: Array
      }
    });

    workflow.addNode("generate_research_query", async (state) => {
      try {
        const systemPrompt = `Generate ONE targeted research query for: ${state.content}`;
        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, state.context);
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          researchQueries: [response.content.trim()]
        };
      } catch (error) {
        return {
          ...state,
          researchQueries: [state.content.substring(0, 50)]
        };
      }
    });

    workflow.addNode("synthesize_results", async (state) => {
      try {
        const systemPrompt = `Create research summary for: ${state.content}`;
        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, state.context);
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          researchSummary: TextFormatter.formatResearchSummary(response.content, state.content),
          keyFindings: [`Analysis completed for: ${state.content.substring(0, 50)}`]
        };
      } catch (error) {
        return {
          ...state,
          researchSummary: TextFormatter.getDefaultFormattedSummary(state.content),
          keyFindings: ['Research completed']
        };
      }
    });

    workflow.addEdge("generate_research_query", "synthesize_results");
    workflow.addEdge("synthesize_results", END);
    workflow.setEntryPoint("generate_research_query");
    
    this.workflows.set("research", workflow.compile());
    Logger.log('Research workflow ready');
  }

  async executeWorkflow(workflowName, initialState) {
    try {
      const workflow = this.workflows.get(workflowName);
      if (!workflow) {
        throw new Error(`Workflow ${workflowName} not found`);
      }
      return await workflow.invoke(initialState);
    } catch (error) {
      Logger.error(`Error executing ${workflowName} workflow`, '', error);
      throw error;
    }
  }

  getAvailableWorkflows() {
    return Array.from(this.workflows.keys());
  }

  async init() {
    if (this.isInitialized) return;
    
    try {
      this.llm = new ChatOpenAI({
        modelName: MODEL_CONFIGS.DEFAULT_MODEL,
        temperature: MODEL_CONFIGS.TEMPERATURE,
        openAIApiKey: process.env.OPENAI_API_KEY
      });
      
      this.visionModel = new ChatOpenAI({
        modelName: MODEL_CONFIGS.VISION_MODEL,
        temperature: MODEL_CONFIGS.TEMPERATURE,
        openAIApiKey: process.env.OPENAI_API_KEY
      });
      
      await this.initializeWorkflows();
      this.isInitialized = true;
      Logger.log('Client initialized successfully');
    } catch (error) {
      Logger.error('Failed to initialize client', '', error);
      throw error;
    }
  }
}

module.exports = LangGraphClient;
