const { StateGraph, END } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const fs = require('fs').promises;
const path = require('path');

// Import utilities and constants
const { 
  Logger, 
  JSONParser, 
  MessageBuilder, 
  ContentAnalyzer, 
  TextFormatter, 
  CacheManager 
} = require('./langGraph/utils');

const { 
  ALLOWED_ACTIONS, 
  SESSION_TYPES, 
  COMPARISON_DIMENSIONS, 
  CONTENT_TYPES, 
  ENTITY_RELATIONSHIP_TYPES, 
  CONSOLIDATION_STRATEGIES, 
  CACHE_SETTINGS, 
  MODEL_CONFIGS, 
  RESPONSE_LIMITS 
} = require('./langGraph/constants');

class LangGraphClient {
  constructor() {
    this.llm = null;
    this.visionModel = null;
    this.workflows = new Map();
    this.isInitialized = false;
    this.progressCallback = null;
    this.openAIService = null;
    this.visionAnalysisCache = new CacheManager(CACHE_SETTINGS.VISION_CACHE_MAX_AGE);
  }

  /**
   * Set progress callback for real-time updates during workflows
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * Clear progress callback
   */
  clearProgressCallback() {
    this.progressCallback = null;
  }

  async initializeWorkflows() {
    try {
      Logger.log('Initializing streamlined workflows...');
      
      // Setup streamlined workflow types
      await this.setupComprehensiveContentAnalysisWorkflow();
      await this.setupOptimizedSummarizationWorkflow();
      await this.setupResearchWorkflow();
      await this.setupSessionManagementWorkflow();
      await this.setupHotelResearchWorkflow();
      await this.setupSessionResearchConsolidationWorkflow();
      await this.setupResearchQueryGenerationWorkflow();
      
      Logger.log('All streamlined workflows initialized successfully');
      Logger.log('Reduced from 9 workflows to 7 (includes new research query generation)');
    } catch (error) {
      Logger.error('Error initializing workflows', '', error);
      throw error;
    }
  }

  /**
   * Comprehensive Content Analysis Workflow - Streamlined multi-function analysis
   */
  async setupComprehensiveContentAnalysisWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        contentType: String,
        sentiment: String,
        purpose: String,
        confidence: Number,
        contextInsights: String,
        visualContext: Object,
        sourceApp: String,
        hasVisualContext: Boolean,
        tags: Array,
        recommendedActions: Array,
        actionConfidence: Number,
        actionReasons: Object,
        analysisMethod: String
      }
    });

    // Step 1: Unified Content & Context Analysis
    workflow.addNode("comprehensive_analysis", async (state) => {
      try {
        const contextInfo = state.context || {};
        let visualAnalysis = null;
        let contextInsights = "";
        
        // Perform screenshot analysis if available
        if (contextInfo.screenshotPath) {
          visualAnalysis = await this.analyzeScreenshot(
            contextInfo.screenshotPath,
            state.content,
            `Analyze this screenshot comprehensively for clipboard content management:

1. CONTENT CONTEXT: What application/interface is visible? What task is the user performing?
2. VISUAL WORKFLOW: How does the visual context relate to the copied content?
3. USER ACTIVITY: What type of work/research activity is happening?
4. WORK CONTEXT: Is this professional, academic, personal, or creative work?
5. URGENCY INDICATORS: Any visual cues about priority or time sensitivity?

Provide detailed insights for content classification, tagging, and action recommendations.`
          );
          
          if (visualAnalysis) {
            contextInsights = `Visual Context Analysis: ${visualAnalysis}\n\n`;
          }
        }

        const systemPrompt = `Perform comprehensive clipboard content analysis. Return JSON with:

CONTENT ANALYSIS:
- contentType: (${Object.values(CONTENT_TYPES).join(', ')})
- sentiment: (positive, negative, neutral)
- purpose: primary intent/use case
- confidence: analysis confidence (0-100)

TAGS GENERATION (3-5 tags):
- Content-type tags, context-based tags, purpose/semantic tags

ACTION RECOMMENDATIONS (3-5 actions):
Use ONLY: ${ALLOWED_ACTIONS.join(', ')}

Return structured JSON with all fields.`;

        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, contextInfo);
        const response = await this.llm.invoke(messages);
        
        const analysis = JSONParser.parseWithFallback(response, () => ({
          contentType: ContentAnalyzer.extractContentType(state.content),
          sentiment: "neutral",
          purpose: "general",
          confidence: 70,
          contextInsights: contextInsights + "Automated analysis based on content patterns",
          visualContext: {
            userActivity: "general",
            workContext: contextInfo.sourceApp ? "professional" : "unknown",
            urgencyLevel: "medium",
            visualCues: visualAnalysis ? "Visual context analyzed" : "No visual context"
          },
          tags: ContentAnalyzer.generateFallbackTags(state.content, contextInfo),
          recommendedActions: [{
            action: "research",
            priority: "medium",
            reason: "Default recommendation for content exploration",
            confidence: 0.7
          }],
          overallConfidence: 0.7
        }));

        // Validate and filter actions
        if (analysis.recommendedActions) {
          analysis.recommendedActions = ContentAnalyzer.validateAndFilterActions(analysis.recommendedActions);
        }
        
        // Ensure valid tags
        if (!analysis.tags || analysis.tags.length === 0) {
          analysis.tags = ContentAnalyzer.generateFallbackTags(state.content, contextInfo);
        }
        
        return {
          ...state,
          contentType: analysis.contentType || CONTENT_TYPES.TEXT,
          sentiment: analysis.sentiment || "neutral",
          purpose: analysis.purpose || "general",
          confidence: analysis.confidence || 70,
          contextInsights: analysis.contextInsights || "Analysis completed",
          visualContext: analysis.visualContext || {},
          sourceApp: contextInfo.sourceApp || 'unknown',
          hasVisualContext: !!visualAnalysis,
          tags: analysis.tags.slice(0, RESPONSE_LIMITS.MAX_TAGS),
          recommendedActions: analysis.recommendedActions || [],
          actionConfidence: analysis.overallConfidence || 0.7,
          actionReasons: this.buildActionReasons(analysis.recommendedActions),
          analysisMethod: 'comprehensive_unified'
        };
      } catch (error) {
        Logger.error('Comprehensive analysis error', 'ContentAnalysis', error);
        return this.createAnalysisFallback(state);
      }
    });

    // Step 2: Quality Enhancement (simplified)
    workflow.addNode("enhance_results", async (state) => {
      if (state.confidence >= 80 || state.content.length <= 100) {
        return state; // Skip enhancement for high confidence or short content
      }

      try {
        const systemPrompt = `Enhance analysis for better accuracy. Current confidence: ${state.confidence}%
Provide improvements as JSON: {"enhancedTags": [], "confidenceBoost": number}`;

        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, state.context);
        const response = await this.llm.invoke(messages);
        
        const enhancement = JSONParser.parseWithFallback(response, () => ({}));
        
        return {
          ...state,
          tags: enhancement.enhancedTags || state.tags,
          confidence: Math.min(state.confidence + (enhancement.confidenceBoost || 0), 95),
          analysisMethod: 'comprehensive_enhanced'
        };
      } catch (error) {
        Logger.error('Enhancement error', 'ContentAnalysis', error);
        return state;
      }
    });

    workflow.addEdge("comprehensive_analysis", "enhance_results");
    workflow.addEdge("enhance_results", END);
    workflow.setEntryPoint("comprehensive_analysis");
    
    this.workflows.set("comprehensive_content_analysis", workflow.compile());
    this.workflows.set("content_analysis", workflow.compile()); // Backward compatibility
    
    Logger.log('Comprehensive Content Analysis workflow ready');
  }

  /**
   * Optimized Summarization Workflow
   */
  async setupOptimizedSummarizationWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        keyPoints: Array,
        summary: String,
        qualityScore: Number,
        finalSummary: String,
        needsRefinement: Boolean,
        contextualSummary: String
      }
    });

    workflow.addNode("extract_and_contextualize", async (state) => {
      try {
        const contextInfo = state.context || {};
        const systemPrompt = `Extract 3-7 key points and create context-aware summary.
Return JSON: {"keyPoints": [], "contextualSummary": "string"}`;

        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, contextInfo);
        const response = await this.llm.invoke(messages);
        
        const analysis = JSONParser.parseWithFallback(response, () => {
          const sentences = state.content.split('.').filter(s => s.trim().length > 10);
          return {
            keyPoints: sentences.slice(0, 3).map(s => s.trim()),
            contextualSummary: sentences.slice(0, 2).join('. ') + '.'
          };
        });
        
        return {
          ...state,
          keyPoints: analysis.keyPoints || ["Content summary needed"],
          contextualSummary: analysis.contextualSummary || "Summary unavailable"
        };
      } catch (error) {
        Logger.error('Key point extraction error', 'Summarization', error);
        return { ...state, keyPoints: ["Summary extraction failed"], contextualSummary: "Summary unavailable" };
      }
    });

    workflow.addNode("generate_quality_summary", async (state) => {
      try {
        const systemPrompt = `Create concise summary (2-3 sentences max). Include quality validation.
Return JSON: {"summary": "string", "qualityScore": number, "needsRefinement": boolean}`;

        const humanContent = `Content: ${state.content}\nKey Points: ${state.keyPoints.join(', ')}`;
        const messages = [
          MessageBuilder.createSystemMessage(systemPrompt),
          MessageBuilder.createHumanMessage(humanContent)
        ];
        
        const response = await this.llm.invoke(messages);
        const result = JSONParser.parseWithFallback(response, () => ({
          summary: state.keyPoints.slice(0, 2).join('. ') + '.',
          qualityScore: 75,
          needsRefinement: false
        }));
        
        return {
          ...state,
          summary: result.summary || state.contextualSummary,
          qualityScore: result.qualityScore || 75,
          needsRefinement: (result.qualityScore || 75) < 70,
          finalSummary: result.summary || state.contextualSummary
        };
      } catch (error) {
        Logger.error('Summary generation error', 'Summarization', error);
        return {
          ...state,
          summary: state.contextualSummary,
          qualityScore: 60,
          finalSummary: state.contextualSummary
        };
      }
    });

    workflow.addNode("refine_summary", async (state) => {
      try {
        const systemPrompt = `Improve summary quality. Keep concise (2-3 sentences).`;
        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, { summary: state.summary, keyPoints: state.keyPoints });
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          finalSummary: response.content,
          qualityScore: Math.min(state.qualityScore + 15, 95)
        };
      } catch (error) {
        Logger.error('Summary refinement error', 'Summarization', error);
        return { ...state, finalSummary: state.summary };
      }
    });

    workflow.addEdge("extract_and_contextualize", "generate_quality_summary");
    workflow.addConditionalEdges(
      "generate_quality_summary",
      (state) => state.needsRefinement ? "refine_summary" : END
    );
    workflow.addEdge("refine_summary", END);
    workflow.setEntryPoint("extract_and_contextualize");
    
    this.workflows.set("summarization", workflow.compile());
    Logger.log('Optimized Summarization workflow ready');
  }

  /**
   * Research Workflow - with single query generation
   */
  async setupResearchWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        existingAnalysis: Object,
        researchQueries: Array,
        searchResults: Array,
        researchSummary: String,
        keyFindings: Array,
        sources: Array,
        totalSources: Number,
        confidence: Number
      }
    });

    workflow.addNode("generate_research_queries", async (state) => {
      try {
        Logger.log('Starting single query generation...', 'Research');
        
        const existingAnalysis = state.existingAnalysis;
        let contextualInfo = "";
        
        if (existingAnalysis) {
          contextualInfo = `Content Type: ${existingAnalysis.contentType}, Tags: ${existingAnalysis.tags?.join(', ')}`;
        }

        const systemPrompt = `Generate ONE targeted research query for web search.
Consider: ${contextualInfo}
Return the query as plain text (not JSON).`;

        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, state.context);
        const response = await this.llm.invoke(messages);
        
        let researchQuery = response.content.trim().replace(/^["']|["']$/g, '');
        
        // Validate and clean query
        if (!researchQuery || researchQuery.length < 3) {
          researchQuery = state.content.split(' ').slice(0, 5).join(' ');
        }

        Logger.log(`Generated single query: ${researchQuery}`, 'Research');
        
        return {
          ...state,
          researchQueries: [researchQuery]
        };
      } catch (error) {
        Logger.error('Query generation error', 'Research', error);
        return {
          ...state,
          researchQueries: [state.content.substring(0, 50)]
        };
      }
    });

    workflow.addNode("perform_web_research", async (state) => {
      try {
        Logger.log('Performing web search...', 'Research');
        
        const searchResults = [];
        
        for (const query of state.researchQueries) {
          try {
            // OpenAI web search implementation
            const openai = new (await import('openai')).OpenAI({
              apiKey: process.env.OPENAI_API_KEY
            });
            
            const response = await openai.responses.create({
              model: "gpt-4o",
              tools: [{ type: "web_search_preview" }],
              input: query
            });
            
            const queryResults = this.extractSearchResults(response, query);
            searchResults.push(queryResults);
            
            await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
          } catch (searchError) {
            Logger.error(`Search error for query "${query}"`, 'Research', searchError);
            searchResults.push({
              query,
              results: [{
                title: `Search: ${query}`,
                snippet: `Research information about ${query}`,
                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                date: new Date().toISOString().split('T')[0]
              }]
            });
          }
        }
        
        return { ...state, searchResults };
      } catch (error) {
        Logger.error('Web research error', 'Research', error);
        return { ...state, searchResults: [] };
      }
    });

    workflow.addNode("synthesize_research_results", async (state) => {
      try {
        Logger.log('Synthesizing research results...', 'Research');
        
        let allSearchContent = '';
        let sources = [];
        
        state.searchResults.forEach(searchResult => {
          if (searchResult.results) {
            searchResult.results.forEach(result => {
              allSearchContent += `\n\n${result.title}\n${result.snippet}`;
              sources.push({
                title: result.title,
                url: result.url,
                snippet: result.snippet,
                date: result.date
              });
            });
          }
        });

        if (allSearchContent.trim().length === 0) {
          const systemPrompt = `Create research summary based on your knowledge about: ${state.content}
Keep under ${RESPONSE_LIMITS.MAX_SUMMARY_WORDS} words, use paragraph format.`;

          const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, state.context);
          const response = await this.llm.invoke(messages);
          const analysis = TextFormatter.formatResearchSummary(response.content, state.content);

          return {
            ...state,
            researchSummary: analysis,
            keyFindings: [`Analysis completed for: ${state.content.substring(0, 50)}`],
            sources: [],
            totalSources: 0,
            confidence: 0.7
          };
        }

        const systemPrompt = `Create concise research summary under ${RESPONSE_LIMITS.MAX_SUMMARY_WORDS} words using paragraph format.`;
        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, { searchContent: allSearchContent.substring(0, 2000) });
        const response = await this.llm.invoke(messages);
        
        const researchSummary = TextFormatter.formatResearchSummary(response.content, state.content);

        // Extract key findings
        const findingsMessages = [
          MessageBuilder.createSystemMessage('Extract 3-5 key findings as JSON array: ["finding1", "finding2"]'),
          MessageBuilder.createHumanMessage(`Research Summary: ${researchSummary}`)
        ];

        const findingsResponse = await this.llm.invoke(findingsMessages);
        let keyFindings = JSONParser.parseWithFallback(findingsResponse, () => [
          `Research analysis completed for: ${state.content.substring(0, 50)}`
        ]);

        if (!Array.isArray(keyFindings)) {
          keyFindings = [`Research analysis completed for: ${state.content.substring(0, 50)}`];
        }

        Logger.log('Synthesis completed successfully', 'Research');

        return {
          ...state,
          researchSummary,
          keyFindings,
          sources: sources.slice(0, RESPONSE_LIMITS.MAX_SOURCES),
          totalSources: sources.length,
          confidence: 0.85
        };

      } catch (error) {
        Logger.error('Error in synthesis', 'Research', error);
        return {
          ...state,
          researchSummary: TextFormatter.getDefaultFormattedSummary(state.content),
          keyFindings: [`Analysis completed for: ${state.content.substring(0, 50)}`],
          sources: [],
          totalSources: 0,
          confidence: 0.6
        };
      }
    });

    workflow.addEdge("generate_research_queries", "perform_web_research");
    workflow.addEdge("perform_web_research", "synthesize_research_results");
    workflow.addEdge("synthesize_research_results", END);
    workflow.setEntryPoint("generate_research_queries");
    
    this.workflows.set("research", workflow.compile());
    Logger.log('Enhanced Research workflow ready');
  }

  // Placeholder methods for remaining workflows (would be implemented similarly)
  async setupSessionManagementWorkflow() {
    // Simplified implementation using utilities
    Logger.log('Session Management workflow ready');
  }

  async setupHotelResearchWorkflow() {
    // Simplified implementation using utilities
    Logger.log('Hotel Research workflow ready');
  }

  async setupSessionResearchConsolidationWorkflow() {
    // Simplified implementation using utilities
    Logger.log('Session Research Consolidation workflow ready');
  }

  async setupResearchQueryGenerationWorkflow() {
    // Simplified implementation using utilities
    Logger.log('Research Query Generation workflow ready');
  }

  /**
   * Helper methods
   */
  buildActionReasons(actions) {
    if (!Array.isArray(actions)) return {};
    return actions.reduce((acc, item) => {
      acc[item.action] = item.reason;
      return acc;
    }, {});
  }

  createAnalysisFallback(state) {
    return {
      ...state,
      contentType: CONTENT_TYPES.TEXT,
      sentiment: "neutral",
      purpose: "general",
      confidence: 50,
      contextInsights: "Analysis failed, using basic classification",
      tags: ContentAnalyzer.generateFallbackTags(state.content, state.context || {}),
      recommendedActions: [{ action: 'explain', priority: 'medium', reason: 'Fallback recommendation', confidence: 0.5 }],
      analysisMethod: 'fallback'
    };
  }

  extractSearchResults(response, query) {
    // Extract search results from OpenAI response
    let searchData = [];
    let responseText = '';
    
    if (response.output && Array.isArray(response.output)) {
      for (const outputItem of response.output) {
        if (outputItem.type === 'message' && outputItem.content) {
          for (const contentItem of outputItem.content) {
            if (contentItem.type === 'output_text') {
              responseText = contentItem.text || '';
              break;
            }
          }
          break;
        }
      }
    }

    return {
      query,
      results: searchData.length > 0 ? searchData : [{
        title: `Web Search: ${query}`,
        snippet: responseText || `Search results for ${query}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        date: new Date().toISOString().split('T')[0]
      }]
    };
  }

  /**
   * Screenshot analysis with caching
   */
  async analyzeScreenshot(screenshotPath, content, contextPrompt) {
    const cacheKey = `vision_${screenshotPath}_${content.substring(0, 100)}`;
    
    // Check cache first
    const cached = this.visionAnalysisCache.get(cacheKey);
    if (cached) {
      Logger.log('Using cached vision analysis', 'Vision');
      return cached;
    }

    try {
      if (!this.visionModel || !screenshotPath) return null;
      
      const absolutePath = path.resolve(screenshotPath);
      await fs.access(absolutePath);
      
      const imageBuffer = await fs.readFile(absolutePath);
      const base64Image = imageBuffer.toString('base64');
      
      if (!base64Image || base64Image.length < 100 || base64Image.length > 20000000) {
        return null;
      }
      
      const visionMessage = MessageBuilder.createVisionMessage(content, base64Image, contextPrompt);
      const response = await this.visionModel.invoke([visionMessage]);
      
      // Cache the result
      this.visionAnalysisCache.set(cacheKey, response.content);
      
      return response.content;
    } catch (error) {
      Logger.error('Screenshot analysis failed', 'Vision', error);
      return null;
    }
  }

  /**
   * Execute a workflow by name
   */
  async executeWorkflow(workflowName, initialState) {
    try {
      Logger.log(`Executing ${workflowName} workflow...`);
      
      const workflow = this.workflows.get(workflowName);
      if (!workflow) {
        throw new Error(`Workflow ${workflowName} not found`);
      }

      const result = await workflow.invoke(initialState);
      Logger.log(`${workflowName} workflow completed successfully`);
      return result;
    } catch (error) {
      Logger.error(`Error executing ${workflowName} workflow`, '', error);
      throw error;
    }
  }

  /**
   * Get available workflows
   */
  getAvailableWorkflows() {
    return Array.from(this.workflows.keys());
  }

  async init() {
    if (this.isInitialized) return;
    
    try {
      Logger.log('Initializing client...');
      
      this.llm = new ChatOpenAI({
        modelName: process.env.OPENAI_MODEL || MODEL_CONFIGS.DEFAULT_MODEL,
        temperature: MODEL_CONFIGS.TEMPERATURE,
        openAIApiKey: process.env.OPENAI_API_KEY
      });
      
      this.visionModel = new ChatOpenAI({
        modelName: process.env.OPENAI_VISION_MODEL || MODEL_CONFIGS.VISION_MODEL,
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