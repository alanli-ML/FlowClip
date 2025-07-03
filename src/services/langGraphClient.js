const { StateGraph, END } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const fs = require('fs').promises;
const path = require('path');

class LangGraphClient {
  constructor() {
    this.llm = null;
    this.workflows = new Map();
    this.isInitialized = false;
    this.progressCallback = null; // Add progress callback for real-time updates
    this.openAIService = null; // Will be set by AIService
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
      console.log('LangGraph: Initializing streamlined workflows...');
      
      // Setup streamlined workflow types
      await this.setupComprehensiveContentAnalysisWorkflow();
      await this.setupOptimizedSummarizationWorkflow();
      await this.setupResearchWorkflow();
      await this.setupSessionManagementWorkflow();
      await this.setupHotelResearchWorkflow();
      await this.setupSessionResearchConsolidationWorkflow();
      await this.setupResearchQueryGenerationWorkflow();
      
      console.log('LangGraph: All streamlined workflows initialized successfully');
      console.log('LangGraph: Reduced from 9 workflows to 7 (includes new research query generation)');
    } catch (error) {
      console.error('LangGraph: Error initializing workflows:', error);
      throw error;
    }
  }

  /**
   * Comprehensive Content Analysis Workflow - Streamlined multi-function analysis
   * Combines: Content Classification + Context Analysis + Action Recommendations + Tagging
   * Reduces API calls from ~10 to ~2-3
   */
  async setupComprehensiveContentAnalysisWorkflow() {
    // Define allowed actions - strict constraints
    const ALLOWED_ACTIONS = [
      'research', 'fact_check', 'summarize', 'translate', 'explain', 'expand', 
      'create_task', 'cite', 'respond', 'schedule'
    ];

    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        // Content analysis results
        contentType: String,
        sentiment: String,
        purpose: String,
        confidence: Number,
        // Context and visual analysis
        contextInsights: String,
        visualContext: Object,
        sourceApp: String,
        hasVisualContext: Boolean,
        // Tags and actions (integrated)
        tags: Array,
        recommendedActions: Array,
        actionConfidence: Number,
        actionReasons: Object,
        // Workflow metadata
        analysisMethod: String
      }
    });

    // Step 1: Unified Content & Context Analysis (combines 4 previous steps into 1)
    workflow.addNode("comprehensive_analysis", async (state) => {
      try {
        const contextInfo = state.context || {};
        let visualAnalysis = null;
        let contextInsights = "";
        
        // Perform screenshot analysis once if available
        if (contextInfo.screenshotPath) {
          visualAnalysis = await this.analyzeScreenshot(
            contextInfo.screenshotPath,
            state.content,
            `Analyze this screenshot comprehensively for clipboard content management:

1. CONTENT CONTEXT: What application/interface is visible? What task is the user performing?
2. VISUAL WORKFLOW: How does the visual context relate to the copied content?
3. USER ACTIVITY: What type of work/research activity is happening? (coding, browsing, writing, etc.)
4. WORK CONTEXT: Is this professional, academic, personal, or creative work?
5. URGENCY INDICATORS: Any visual cues about priority or time sensitivity?

Provide detailed insights for content classification, tagging, and action recommendations.`
          );
          
          if (visualAnalysis) {
            contextInsights = `Visual Context Analysis: ${visualAnalysis}\n\n`;
          }
        }

        // Comprehensive content and context analysis in a single API call
        const messages = [
          new SystemMessage(`Perform comprehensive clipboard content analysis. Analyze and return JSON with ALL of the following:

CONTENT ANALYSIS:
- contentType: (text, code, url, email, phone, address, location, person, organization, date, financial, document, data, other)
- sentiment: (positive, negative, neutral)
- purpose: primary intent/use case
- confidence: analysis confidence (0-100)

CONTEXT INTEGRATION:
- Source app: ${contextInfo.sourceApp || 'unknown'}
- Window title: ${contextInfo.windowTitle || 'unknown'}
- Surrounding text: ${contextInfo.surroundingText || 'none'}
- Visual context available: ${!!visualAnalysis}

${contextInsights ? `VISUAL INSIGHTS:\n${contextInsights}` : ''}

TAGS GENERATION (REQUIRED - exactly 3-5 tags):
⚠️ CRITICAL: The "tags" field must be a JSON array of 3-5 string tags
- Content-type tags (REQUIRED): Include specific type like "url", "location", "person", "phone", "email", "code", "address", etc.
- Context-based tags: source app, workflow, environment (e.g., "vscode", "browser", "email-client")
- Purpose/semantic tags: intent, category, domain (e.g., "reference", "work", "contact", "documentation")

Examples:
- URL: ["url", "web", "research", "reference"]
- Person's name: ["person", "contact", "name", "networking"] 
- Address: ["address", "location", "contact", "geographic"]
- Phone number: ["phone", "contact", "communication", "personal"]
- Code snippet: ["code", "programming", "development", "technical"]
- Location/place: ["location", "geographic", "place", "travel"]

ACTION RECOMMENDATIONS (3-5 actions):
⚠️ IMPORTANT: Use ONLY these actions: research, fact_check, summarize, translate, explain, expand, create_task, cite, respond, schedule

Consider content type, visual context, source app, and user activity for recommendations.
Each action must be from the allowed list above.

Return as JSON:
{
  "contentType": "string",
  "sentiment": "string", 
  "purpose": "string",
  "confidence": number,
  "contextInsights": "string",
  "visualContext": {
    "userActivity": "string",
    "workContext": "string", 
    "urgencyLevel": "string",
    "visualCues": "string"
  },
  "tags": ["tag1", "tag2", "tag3"],
  "recommendedActions": [
    {
      "action": "string",
      "priority": "high|medium|low",
      "reason": "string",
      "confidence": 0.0-1.0
    }
  ],
  "overallConfidence": 0.0-1.0
}`),
          new HumanMessage(`Content: ${state.content}

Source Application: ${contextInfo.sourceApp || 'unknown'}
Window Title: ${contextInfo.windowTitle || 'unknown'}
Has Screenshot: ${!!visualAnalysis ? 'Yes' : 'No'}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let analysis;
        
        try {
          analysis = JSON.parse(response.content);
          
          // Validate and filter recommended actions to ensure they're in the allowed set
          if (analysis.recommendedActions && Array.isArray(analysis.recommendedActions)) {
            analysis.recommendedActions = this.validateAndFilterActions(analysis.recommendedActions, ALLOWED_ACTIONS);
          }
          
          // Validate and ensure tags are always present
          if (!analysis.tags || !Array.isArray(analysis.tags) || analysis.tags.length === 0) {
            console.log('LangGraph: Invalid or missing tags, generating fallback tags');
            analysis.tags = [
              this.extractContentType(state.content),
              contextInfo.sourceApp ? contextInfo.sourceApp.toLowerCase() : "general",
              "ai-generated",
              ...this.generateFallbackTags(state.content, contextInfo)
            ].slice(0, 5);
          } else {
            // Clean and validate existing tags
            analysis.tags = analysis.tags
              .filter(tag => tag && typeof tag === 'string' && tag.trim().length > 0)
              .map(tag => tag.trim().toLowerCase())
              .slice(0, 5);
            
            // Ensure we have at least 2 tags
            if (analysis.tags.length < 2) {
              const fallbackTags = this.generateFallbackTags(state.content, contextInfo);
              analysis.tags.push(...fallbackTags);
              analysis.tags = [...new Set(analysis.tags)].slice(0, 5); // Remove duplicates
            }
          }
        } catch (parseError) {
          console.log('LangGraph: JSON parsing failed, using fallback analysis');
          // Comprehensive fallback
          analysis = {
            contentType: this.extractContentType(state.content),
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
            tags: [
              this.extractContentType(state.content),
              contextInfo.sourceApp ? contextInfo.sourceApp.toLowerCase() : "general",
              "reference",
              this.generateFallbackTags(state.content, contextInfo)
            ].flat().filter(Boolean).slice(0, 5),
            recommendedActions: [
              {
                action: "research",
                priority: "medium",
                reason: "Default recommendation for content exploration",
                confidence: 0.7
              }
            ],
            overallConfidence: 0.7
          };
        }
        
        return {
          ...state,
          contentType: analysis.contentType || "text",
          sentiment: analysis.sentiment || "neutral",
          purpose: analysis.purpose || "general",
          confidence: analysis.confidence || 70,
          contextInsights: analysis.contextInsights || "Analysis completed",
          visualContext: analysis.visualContext || {
            userActivity: "general",
            workContext: "unknown",
            urgencyLevel: "medium",
            visualCues: "No visual context"
          },
          sourceApp: contextInfo.sourceApp || 'unknown',
          hasVisualContext: !!visualAnalysis,
          tags: (analysis.tags || []).slice(0, 5),
          recommendedActions: analysis.recommendedActions || [],
          actionConfidence: analysis.overallConfidence || 0.7,
          actionReasons: (analysis.recommendedActions || []).reduce((acc, item) => {
            acc[item.action] = item.reason;
            return acc;
          }, {}),
          analysisMethod: 'comprehensive_unified'
        };
      } catch (error) {
        console.error('Comprehensive analysis error:', error);
        // Robust fallback for any errors
        return {
          ...state,
          contentType: "text",
          sentiment: "neutral",
          purpose: "general",
          confidence: 50,
          contextInsights: "Analysis failed, using basic classification",
          visualContext: {
            userActivity: "general",
            workContext: "unknown",
            urgencyLevel: "medium",
            visualCues: "Analysis unavailable"
          },
          sourceApp: state.context?.sourceApp || 'unknown',
          hasVisualContext: false,
          tags: [
            this.extractContentType(state.content),
            state.context?.sourceApp ? state.context.sourceApp.toLowerCase() : "general",
            "error-fallback",
            ...this.generateFallbackTags(state.content, state.context || {})
          ].slice(0, 5),
          recommendedActions: [{
            action: 'explain',
            priority: 'medium',
            reason: 'Fallback recommendation due to analysis error',
            confidence: 0.5
          }],
          actionConfidence: 0.5,
          actionReasons: { explain: 'Fallback recommendation' },
          analysisMethod: 'fallback'
        };
      }
    });

    // Step 2: Quality Enhancement & Validation (optional refinement)
    workflow.addNode("enhance_results", async (state) => {
      try {
        // Only enhance if we have good base analysis and it's complex content
        if (state.confidence < 80 && state.content.length > 100) {
        const messages = [
            new SystemMessage(`Enhance the analysis results for better accuracy:

Current Analysis:
- Content Type: ${state.contentType}
- Tags: ${state.tags.join(', ')}
- Actions: ${state.recommendedActions.map(a => a.action).join(', ')}

IMPORTANT: Only use these allowed actions: ${ALLOWED_ACTIONS.join(', ')}

Provide improvements as JSON:
{
  "enhancedTags": ["tag1", "tag2"],
  "enhancedActions": [{"action": "must be from allowed list", "priority": "high|medium|low", "reason": "string", "confidence": 0.0-1.0}],
  "confidenceBoost": number
}`),
          new HumanMessage(`Content: ${state.content}
Context: ${state.contextInsights}
Current Confidence: ${state.confidence}`)
        ];
        
        const response = await this.llm.invoke(messages);
          let enhancement;
        
        try {
            enhancement = JSON.parse(response.content);
            
            // Validate enhanced actions as well
            let validatedActions = state.recommendedActions;
            if (enhancement.enhancedActions && Array.isArray(enhancement.enhancedActions)) {
              validatedActions = this.validateAndFilterActions(enhancement.enhancedActions, ALLOWED_ACTIONS);
        }
        
        return {
          ...state,
              tags: enhancement.enhancedTags || state.tags,
              recommendedActions: validatedActions,
              confidence: Math.min(state.confidence + (enhancement.confidenceBoost || 0), 95),
              analysisMethod: 'comprehensive_enhanced'
            };
          } catch (parseError) {
            // Keep original results if enhancement fails
            return state;
          }
        }
        
        // No enhancement needed
        return state;
      } catch (error) {
        console.error('Enhancement error:', error);
        return state;
      }
    });

    // Define workflow flow
    workflow.addEdge("comprehensive_analysis", "enhance_results");
    workflow.addEdge("enhance_results", END);
    workflow.setEntryPoint("comprehensive_analysis");
    
    // Compile and store workflow
    this.workflows.set("comprehensive_content_analysis", workflow.compile());
    // Keep only essential backward compatibility
    this.workflows.set("content_analysis", workflow.compile());
    
    console.log('LangGraph: Comprehensive Content Analysis workflow ready (unified approach)');
  }

  /**
   * Optimized Summarization Workflow - Streamlined summarization process
   * Reduces API calls from 5 to 3 by combining steps
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

    // Step 1: Combined Key Point Extraction & Context Integration
    workflow.addNode("extract_and_contextualize", async (state) => {
      try {
        const contextInfo = state.context || {};
        const messages = [
          new SystemMessage(`Extract key points and create a context-aware summary foundation.

1. EXTRACT 3-7 key points from the content
2. CONSIDER the context: Source app (${contextInfo.sourceApp || 'unknown'}), purpose, and user intent
3. CREATE a contextual summary that preserves essential information

Return as JSON:
{
  "keyPoints": ["point1", "point2", "point3"],
  "contextualSummary": "Context-aware summary that considers why this was copied and how it might be used"
}`),
          new HumanMessage(`Content: ${state.content}

Source Application: ${contextInfo.sourceApp || 'unknown'}
Window Title: ${contextInfo.windowTitle || 'unknown'}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let analysis;
        
        try {
          analysis = JSON.parse(response.content);
        } catch (parseError) {
          // Fallback
          const sentences = state.content.split('.').filter(s => s.trim().length > 10);
          analysis = {
            keyPoints: sentences.slice(0, 3).map(s => s.trim()),
            contextualSummary: sentences.slice(0, 2).join('. ') + '.'
          };
        }
        
        return {
          ...state,
          keyPoints: analysis.keyPoints || ["Content summary needed"],
          contextualSummary: analysis.contextualSummary || "Summary unavailable"
        };
      } catch (error) {
        console.error('Key point extraction error:', error);
        return {
          ...state,
          keyPoints: ["Summary extraction failed"],
          contextualSummary: "Summary unavailable due to error"
        };
      }
    });

    // Step 2: Generate Final Summary with Quality Validation
    workflow.addNode("generate_quality_summary", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Create a high-quality, concise summary with built-in quality validation.

Requirements:
- Maximum 2-3 sentences
- Preserve key information: ${state.keyPoints.join(', ')}
- Include context when relevant
- Clear and actionable
- Self-validate for accuracy and completeness

Return as JSON:
{
  "summary": "Final concise summary",
  "qualityScore": number (0-100),
  "needsRefinement": boolean,
  "qualityNotes": "Brief notes on quality assessment"
}`),
          new HumanMessage(`Original Content: ${state.content}

Key Points: ${state.keyPoints.join(', ')}
Contextual Foundation: ${state.contextualSummary}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let result;
        
        try {
          result = JSON.parse(response.content);
        } catch (parseError) {
          // Fallback summary
          result = {
            summary: state.keyPoints.slice(0, 2).join('. ') + '.',
            qualityScore: 75,
            needsRefinement: false,
            qualityNotes: "Fallback summary generated"
          };
        }
        
        const qualityScore = result.qualityScore || 75;
        
        return {
          ...state,
          summary: result.summary || state.contextualSummary,
          qualityScore: qualityScore,
          needsRefinement: qualityScore < 70,
          finalSummary: qualityScore >= 70 ? result.summary : result.summary
        };
      } catch (error) {
        console.error('Summary generation error:', error);
        return {
          ...state,
          summary: state.keyPoints.slice(0, 2).join('. ') + '.',
          qualityScore: 60,
          needsRefinement: true,
          finalSummary: state.contextualSummary
        };
      }
    });

    // Step 3: Conditional Refinement (only if needed)
    workflow.addNode("refine_summary", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Improve the summary (current score: ${state.qualityScore}/100).

Address likely issues and create a better version:
- Add missing key information
- Improve clarity and flow
- Ensure proper context
- Keep it concise (2-3 sentences max)

Return the improved summary as plain text.`),
          new HumanMessage(`Original Content: ${state.content}

Current Summary: ${state.summary}
Key Points to Include: ${state.keyPoints.join(', ')}`)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          finalSummary: response.content,
          qualityScore: Math.min(state.qualityScore + 15, 95)
        };
      } catch (error) {
        console.error('Summary refinement error:', error);
        return {
          ...state,
          finalSummary: state.summary
        };
      }
    });

    // Define workflow flow with conditional logic
    workflow.addEdge("extract_and_contextualize", "generate_quality_summary");
    
    // Conditional edge: only refine if quality is low
    workflow.addConditionalEdges(
      "generate_quality_summary",
      (state) => state.needsRefinement ? "refine_summary" : END
    );
    workflow.addEdge("refine_summary", END);

    workflow.setEntryPoint("extract_and_contextualize");
    
    this.workflows.set("summarization", workflow.compile());
    console.log('LangGraph: Optimized Summarization workflow ready (reduced from 5 to 3 steps)');
  }

  /**
   * Research Workflow - Preparation for external research (Phase 3)
   */
  async setupResearchWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        existingAnalysis: Object,  // Add this channel to allow existingAnalysis state
        researchQueries: Array,
        searchResults: Array,
        researchSummary: String,
        keyFindings: Array,
        sources: Array,
        totalSources: Number,
        confidence: Number
      }
    });

    // Step 1: Generate Smart Research Queries
    workflow.addNode("generate_research_queries", async (state) => {
      try {
        console.log('LangGraph Research: Starting query generation...');
        console.log('LangGraph Research: State keys:', Object.keys(state));
        console.log('LangGraph Research: Has existingAnalysis?', !!state.existingAnalysis);
        
        // TEMPORARY FALLBACK: If no existingAnalysis, try to load it directly
        if (!state.existingAnalysis && state.content) {
          console.log('LangGraph Research: No existingAnalysis provided, attempting direct database load...');
          try {
            // This requires access to database - we'll need to pass it through context
            if (state.context && state.context.database && state.context.clipboardItemId) {
              console.log('LangGraph Research: Attempting direct database query...');
              const clipboardItem = await state.context.database.getClipboardItem(state.context.clipboardItemId);
              if (clipboardItem && clipboardItem.analysis_data) {
                console.log('LangGraph Research: ✅ Found analysis data via direct database query');
                state.existingAnalysis = JSON.parse(clipboardItem.analysis_data);
                console.log('LangGraph Research: Loaded analysis content type:', state.existingAnalysis.contentType);
              } else {
                console.log('LangGraph Research: No analysis data found via direct database query');
              }
            } else {
              console.log('LangGraph Research: Direct database access not available (context.database or clipboardItemId missing)');
            }
      } catch (error) {
            console.log('LangGraph Research: Direct database query failed:', error.message);
      }
        }
        
        // Check if we have existing comprehensive analysis to use
        const existingAnalysis = state.existingAnalysis;
        let contextualInfo = "";
        let searchHints = [];
        
        if (existingAnalysis) {
          console.log('LangGraph Research: Using existing comprehensive analysis for enhanced query generation');
          console.log('LangGraph Research: Analysis content type:', existingAnalysis.contentType);
          console.log('LangGraph Research: Analysis tags:', existingAnalysis.tags);
          console.log('LangGraph Research: Analysis has visual context:', existingAnalysis.hasVisualContext);
          
          // Use analysis insights to improve search queries
          contextualInfo = `
CONTENT ANALYSIS CONTEXT:
- Content Type: ${existingAnalysis.contentType}
- Purpose: ${existingAnalysis.purpose}  
- Sentiment: ${existingAnalysis.sentiment}
- Tags: ${existingAnalysis.tags.join(', ')}
- Key Insights: ${existingAnalysis.insights}

This context should inform more targeted and relevant search queries.`;

          // Include previous workflow results if available
          if (existingAnalysis.workflowResults) {
            console.log('LangGraph Research: Found previous workflow results');
            console.log('LangGraph Research: Previous workflow types:', Object.keys(existingAnalysis.workflowResults));
            
            let workflowContext = "\n\nPREVIOUS WORKFLOW RESULTS:";
            
            // Include previous research results
            if (existingAnalysis.workflowResults.research && existingAnalysis.workflowResults.research.length > 0) {
              const previousResearch = existingAnalysis.workflowResults.research[0]; // Most recent
              workflowContext += `\n- Previous Research: ${previousResearch.researchSummary?.substring(0, 200) || 'Research conducted'}${previousResearch.researchSummary?.length > 200 ? '...' : ''}`;
              
              if (previousResearch.keyFindings && previousResearch.keyFindings.length > 0) {
                workflowContext += `\n- Key Findings from Previous Research: ${previousResearch.keyFindings.slice(0, 2).join('; ')}`;
              }
            }
            
            // Include previous summarization results
            if (existingAnalysis.workflowResults.summarize && existingAnalysis.workflowResults.summarize.length > 0) {
              const previousSummary = existingAnalysis.workflowResults.summarize[0]; // Most recent
              workflowContext += `\n- Previous Summary: ${previousSummary.finalSummary?.substring(0, 150) || previousSummary.summary?.substring(0, 150) || 'Content summarized'}${(previousSummary.finalSummary || previousSummary.summary)?.length > 150 ? '...' : ''}`;
            }
            
            // Include hotel research results if relevant
            if (existingAnalysis.workflowResults.hotel_research && existingAnalysis.workflowResults.hotel_research.length > 0) {
              const hotelResearch = existingAnalysis.workflowResults.hotel_research[0];
              if (hotelResearch.extractedHotels && hotelResearch.extractedHotels.length > 0) {
                workflowContext += `\n- Previous Hotel Research: Found ${hotelResearch.extractedHotels.length} hotels in ${hotelResearch.locationContext}`;
              }
            }
            
            contextualInfo += workflowContext;
            contextualInfo += "\n\nUse this previous workflow context to generate more targeted research queries that build on or complement existing insights.";
      }

          // Include visual context if available
          if (existingAnalysis.hasVisualContext && existingAnalysis.visualContext) {
            const visualContext = existingAnalysis.visualContext;
            console.log('LangGraph Research: Including visual context in queries');
            console.log('LangGraph Research: User activity:', visualContext.userActivity);
            console.log('LangGraph Research: Work context:', visualContext.workContext);
            
            contextualInfo += `

VISUAL CONTEXT FROM SCREENSHOT:
- User Activity: ${visualContext.userActivity || 'unknown'}
- Work Context: ${visualContext.workContext || 'unknown'}
- Urgency Level: ${visualContext.urgencyLevel || 'medium'}
- Visual Cues: ${visualContext.visualCues || 'none'}

Use this visual context to generate more relevant and targeted search queries.`;

            // Extract visual search hints
            if (visualContext.userActivity && visualContext.userActivity !== 'unknown') {
              searchHints.push(visualContext.userActivity);
            }
            
            if (visualContext.workContext && visualContext.workContext !== 'unknown') {
              searchHints.push(visualContext.workContext);
            }
            
            // Add urgency-based search modifiers
            if (visualContext.urgencyLevel === 'high') {
              searchHints.push('urgent', 'immediate');
            } else if (visualContext.urgencyLevel === 'low') {
              searchHints.push('reference', 'background');
            }
            
            // Parse visual cues for additional search terms
            if (visualContext.visualCues && visualContext.visualCues.length > 10) {
              // Extract key terms from visual cues
              const cueWords = visualContext.visualCues.toLowerCase().split(/\s+/);
              const relevantCues = cueWords.filter(word => 
                word.length > 3 && 
                !['the', 'and', 'for', 'with', 'this', 'that', 'from', 'they', 'were', 'been', 'have', 'their'].includes(word)
              ).slice(0, 2);
              
              searchHints.push(...relevantCues);
  }
          }

          // Add type-specific search hints
          searchHints.push(...existingAnalysis.tags.filter(tag => 
            !['short-content', 'brief', 'long-content', 'detailed'].includes(tag)
          ).slice(0, 3));
          
          // For URLs, include content-type specific context
          if (existingAnalysis.contentType === 'url') {
            searchHints.push('web resource', 'online content');
          }
          
          // For person/organization content, add relevant search terms
          if (existingAnalysis.contentType === 'person') {
            searchHints.push('biography', 'background');
          }
          
          if (existingAnalysis.contentType === 'organization') {
            searchHints.push('company info', 'business details');
          }
          
          // Remove duplicates and limit search hints
          searchHints = [...new Set(searchHints)].slice(0, 5);
          console.log('LangGraph Research: Generated search hints from analysis:', searchHints);
        } else {
          console.log('LangGraph Research: No existing analysis found, proceeding with basic query generation');
        }

        // Pre-process content to extract meaningful search terms if it's a URL
        let processedContent = state.content;
        let contentContext = "general content";
        let isUrl = false;
        let originalUrl = "";
        
        // Extract key terms from URLs if present, but keep it generic
        if (state.content.includes('http') || state.content.includes('www.')) {
          isUrl = true;
          originalUrl = state.content.split('\n')[0].trim(); // Take first line if multi-line
          
          try {
            const url = new URL(originalUrl);
            const hostname = url.hostname.toLowerCase();
            const pathname = url.pathname;
            
            // Extract meaningful terms from URL without forcing specific categories
            const domain = hostname.replace('www.', '').split('.')[0];
            const pathTerms = pathname.split('/').filter(part => 
              part.length > 3 && 
              !part.includes('.') && 
              !part.match(/^\d+$/) // Exclude numbers
            ).slice(0, 2); // Take max 2 path terms
            
            if (pathTerms.length > 0) {
              processedContent = `${domain} ${pathTerms.join(' ')}`.replace(/-/g, ' ');
            } else {
              processedContent = domain;
            }
            contentContext = "web content";
          } catch (urlError) {
            // If URL parsing fails, use original content
            console.log('URL parsing failed, using original content');
          }
        }
        
        const messages = [
          new SystemMessage(`Generate 3-5 specific, targeted search queries that would help find comprehensive information about the given topic.

${contextualInfo}

Create SHORT, FOCUSED search queries (2-5 words each) that would work well in search engines. 

Guidelines:
- Use the most important keywords from the content
- Make queries specific and actionable
- Avoid generic terms like "information" or "guide" 
- Do NOT include URLs or tracking parameters
- Focus on the actual topic being researched
${searchHints.length > 0 ? `- Consider these contextual hints: ${searchHints.join(', ')}` : ''}

Return only a JSON array of SHORT search query strings based exclusively on the provided content.`),
          new HumanMessage(`Content to research: ${processedContent.trim()}

${existingAnalysis ? `Analysis Context: This content has been identified as ${existingAnalysis.contentType} with purpose "${existingAnalysis.purpose}" and tagged as: ${existingAnalysis.tags.join(', ')}

${existingAnalysis.hasVisualContext ? `Visual Context: User was engaged in ${existingAnalysis.visualContext?.userActivity || 'general activity'} within a ${existingAnalysis.visualContext?.workContext || 'general'} context. Visual analysis suggests ${existingAnalysis.visualContext?.urgencyLevel || 'medium'} priority level.` : 'No visual context available.'}` : ''}

Generate search queries for this specific topic:`)
        ];
        
        const response = await this.llm.invoke(messages);
        let researchQueries;
        
        try {
          researchQueries = JSON.parse(response.content);
          if (!Array.isArray(researchQueries)) {
            throw new Error('Not an array');
          }
          
          // Clean and validate queries - remove any that are too long or contain URLs
          researchQueries = researchQueries
            .filter(query => typeof query === 'string' && query.length < 100 && !query.includes('http'))
            .map(query => query.trim())
            .slice(0, 5);
            
        } catch (parseError) {
          console.log('LangGraph Research: Failed to parse AI-generated queries, creating enhanced fallback');
          
          // Enhanced fallback using existing analysis if available
          if (existingAnalysis && existingAnalysis.tags.length > 0) {
            // Use tags to create better fallback queries
            const relevantTags = existingAnalysis.tags.filter(tag => 
              !['short-content', 'brief', 'long-content', 'detailed', 'ai-generated'].includes(tag)
            );
            
            researchQueries = relevantTags.slice(0, 3);
            
            // Add visual context terms if available
            if (existingAnalysis.hasVisualContext && existingAnalysis.visualContext) {
              const visualContext = existingAnalysis.visualContext;
              
              // Add user activity as a search term if it's specific
              if (visualContext.userActivity && visualContext.userActivity !== 'unknown' && visualContext.userActivity !== 'general activity') {
                researchQueries.push(visualContext.userActivity);
              }
              
              // Add work context if it's specific
              if (visualContext.workContext && visualContext.workContext !== 'unknown' && visualContext.workContext !== 'general') {
                researchQueries.push(visualContext.workContext);
              }
            }
            
            // Add content-based query if available
            if (processedContent.trim()) {
              const contentWords = processedContent.trim().split(/\s+/);
              const mainTerms = contentWords.slice(0, 2).join(' ');
              if (mainTerms && !researchQueries.includes(mainTerms)) {
                researchQueries.push(mainTerms);
              }
            }
            
            // Remove duplicates and limit
            researchQueries = [...new Set(researchQueries)].slice(0, 4);
          } else {
            // Basic fallback
          const contentWords = processedContent.trim().split(/\s+/);
          const mainTerms = contentWords.slice(0, 3).join(' '); // Use first 3 words max
          researchQueries = [mainTerms || state.content.substring(0, 50)];
          }
        }
        
        // If content is a URL, include the URL itself as one of the search queries
        if (isUrl && originalUrl) {
          console.log('LangGraph Research: Content is a URL, including URL in search queries');
          // Add the URL at the beginning of the queries array
          researchQueries.unshift(originalUrl);
          // Ensure we don't exceed the limit
          researchQueries = researchQueries.slice(0, 5);
        }
        
        console.log('LangGraph Research: Generated queries:', researchQueries);
        console.log(`LangGraph Research: Used existing analysis: ${!!existingAnalysis}`);
        
        return {
          ...state,
          researchQueries: researchQueries,
          usedExistingAnalysis: !!existingAnalysis,
          analysisContext: existingAnalysis
        };
      } catch (error) {
        console.error('Query generation error:', error);
        // Use only the actual content for fallback queries
        const contentWords = state.content.trim().split(/\s+/).slice(0, 5).join(' ');
        return {
          ...state,
          researchQueries: [contentWords || state.content.substring(0, 50)],
          usedExistingAnalysis: false
        };
      }
    });

    // Step 2: Perform Web Research (Real Web Search via OpenAI)
    workflow.addNode("perform_web_research", async (state) => {
      try {
        console.log('LangGraph Research: Performing real web search...');
        
        const searchResults = [];
        const totalQueries = state.researchQueries.length;
        let completedQueries = 0;
        
        // Emit start of web research phase
        if (this.progressCallback) {
          this.progressCallback({
            phase: 'langgraph_web_research_started',
            totalQueries: totalQueries,
            completedQueries: 0,
            currentStatus: `Starting web research with ${totalQueries} searches`
          });
        }
        
        for (const query of state.researchQueries) {
          console.log(`LangGraph Research: Searching web for: ${query}`);
          
          // Emit progress for current search
          if (this.progressCallback) {
            this.progressCallback({
              phase: 'langgraph_web_searching',
              totalQueries: totalQueries,
              completedQueries: completedQueries,
              currentQuery: query,
              progress: Math.round((completedQueries / totalQueries) * 100),
              currentStatus: `Searching: ${query}`
            });
          }
          
          try {
            // Use OpenAI's web search tool for real search results
            const openai = new (await import('openai')).OpenAI({
              apiKey: process.env.OPENAI_API_KEY
            });
            
            const response = await openai.responses.create({
              model: "gpt-4o",
              tools: [{ type: "web_search_preview" }],
              input: query
            });
            
            console.log(`LangGraph Research: Response for "${query}":`, response.output?.length, 'output items');
            
            let searchData = [];
            let responseText = '';
            let annotations = [];
            
            // Process the response output array according to the Responses API format
            if (response.output && Array.isArray(response.output)) {
              for (const outputItem of response.output) {
                if (outputItem.type === 'web_search_call') {
                  console.log(`LangGraph Research: Web search call completed for "${query}"`);
                } else if (outputItem.type === 'message' && outputItem.content) {
                  for (const contentItem of outputItem.content) {
                    if (contentItem.type === 'output_text') {
                      responseText = contentItem.text || '';
                      annotations = contentItem.annotations || [];
                      break;
                    }
                  }
                  break;
                }
              }
            }
            
            // Extract structured results from annotations (URL citations)
            if (annotations.length > 0) {
              searchData = annotations
                .filter(annotation => annotation.type === 'url_citation')
                .map(annotation => ({
                  title: annotation.title || 'Web Result',
                  snippet: responseText.substring(
                    Math.max(0, annotation.start_index - 150),
                    Math.min(responseText.length, annotation.end_index + 150)
                  ).trim(),
                  url: annotation.url || '',
                  date: new Date().toISOString().split('T')[0],
                  type: 'web_search_result'
                }));
            }
            
            const queryResults = {
              query: query,
              results: searchData.length > 0 ? searchData : [{
                title: `Web Search: ${query}`,
                snippet: responseText || `Search results for ${query}. This query contains relevant information from current web sources.`,
                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                date: new Date().toISOString().split('T')[0],
                type: 'web_search'
              }],
              fullText: responseText,
              totalCitations: annotations.length
            };
            
            searchResults.push(queryResults);
            completedQueries++;
            
            console.log(`LangGraph Research: Found ${queryResults.results.length} results for "${query}"`);
            
            // Emit progress for completed search
            if (this.progressCallback) {
              this.progressCallback({
                phase: 'langgraph_web_searching',
                totalQueries: totalQueries,
                completedQueries: completedQueries,
                lastCompletedQuery: query,
                progress: Math.round((completedQueries / totalQueries) * 100),
                currentStatus: `Completed: ${query} (${queryResults.results.length} results)`,
                resultsCount: queryResults.results.length
              });
            }
            
            // Add delay between requests to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (searchError) {
            console.error(`LangGraph Research: Search error for query "${query}":`, searchError.message);
            
            // Fallback: create informative search result even on API failure
            const fallbackResult = {
              query: query,
              results: [{
                title: `Search: ${query}`,
                snippet: `Research information about ${query}. This topic may include relevant details, current trends, and practical applications worth investigating further.`,
                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                date: new Date().toISOString().split('T')[0],
                type: 'fallback'
              }]
            };
            searchResults.push(fallbackResult);
            completedQueries++;
            
            // Emit progress for failed search
            if (this.progressCallback) {
              this.progressCallback({
                phase: 'langgraph_web_searching',
                totalQueries: totalQueries,
                completedQueries: completedQueries,
                lastCompletedQuery: query,
                progress: Math.round((completedQueries / totalQueries) * 100),
                currentStatus: `Error searching: ${query}`,
                error: searchError.message
              });
            }
          }
        }
        
        console.log(`LangGraph Research: Completed search across ${state.researchQueries.length} queries, collected ${searchResults.length} result sets`);
        
        // Emit completion of web research phase
        if (this.progressCallback) {
          this.progressCallback({
            phase: 'langgraph_web_research_completed',
            totalQueries: totalQueries,
            completedQueries: completedQueries,
            progress: 100,
            currentStatus: `Web research completed: ${searchResults.length} total results`,
            totalResults: searchResults.length
          });
        }
        
        return {
          ...state,
          searchResults: searchResults
        };
        
      } catch (error) {
        console.error('LangGraph Research: Error in web research:', error);
        
        // Emit error for web research phase
        if (this.progressCallback) {
          this.progressCallback({
            phase: 'langgraph_web_research_error',
            currentStatus: `Web research failed: ${error.message}`,
            error: error.message
          });
        }
        
        return {
          ...state,
          searchResults: []
        };
      }
    });

    // Step 3: Synthesize Research Results (Google AI Overview style)
    workflow.addNode("synthesize_research_results", async (state) => {
      try {
        console.log('LangGraph Research: Synthesizing research results...');
        
        // Combine all search results into comprehensive analysis
        let allSearchContent = '';
        let sourceCount = 0;
        let sources = [];
        
        state.searchResults.forEach(searchResult => {
          searchResult.results.forEach(result => {
            allSearchContent += `\n\n${result.title}\n${result.snippet}`;
            sources.push({
              title: result.title,
              url: result.url,
              snippet: result.snippet,
              date: result.date
            });
            sourceCount++;
          });
        });
        
        if (allSearchContent.trim().length === 0) {
          // Enhanced fallback when no search results are available
          console.log('LangGraph Research: No search results, generating comprehensive analysis...');
          
          const messages = [
            new SystemMessage(`You are an expert research analyst creating a concise, well-formatted research summary for a UI display.

FORMATTING REQUIREMENTS:
- Keep total response under 250 words
- Use clear paragraphs (2-4 sentences each)
- Write in narrative prose format (NO bullet points)
- Use proper line breaks between paragraphs
- Make content flow naturally and be easy to read

CONTENT STRUCTURE:
1. Opening paragraph: Brief overview and context (2-3 sentences)  
2. Main analysis paragraph: Core findings and insights (3-4 sentences)
3. Concluding paragraph: Practical implications and takeaways (2-3 sentences)

STYLE:
- Clear and concise language
- Narrative flow between paragraphs
- Focus on actionable insights
- Avoid redundancy
- Use active voice
- Be specific and direct

Based on your knowledge, provide insights about the topic in flowing paragraph format.`),
            new HumanMessage(`Research Topic: ${state.content}

Create a concise, well-formatted analysis (under 250 words):`)
          ];

          const response = await this.llm.invoke(messages);
          const rawAnalysis = response.content;
          
          // Format and clean up the analysis for UI display
          const analysis = this.formatResearchSummary(rawAnalysis, state.content);

          return {
            ...state,
            researchSummary: analysis,
            keyFindings: [
              `Analysis completed for: ${state.content.substring(0, 50)}`,
              'Research insights generated from available information',
              'Relevant context and considerations identified'
            ],
            sources: [],
            totalSources: 0,
            confidence: 0.7
          };
        }

        // AI-powered synthesis with search results (concise and well-formatted)
        const messages = [
          new SystemMessage(`You are an expert research analyst creating a concise, well-formatted research summary for a UI display.

FORMATTING REQUIREMENTS:
- Keep total response under 300 words
- Use clear paragraphs (2-4 sentences each)
- Write in narrative prose format (NO bullet points)
- Use proper line breaks between paragraphs
- Make content flow naturally and be easy to read

CONTENT STRUCTURE:
1. Opening paragraph: Brief overview and context (2-3 sentences)
2. Main analysis paragraph: Core findings and insights (3-4 sentences)  
3. Concluding paragraph: Practical implications and takeaways (2-3 sentences)

STYLE:
- Clear and concise language
- Narrative flow between paragraphs
- Focus on actionable insights
- Avoid redundancy
- Use active voice
- Be specific and direct

Based on the search results, provide a well-formatted research summary in flowing paragraph format.`),
          new HumanMessage(`Research Topic: ${state.content}

Search Queries: ${state.researchQueries.join(', ')}

Search Results:
${allSearchContent.substring(0, 2000)}

Create a concise, well-formatted summary (under 300 words):`)
        ];

        const response = await this.llm.invoke(messages);
        const rawSummary = response.content;
        
        // Format and clean up the research summary for UI display
        const researchSummary = this.formatResearchSummary(rawSummary, state.content);

        // Extract key findings using AI
        const findingsMessages = [
          new SystemMessage(`Extract 3-5 key findings or insights from the research summary. Each finding should be a clear, actionable insight that someone researching this topic would find valuable.

Return only the key findings as a JSON array of strings.`),
          new HumanMessage(`Research Summary: ${researchSummary}

Extract key findings as a JSON array.`)
        ];

        const findingsResponse = await this.llm.invoke(findingsMessages);
        let keyFindings = [];
        
        try {
          const findingsText = findingsResponse.content.replace(/```json\n?|\n?```/g, '').trim();
          keyFindings = JSON.parse(findingsText);
          if (!Array.isArray(keyFindings)) {
            throw new Error('Not an array');
          }
        } catch (parseError) {
          console.log('LangGraph Research: Could not parse key findings, using fallback');
          keyFindings = [
            `Research analysis completed for: ${state.content.substring(0, 50)}`,
            'Key information identified from search results',
            'Relevant insights extracted from available sources'
          ];
        }

        console.log('LangGraph Research: Synthesis completed successfully');

        const finalResult = {
          ...state,
          researchSummary: researchSummary,
          keyFindings: keyFindings,
          sources: sources.slice(0, 10), // Limit to top 10 sources
          totalSources: sourceCount,
          confidence: 0.85
        };

        return finalResult;

      } catch (error) {
        console.error('LangGraph Research: Error in synthesis:', error);
        
        // Robust fallback with proper formatting
        return {
          ...state,
          researchSummary: this.markdownToHtml(`**${state.content}** - Research Analysis

I've analyzed this topic based on available knowledge and found several important considerations worth exploring further.

This area involves multiple perspectives that should be considered for comprehensive understanding. Current applications and trends provide valuable context for practical decision-making, while understanding the fundamentals remains essential for effective implementation.

For next steps, consider gathering additional sources to verify findings and explore deeper research opportunities that align with your specific needs and objectives.`),
          keyFindings: [
            `Analysis completed for: ${state.content.substring(0, 50)}`,
            'Relevant information identified from available sources',
            'Key insights extracted for this topic'
          ],
          sources: [],
          totalSources: 0,
          confidence: 0.6
        };
      }
    });

    // Define workflow flow
    workflow.addEdge("generate_research_queries", "perform_web_research");
    workflow.addEdge("perform_web_research", "synthesize_research_results");
    workflow.addEdge("synthesize_research_results", END);

    workflow.setEntryPoint("generate_research_queries");
    
    this.workflows.set("research", workflow.compile());
    console.log('LangGraph: Enhanced Research workflow ready');
  }

  /**
   * Session Management Workflow - Unified session handling
   * Combines: Session Type Detection + Membership Evaluation + Session Analysis
   * Reduces API calls from 6+ to 2-3
   */
  async setupSessionManagementWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        existingSession: Object,
        // Session type detection
        sessionType: String,
        sessionConfidence: Number,
        sessionReasoning: String,
        // Membership evaluation
        belongsToSession: Boolean,
        membershipConfidence: Number,
        membershipReasoning: String,
        // Session analysis
        sessionInsights: String,
        intentAnalysis: Object,
        nextActions: Array,
        // Unified results
        sessionDecision: Object
      }
    });

    // Step 1: Comprehensive Session Analysis
    workflow.addNode("analyze_session_context", async (state) => {
      try {
        const contextInfo = state.context || {};
        let visualContext = "";
        
        // Use screenshot analysis for session type detection if available
        if (contextInfo.screenshotPath && state.content) {
          try {
            const screenshotAnalysis = await this.analyzeScreenshot(
              contextInfo.screenshotPath,
              state.content,
              `Analyze this screenshot to determine session type and user intent:

Look for visual clues that indicate:
- Hotel/accommodation research (booking sites, hotel listings, maps)
- Restaurant research (menu sites, review sites, reservation platforms)
- Product research (shopping sites, comparison tools, specifications)
- Academic research (papers, articles, academic sources)
- Travel research (destinations, itineraries, planning)
- General research (search results, information gathering)

Also assess the user's workflow and intent based on visual context.`
            );
            
            if (screenshotAnalysis) {
              visualContext = `Visual Analysis: ${screenshotAnalysis}\n\n`;
            }
          } catch (error) {
            console.log('SessionManagement: Screenshot analysis failed, continuing without visual context');
          }
        }

        // Comprehensive session analysis in one API call
        const messages = [
          new SystemMessage(`Perform comprehensive session management analysis:

${visualContext}

TASKS:
1. SESSION TYPE DETECTION - Identify session type based on content and context
2. MEMBERSHIP EVALUATION - If existing session provided, evaluate if content belongs
3. SESSION INSIGHTS - Analyze user intent and workflow patterns

Session Types: hotel_research, restaurant_research, product_research, academic_research, travel_research, general_research

${state.existingSession ? 
  `EXISTING SESSION:
  Type: ${state.existingSession.type}
  Label: ${state.existingSession.label}
  Items: ${JSON.stringify(state.existingSession.items, null, 2)}` 
  : 'No existing session to evaluate'}

Return as JSON:
{
  "sessionType": "detected_type",
  "sessionConfidence": 0.0-1.0,
  "sessionReasoning": "why this session type",
  ${state.existingSession ? `"belongsToSession": boolean,
  "membershipConfidence": 0.0-1.0,
  "membershipReasoning": "why it belongs/doesn't belong",` : ''}
  "intentAnalysis": {
    "primaryIntent": "main goal",
    "progressStatus": "just_started|in_progress|nearly_complete",
    "nextLikelyActions": ["action1", "action2"]
  },
  "sessionInsights": "detailed analysis of user workflow and patterns"
}`),
          new HumanMessage(`Content: ${state.content}

Source App: ${contextInfo.sourceApp || 'unknown'}
Window Title: ${contextInfo.windowTitle || 'unknown'}
Has Visual Context: ${!!visualContext}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let analysis;
        
        try {
          analysis = JSON.parse(response.content);
        } catch (parseError) {
          // Fallback analysis
          analysis = {
            sessionType: "general_research",
            sessionConfidence: 0.5,
            sessionReasoning: "Fallback classification due to parse error",
            belongsToSession: state.existingSession ? false : undefined,
            membershipConfidence: state.existingSession ? 0.3 : undefined,
            membershipReasoning: state.existingSession ? "Analysis failed" : undefined,
            intentAnalysis: {
              primaryIntent: "research",
              progressStatus: "in_progress",
              nextLikelyActions: ["continue_research", "organize_findings"]
            },
            sessionInsights: "Basic session analysis completed with limited data"
          };
        }
        
        return {
          ...state,
          sessionType: analysis.sessionType,
          sessionConfidence: analysis.sessionConfidence || 0.5,
          sessionReasoning: analysis.sessionReasoning || "No reasoning provided",
          belongsToSession: analysis.belongsToSession,
          membershipConfidence: analysis.membershipConfidence,
          membershipReasoning: analysis.membershipReasoning,
          intentAnalysis: analysis.intentAnalysis || {},
          sessionInsights: analysis.sessionInsights || "Session analysis completed"
        };
      } catch (error) {
        console.error('Session analysis error:', error);
        return {
          ...state,
          sessionType: "general_research",
          sessionConfidence: 0.3,
          sessionReasoning: "Error in analysis",
          belongsToSession: state.existingSession ? false : undefined,
          membershipConfidence: state.existingSession ? 0.2 : undefined,
          membershipReasoning: state.existingSession ? "Analysis error" : undefined,
          intentAnalysis: {
            primaryIntent: "unknown",
            progressStatus: "in_progress",
            nextLikelyActions: ["retry_analysis"]
          },
          sessionInsights: "Session analysis failed"
        };
      }
    });

    // Step 2: Generate Session Decision & Next Actions
    workflow.addNode("generate_session_decision", async (state) => {
      try {
        // Create unified session decision without additional API call
        const sessionDecision = {
          // Session type results
          detectedSessionType: state.sessionType,
          sessionTypeConfidence: state.sessionConfidence,
          
          // Membership results (if applicable)
          ...(state.existingSession && {
            shouldJoinExistingSession: state.belongsToSession,
            membershipConfidence: state.membershipConfidence,
            membershipReason: state.membershipReasoning
          }),
          
          // Session insights
          userIntent: state.intentAnalysis.primaryIntent,
          progressStatus: state.intentAnalysis.progressStatus,
          recommendedActions: state.intentAnalysis.nextLikelyActions || [],
          
          // Metadata
          analysisQuality: state.sessionConfidence > 0.7 ? 'high' : state.sessionConfidence > 0.4 ? 'medium' : 'low',
          hasVisualContext: state.hasVisualContext || false,
          timestamp: new Date().toISOString()
        };
        
        return {
          ...state,
          sessionDecision: sessionDecision,
          nextActions: state.intentAnalysis.nextLikelyActions || []
        };
      } catch (error) {
        console.error('Session decision generation error:', error);
        return {
          ...state,
          sessionDecision: {
            detectedSessionType: state.sessionType || "general_research",
            sessionTypeConfidence: 0.3,
            analysisQuality: 'low',
            error: 'Decision generation failed'
          },
          nextActions: ["retry_analysis"]
        };
      }
    });

    // Define workflow flow
    workflow.addEdge("analyze_session_context", "generate_session_decision");
    workflow.addEdge("generate_session_decision", END);
    workflow.setEntryPoint("analyze_session_context");
    
    // Register multiple workflow names for backward compatibility
    this.workflows.set("session_management", workflow.compile());
    this.workflows.set("session_type_detection", workflow.compile());
    this.workflows.set("session_membership", workflow.compile());
    this.workflows.set("session_analysis", workflow.compile());
    
    console.log('LangGraph: Session Management workflow ready (combines 3 session workflows)');
  }

  /**
   * Hotel Research Workflow - Implements the specific hotel research flow
   */
  async setupHotelResearchWorkflow() {
    const workflow = new StateGraph({
      channels: {
        sessionItems: Array,
        extractedHotels: Array,
        locationContext: String,
        userPreferences: Object,
        comparison: Object,
        recommendation: Object,
        alertMessage: String
      }
    });

    // Step 1: Extract Hotels and Context
    workflow.addNode("extract_hotels_context", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Extract hotel names and location context from the session items.

Identify:
1. Hotel names (full names)
2. Location/city being researched
3. Visible preferences (price, amenities, location factors)
4. Booking dates if mentioned

Respond with JSON:
{
  "hotels": ["Hotel Name 1", "Hotel Name 2"],
  "location": "City, Country",
  "preferences": {
    "priceRange": "budget|mid-range|luxury",
    "amenities": ["amenity1", "amenity2"],
    "locationFactors": ["factor1", "factor2"]
  },
  "dateRange": "if found"
}`),
          new HumanMessage(`Session Items: ${JSON.stringify(state.sessionItems, null, 2)}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let extraction;
        
        try {
          extraction = JSON.parse(response.content);
        } catch (parseError) {
          extraction = { hotels: [], location: "unknown" };
        }
        
        return {
          ...state,
          extractedHotels: extraction.hotels || [],
          locationContext: extraction.location || "unknown",
          userPreferences: extraction.preferences || {}
        };
      } catch (error) {
        return {
          ...state,
          extractedHotels: [],
          locationContext: "unknown",
          userPreferences: {}
        };
      }
    });

    // Step 2: Generate Comparison Analysis
    workflow.addNode("generate_comparison", async (state) => {
      try {
        if (state.extractedHotels.length < 2) {
          return {
            ...state,
            comparison: { 
              summary: "Need more hotels for comparison",
              canCompare: false
            }
          };
        }

        const messages = [
          new SystemMessage(`Create a comparison analysis for these hotels in ${state.locationContext}.

Hotels: ${state.extractedHotels.join(', ')}
User Preferences: ${JSON.stringify(state.userPreferences)}

Provide a structured comparison considering:
1. Likely price ranges
2. Location advantages
3. Typical amenities for each brand
4. Best fit based on preferences

Respond with JSON:
{
  "summary": "brief comparison summary",
  "recommendations": {
    "bestOverall": "hotel name",
    "bestValue": "hotel name", 
    "bestLocation": "hotel name"
  },
  "reasoning": "explanation of recommendations"
}`),
          new HumanMessage(`Hotels to compare: ${state.extractedHotels.join(', ')}
Location: ${state.locationContext}
Preferences: ${JSON.stringify(state.userPreferences)}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let comparison;
        
        try {
          comparison = JSON.parse(response.content);
        } catch (parseError) {
          comparison = { 
            summary: "Comparison analysis failed",
            canCompare: false
          };
        }
        
        return {
          ...state,
          comparison: comparison
        };
      } catch (error) {
        return {
          ...state,
          comparison: { summary: "Comparison failed", canCompare: false }
        };
      }
    });

    // Step 3: Generate Proactive Alert
    workflow.addNode("generate_alert", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Create a helpful, proactive alert message for the user about their hotel research.

The message should:
1. Acknowledge what they're researching
2. Provide the comparison summary
3. Offer helpful next steps
4. Be friendly and concise

Example: "It looks like you're researching hotels in Toronto. Here's a comparison of the ones you've copied: [Summary]. Would you like me to track more options, refine the search, or help with booking?"`),
          new HumanMessage(`Hotels: ${state.extractedHotels.join(', ')}
Location: ${state.locationContext}
Comparison: ${JSON.stringify(state.comparison)}
Number of hotels: ${state.extractedHotels.length}`)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          alertMessage: response.content,
          recommendation: {
            hotels: state.extractedHotels,
            location: state.locationContext,
            comparison: state.comparison,
            nextActions: ['track_more', 'refine_search', 'help_booking']
          }
        };
      } catch (error) {
        return {
          ...state,
          alertMessage: `You're researching hotels in ${state.locationContext}. I found ${state.extractedHotels.length} hotels in your clipboard.`,
          recommendation: {
            hotels: state.extractedHotels,
            location: state.locationContext
          }
        };
      }
    });

    workflow.addEdge("extract_hotels_context", "generate_comparison");
    workflow.addEdge("generate_comparison", "generate_alert");
    workflow.addEdge("generate_alert", END);
    workflow.setEntryPoint("extract_hotels_context");
    
    this.workflows.set("hotel_research", workflow.compile());
    console.log('LangGraph: Hotel Research workflow ready');
  }

  /**
   * Session Research Consolidation Workflow - Unified session research summarization
   * Consolidates: Research Objective + Summary + Intent + Goals + Next Steps
   * Reduces API calls from 5 separate calls to 1 comprehensive analysis
   */
  async setupSessionResearchConsolidationWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        existingAnalysis: Object,
        // Session context
        sessionContext: Object,
        researchScope: Object,
        // Research input data
        researchData: Object,
        // Consolidated outputs
        researchObjective: String,
        summary: String,
        primaryIntent: String,
        researchGoals: Array,
        nextSteps: Array,
        // Analysis metadata
        analysisQuality: String,
        consolidationMethod: String
      }
    });

    // Single comprehensive analysis node that generates all required fields
    workflow.addNode("consolidate_session_research", async (state) => {
      try {
        console.log('LangGraph: Consolidating session research with comprehensive analysis...');
        
        const sessionContext = state.context?.sessionContext || {};
        const researchScope = state.context?.researchScope || {};
        const researchData = state.existingAnalysis?.researchData || {};
        
        const sessionType = sessionContext.sessionType || 'general_research';
        const entitiesResearched = researchScope.entitiesResearched || [];
        const aspectsCovered = researchScope.aspectsCovered || [];
        const totalSources = researchScope.totalSources || 0;
        const totalFindings = researchScope.totalFindings || 0;
        
        // Create comprehensive prompt for all session summary fields
        const messages = [
          new SystemMessage(`You are a session research consolidator. Generate ALL required fields for a comprehensive session summary in ONE analysis.

REQUIRED OUTPUT (JSON format):
{
  "researchObjective": "Clear, concise research objective (1-2 sentences)",
  "summary": "Comprehensive summary of research findings and insights (2-3 paragraphs)",
  "primaryIntent": "Main user intent or goal (1 sentence)",
  "researchGoals": ["goal1", "goal2", "goal3"] (3-5 actionable goals),
  "nextSteps": ["step1", "step2", "step3"] (3-4 concrete next actions)
}

GUIDELINES:
- Research Objective: Focus on what was researched, not methodology
- Summary: Describe actual findings and insights from the research
- Primary Intent: Identify the user's main goal or purpose
- Goals: Actionable objectives based on the research type
- Next Steps: Concrete actions the user should take

Session Type: ${sessionType}
Entities Researched: ${entitiesResearched.join(', ')}
Aspects Covered: ${aspectsCovered.join(', ')}
Total Sources: ${totalSources}
Total Findings: ${totalFindings}`),
          new HumanMessage(`Consolidate research for: ${state.content}

Session Context:
- Type: ${sessionType}
- Items: ${sessionContext.itemCount || 0}
- Duration: ${sessionContext.timespan || 0} minutes

Research Scope:
- Entities: ${entitiesResearched.join(', ')}
- Aspects: ${aspectsCovered.join(', ')}
- Quality: ${researchScope.researchQuality || 'moderate'}

Key Findings Available: ${totalFindings}
Sources Consulted: ${totalSources}

Research Data Summary:
${this.formatResearchDataForPrompt(researchData)}

Generate comprehensive session consolidation with all required fields.`)
        ];
        
        const response = await this.llm.invoke(messages);
        let consolidatedResult;
        
        try {
          consolidatedResult = JSON.parse(response.content);
          
          // Validate required fields
          const requiredFields = ['researchObjective', 'summary', 'primaryIntent', 'researchGoals', 'nextSteps'];
          const missingFields = requiredFields.filter(field => !consolidatedResult[field]);
          
          if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
          }
          
          // Ensure arrays are proper arrays
          if (!Array.isArray(consolidatedResult.researchGoals)) {
            consolidatedResult.researchGoals = [consolidatedResult.researchGoals].filter(Boolean);
          }
          if (!Array.isArray(consolidatedResult.nextSteps)) {
            consolidatedResult.nextSteps = [consolidatedResult.nextSteps].filter(Boolean);
          }
          
        } catch (parseError) {
          console.log('LangGraph: Failed to parse consolidation result, generating structured fallback');
          
          // Generate structured fallback
          consolidatedResult = this.generateConsolidationFallback(
            sessionType, 
            entitiesResearched, 
            aspectsCovered, 
            totalSources, 
            totalFindings
          );
        }
        
        return {
          ...state,
          researchObjective: consolidatedResult.researchObjective,
          summary: consolidatedResult.summary,
          primaryIntent: consolidatedResult.primaryIntent,
          researchGoals: consolidatedResult.researchGoals,
          nextSteps: consolidatedResult.nextSteps,
          analysisQuality: totalSources > 5 && totalFindings > 8 ? 'high' : totalSources > 2 && totalFindings > 4 ? 'good' : 'moderate',
          consolidationMethod: 'ai_comprehensive'
        };
        
      } catch (error) {
        console.error('LangGraph: Error in session research consolidation:', error);
        
        // Generate basic fallback
        const sessionType = state.context?.sessionContext?.sessionType || 'general_research';
        const entities = state.context?.researchScope?.entitiesResearched || ['research topics'];
        const aspects = state.context?.researchScope?.aspectsCovered || ['general information'];
        
        return {
          ...state,
          researchObjective: `${sessionType.replace('_', ' ')} analysis of ${entities.slice(0, 2).join(' and ')}`,
          summary: `Completed comprehensive research analysis covering ${aspects.join(', ')} with detailed findings and insights.`,
          primaryIntent: entities.length > 1 ? `Compare ${entities.slice(0, 2).join(' and ')}` : `Research ${entities[0]}`,
          researchGoals: ['Complete comprehensive analysis', 'Gather relevant information', 'Make informed decisions'],
          nextSteps: ['Review research findings', 'Evaluate options', 'Take appropriate action'],
          analysisQuality: 'basic',
          consolidationMethod: 'fallback'
        };
      }
    });

    // Set workflow flow (single node)
    workflow.addEdge("consolidate_session_research", END);
    workflow.setEntryPoint("consolidate_session_research");
    
    // Compile and store workflow
    this.workflows.set("session_research_consolidation", workflow.compile());
    
    console.log('LangGraph: Session Research Consolidation workflow ready (unified 5-in-1 analysis)');
  }

  /**
   * Format research data for AI prompt
   */
  formatResearchDataForPrompt(researchData) {
    if (!researchData || !researchData.findings) {
      return 'No detailed research data available.';
    }
    
    const findings = researchData.findings || [];
    const aspectBreakdown = researchData.aspectBreakdown || {};
    const sources = researchData.uniqueSources || [];
    
    let formatted = '';
    
    if (findings.length > 0) {
      formatted += `Key Findings (${findings.length}):\n`;
      findings.slice(0, 8).forEach((finding, index) => {
        formatted += `${index + 1}. [${finding.aspect}] ${finding.finding}\n`;
      });
    }
    
    if (Object.keys(aspectBreakdown).length > 0) {
      formatted += `\nAspect Breakdown:\n`;
      Object.entries(aspectBreakdown).forEach(([aspect, data]) => {
        formatted += `- ${aspect}: ${data.count} findings, ${data.sources} sources\n`;
      });
    }
    
    if (sources.length > 0) {
      formatted += `\nSources (${sources.length}): ${sources.slice(0, 5).map(s => s.title).join(', ')}`;
    }
    
    return formatted || 'Research data processed successfully.';
  }

  /**
   * Generate structured fallback for consolidation
   */
  generateConsolidationFallback(sessionType, entities, aspects, totalSources, totalFindings) {
    // Generate basic objective
    let objective = `${sessionType.replace('_', ' ')} analysis`;
    if (entities.length > 1) {
      objective = `Compare ${entities.slice(0, 2).join(' and ')}`;
    } else if (entities.length === 1) {
      objective = `Research ${entities[0]}`;
    }

    // Generate summary
    const summary = `Completed comprehensive ${sessionType.replace('_', ' ')} covering ${aspects.join(', ')} with ${totalFindings} key findings from ${totalSources} sources. The research provides valuable insights and actionable information for informed decision-making.`;

    // Generate intent
    const intent = entities.length > 1 ? 
      `Compare and evaluate ${entities.slice(0, 2).join(' and ')}` : 
      `Research and understand ${entities[0] || 'information'}`;

    // Generate session-specific goals and steps
    const { goals, nextSteps } = this.generateSessionSpecificGoalsAndSteps(sessionType, entities);

    return {
      researchObjective: objective,
      summary: summary,
      primaryIntent: intent,
      researchGoals: goals,
      nextSteps: nextSteps
    };
  }

  /**
   * Generate session-type specific goals and next steps
   */
  generateSessionSpecificGoalsAndSteps(sessionType, entities) {
    const goals = [];
    const nextSteps = [];

    switch (sessionType) {
      case 'hotel_research':
        goals.push('Select optimal accommodation', 'Compare pricing and amenities', 'Evaluate location benefits');
        nextSteps.push('Check availability and rates', 'Read recent reviews', 'Make reservation');
        break;
      case 'restaurant_research':
        goals.push('Choose best dining option', 'Evaluate cuisine quality', 'Consider atmosphere and service');
        nextSteps.push('Check availability', 'Review menu and pricing', 'Make reservation');
        break;
      case 'product_research':
        goals.push('Make informed purchase decision', 'Compare features and pricing', 'Evaluate alternatives');
        nextSteps.push('Finalize product selection', 'Compare final pricing', 'Proceed with purchase');
        break;
      case 'travel_research':
        goals.push('Plan comprehensive itinerary', 'Optimize travel logistics', 'Budget effectively');
        nextSteps.push('Book accommodations', 'Arrange transportation', 'Finalize travel plans');
        break;
      case 'academic_research':
        goals.push('Gather comprehensive information', 'Analyze research findings', 'Synthesize knowledge');
        nextSteps.push('Review additional sources', 'Prepare analysis', 'Document findings');
        break;
      default:
        goals.push('Complete comprehensive analysis', 'Make informed decisions', 'Take appropriate action');
        nextSteps.push('Review findings', 'Evaluate options', 'Proceed with next steps');
    }

    // Add entity-specific goals if multiple entities
    if (entities.length > 1) {
      goals.unshift(`Compare ${entities.slice(0, 2).join(' and ')}`);
      nextSteps.unshift(`Finalize choice between ${entities.slice(0, 2).join(' and ')}`);
    }

    return { 
      goals: goals.slice(0, 4), 
      nextSteps: nextSteps.slice(0, 3) 
    };
  }

  /**
   * Execute a workflow by name
   */
  async executeWorkflow(workflowName, initialState) {
    try {
      console.log(`LangGraph: Executing ${workflowName} workflow...`);
      
      const workflow = this.workflows.get(workflowName);
      if (!workflow) {
        throw new Error(`Workflow ${workflowName} not found`);
      }

      const result = await workflow.invoke(initialState);
      
      console.log(`LangGraph: ${workflowName} workflow completed successfully`);
      return result;
    } catch (error) {
      console.error(`LangGraph: Error executing ${workflowName} workflow:`, error);
      throw error;
    }
  }

  /**
   * Get available workflows
   */
  getAvailableWorkflows() {
    return Array.from(this.workflows.keys());
  }

  /**
   * Helper method to extract content type (fallback)
   */
  extractContentType(content) {
    if (!content) return 'empty';
    
    const text = content.trim().toLowerCase();
    
    // URL detection
    if (content.match(/^https?:\/\//)) return 'url';
    
    // Email detection
    if (content.match(/\S+@\S+\.\S+/)) return 'email';
    
    // Phone number detection (various formats)
    if (content.match(/(\+?1-?)?(\d{3}[-.]?)?\d{3}[-.]?\d{4}/) || content.match(/\(\d{3}\)\s?\d{3}[-.]?\d{4}/)) return 'phone';
    
    // Date detection (various formats)
    if (content.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/) || content.match(/\d{4}-\d{2}-\d{2}/) || content.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s+\d{4}/i)) return 'date';
    
    // Address detection (contains address-like patterns)
    if (content.match(/\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|pl|place)\b/i) ||
        content.match(/\b\d{5}(-\d{4})?\b/) || // ZIP codes
        content.match(/\b[A-Z]{2}\s+\d{5}\b/) || // State + ZIP
        content.match(/\b(apt|apartment|suite|unit|#)\s*\d+/i)) return 'address';
    
    // Location/place detection
    if (content.match(/\b(city|town|village|county|state|country|province|region)\b/i) ||
        content.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/) || // City, State format
        content.match(/\b(north|south|east|west|central|downtown|uptown)\b/i) ||
        content.match(/\bmiles?\s+(from|to|away)\b/i)) return 'location';
    
    // Organization detection (check before person to avoid false positives)
    if (content.match(/\b(inc|llc|corp|corporation|ltd|limited|company|co\.|llp|pc)\b/i) ||
        content.match(/\b(university|college|hospital|school|church|bank|group|association|foundation)\b/i)) return 'organization';
    
    // Person detection (name patterns)
    if (content.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/) && // First Last format
        content.length < 100 && // Short enough to be a name
        !content.match(/\b(class|function|import|export|const|let|var)\b/i) && // Not code
        !content.match(/^https?:\/\//)) return 'person';
    
    // Financial data detection
    if (content.match(/\$[\d,]+\.?\d*/) || // Dollar amounts
        content.match(/\d+%/) || // Percentages
        content.match(/\b(price|cost|fee|salary|wage|budget|profit|loss|revenue|income)\b/i) ||
        content.match(/\b(usd|eur|gbp|jpy|cad|aud)\b/i)) return 'financial';
    
    // Code detection (improved patterns)
    if (content.includes('function') || content.includes('class') || content.includes('import') ||
        content.includes('const ') || content.includes('let ') || content.includes('var ') ||
        content.match(/\{.*\}/) || content.match(/^\s*[<>]/) || // JSON/XML/HTML
        content.match(/[=;]{1,2}/) || content.match(/^\s*\/\//) || // Comments
        content.match(/^\s*#[^#]/) || content.match(/\$\([^)]+\)/)) return 'code';
    
    // Document/text patterns
    if (content.match(/\b(document|file|pdf|doc|txt|report|article|paper|memo|letter)\b/i) ||
        content.match(/\b(title|subject|dear|sincerely|regards|attachment)\b/i)) return 'document';
    
    // JSON/structured data detection
    if ((content.trim().startsWith('{') && content.trim().endsWith('}')) ||
        (content.trim().startsWith('[') && content.trim().endsWith(']')) ||
        content.includes('"key":') || content.includes("'key':")) return 'data';
    
    // Default to text if no specific pattern matches
    return 'text';
  }

  /**
   * Generate fallback tags when AI analysis fails
   */
  generateFallbackTags(content, contextInfo) {
    const tags = [];
    
    // ALWAYS include content type as first tag
    const contentType = this.extractContentType(content);
    tags.push(contentType);
    
    // Content-based pattern tags
    if (content.includes('http') || content.includes('www.')) tags.push('web', 'url');
    if (content.includes('@') && !content.includes('function')) tags.push('email', 'contact');
    if (content.match(/(\+?1-?)?(\d{3}[-.]?)?\d{3}[-.]?\d{4}/)) tags.push('phone', 'contact');
    if (content.match(/\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road)/i)) tags.push('address', 'location');
    if (content.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/)) tags.push('location', 'geographic');
    if (content.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/) && content.length < 100) tags.push('person', 'name');
    if (content.match(/\b(inc|llc|corp|company)\b/i)) tags.push('organization', 'business');
    if (content.match(/\$[\d,]+|\d+%/)) tags.push('financial', 'money');
    if (content.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/)) tags.push('date', 'time');
    
    // Code and technical content
    if (content.includes('function') || content.includes('class') || content.includes('const ')) {
      tags.push('code', 'programming', 'development');
    }
    if (content.includes('TODO') || content.includes('FIXME')) tags.push('task', 'development');
    if (content.includes('import') || content.includes('export')) tags.push('code', 'module');
    if (content.match(/^\s*[<>]/)) tags.push('markup', 'web');
    if (content.match(/\{.*\}/)) tags.push('data', 'structured');
    
    // Content quality and length indicators
    if (content.length > 500) tags.push('long-content', 'detailed');
    if (content.length < 50) tags.push('short-content', 'brief');
    if (content.split('\n').length > 5) tags.push('multi-line', 'formatted');
    
    // Context-based tags from source app
    if (contextInfo.sourceApp) {
      const app = contextInfo.sourceApp.toLowerCase();
      if (app.includes('browser') || app.includes('chrome') || app.includes('safari')) {
        tags.push('web', 'browser');
      } else if (app.includes('code') || app.includes('editor') || app.includes('vscode')) {
        tags.push('development', 'coding');
      } else if (app.includes('mail') || app.includes('outlook') || app.includes('gmail')) {
        tags.push('email', 'communication');
      } else if (app.includes('document') || app.includes('word') || app.includes('pages')) {
        tags.push('document', 'writing');
      } else if (app.includes('terminal') || app.includes('command')) {
        tags.push('terminal', 'system');
      } else if (app.includes('slack') || app.includes('discord') || app.includes('teams')) {
        tags.push('chat', 'communication');
      } else if (app.includes('pdf') || app.includes('preview')) {
        tags.push('document', 'reading');
      }
    }
    
    // Window title context
    if (contextInfo.windowTitle) {
      const title = contextInfo.windowTitle.toLowerCase();
      if (title.includes('github') || title.includes('gitlab')) tags.push('git', 'repository');
      if (title.includes('stackoverflow') || title.includes('stack overflow')) tags.push('programming', 'help');
      if (title.includes('docs') || title.includes('documentation')) tags.push('documentation', 'reference');
      if (title.includes('tutorial') || title.includes('guide')) tags.push('tutorial', 'learning');
      if (title.includes('api') || title.includes('reference')) tags.push('api', 'technical');
    }
    
    // Purpose/intent tags based on content patterns
    if (content.match(/\b(how to|tutorial|guide|step|instruction)\b/i)) tags.push('tutorial', 'learning');
    if (content.match(/\b(example|sample|demo)\b/i)) tags.push('example', 'reference');
    if (content.match(/\b(error|bug|issue|problem|fix)\b/i)) tags.push('troubleshooting', 'error');
    if (content.match(/\b(config|configuration|settings|setup)\b/i)) tags.push('configuration', 'setup');
    if (content.match(/\b(note|reminder|todo|task)\b/i)) tags.push('task', 'reminder');
    if (content.match(/\b(meeting|schedule|appointment|calendar)\b/i)) tags.push('schedule', 'meeting');
    if (content.match(/\b(contact|phone|email|address)\b/i)) tags.push('contact', 'personal');
    
    // Remove duplicates and limit to reasonable number
    const uniqueTags = [...new Set(tags)];
    return uniqueTags.slice(0, 5); // Limit fallback tags to 5
  }

  /**
   * Validate and filter actions to ensure they're in the allowed set
   */
  validateAndFilterActions(actions, allowedActions) {
    if (!Array.isArray(actions)) {
      console.log('LangGraph: Invalid actions format, using fallback');
      return [{
        action: 'research',
        priority: 'medium',
        reason: 'Fallback action due to invalid format',
        confidence: 0.5
      }];
    }

    const validatedActions = [];
    
    for (const actionItem of actions) {
      if (!actionItem || typeof actionItem !== 'object') {
        continue; // Skip invalid action items
      }

      const { action, priority, reason, confidence } = actionItem;
      
      // Check if action is in the allowed list
      if (allowedActions.includes(action)) {
        validatedActions.push({
          action,
          priority: priority || 'medium',
          reason: reason || `Recommended action: ${action}`,
          confidence: confidence || 0.7
        });
      } else {
        // Log invalid action and provide mapping to closest valid action
        console.log(`LangGraph: Invalid action '${action}' replaced with valid alternative`);
        
        // Try to map common invalid actions to valid ones
        let mappedAction = 'research'; // Default fallback to research
        
        if (action && typeof action === 'string') {
          const actionLower = action.toLowerCase();
          
          // Smart mapping of common variations
          if (actionLower.includes('search') || actionLower.includes('find') || actionLower.includes('lookup')) {
            mappedAction = 'research';
          } else if (actionLower.includes('check') || actionLower.includes('verify') || actionLower.includes('validate')) {
            mappedAction = 'fact_check';
          } else if (actionLower.includes('short') || actionLower.includes('brief') || actionLower.includes('condense')) {
            mappedAction = 'summarize';
          } else if (actionLower.includes('convert') || actionLower.includes('language')) {
            mappedAction = 'translate';
          } else if (actionLower.includes('clarify') || actionLower.includes('understand') || actionLower.includes('describe')) {
            mappedAction = 'explain';
          } else if (actionLower.includes('detail') || actionLower.includes('elaborate') || actionLower.includes('more')) {
            mappedAction = 'expand';
          } else if (actionLower.includes('todo') || actionLower.includes('action') || actionLower.includes('task')) {
            mappedAction = 'create_task';
          } else if (actionLower.includes('source') || actionLower.includes('reference') || actionLower.includes('attribution')) {
            mappedAction = 'cite';
          } else if (actionLower.includes('reply') || actionLower.includes('answer') || actionLower.includes('message')) {
            mappedAction = 'respond';
          } else if (actionLower.includes('calendar') || actionLower.includes('time') || actionLower.includes('remind')) {
            mappedAction = 'schedule';
          } else if (actionLower.includes('save') || actionLower.includes('store') || actionLower.includes('keep')) {
            mappedAction = 'create_task'; // Map save actions to create_task
          } else if (actionLower.includes('share') || actionLower.includes('send') || actionLower.includes('distribute')) {
            mappedAction = 'respond'; // Map share actions to respond
          }
        }
        
        validatedActions.push({
          action: mappedAction,
          priority: priority || 'medium',
          reason: reason || `Mapped from '${action}' to '${mappedAction}'`,
          confidence: Math.max((confidence || 0.7) - 0.1, 0.3) // Slightly lower confidence for mapped actions
        });
      }
    }

    // Ensure we always have at least one action
    if (validatedActions.length === 0) {
      console.log('LangGraph: No valid actions found, using default');
      validatedActions.push({
        action: 'explain',
        priority: 'medium',
        reason: 'Default action when no valid actions provided',
        confidence: 0.5
      });
    }

    // Limit to 5 actions max
    return validatedActions.slice(0, 5);
  }

  /**
   * Analyze screenshot using vision model
   */
  async analyzeScreenshot(screenshotPath, content, contextPrompt) {
    try {
      // Validate parameters
      if (!screenshotPath) {
        console.log('LangGraph: No screenshot path provided');
        return null;
      }
      
      if (!content) {
        console.log('LangGraph: No content provided for screenshot analysis');
        return null;
      }
      
      if (!contextPrompt) {
        console.log('LangGraph: No context prompt provided');
        return null;
      }

      // Create cache key based on screenshot path and content
      const cacheKey = `vision_${screenshotPath}_${content.substring(0, 100).replace(/\s+/g, '_')}`;
      
      // Check if we have cached vision analysis
      const cachedResult = this.getVisionAnalysisCache(cacheKey);
      if (cachedResult) {
        console.log('LangGraph: Using cached vision analysis (preventing duplicate call)');
        return cachedResult;
      }

      // Validate vision model is available
      if (!this.visionModel) {
        console.log('LangGraph: Vision model not initialized');
        return null;
      }
      
      // Check if screenshot file exists
      const absolutePath = path.resolve(screenshotPath);
      await fs.access(absolutePath);
      
      // Read and encode screenshot as base64
      const imageBuffer = await fs.readFile(absolutePath);
      const base64Image = imageBuffer.toString('base64');
      
      // Validate base64 image
      if (!base64Image || base64Image.length < 100) {
        console.log('LangGraph: Invalid screenshot data');
        return null;
      }
      
      // Validate image size (should be reasonable for vision processing)
      if (base64Image.length > 20000000) { // ~20MB limit
        console.log('LangGraph: Screenshot too large for vision processing');
        return null;
      }
      
      // Safely extract content preview
      const contentStr = String(content || '');
      const contentPreview = contentStr.length > 200 ? contentStr.substring(0, 200) + '...' : contentStr;
      
      // Create vision message with proper LangChain format
      try {
        console.log('LangGraph: Creating vision messages for screenshot analysis...');
        console.log(`LangGraph: Content preview length: ${contentPreview.length}`);
        console.log(`LangGraph: Base64 image length: ${base64Image.length}`);
        
        // Create properly formatted vision message for LangChain
        const visionMessage = new HumanMessage({
          content: [
          {
            type: "text",
              text: `${contextPrompt || 'Analyze this screenshot for context.'}\n\nContent that was copied: "${contentPreview}"`
          },
          {
            type: "image_url", 
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
              detail: "auto"
            }
          }
          ]
        });
        
        console.log('LangGraph: Vision message created successfully');
        
        // Use only the vision message (no separate system message for vision models)
        console.log('LangGraph: Invoking vision model...');
        const response = await this.visionModel.invoke([visionMessage]);
        console.log('LangGraph: Vision model response received successfully');
        
        // Cache the successful result
        this.setVisionAnalysisCache(cacheKey, response.content);
        
        return response.content;
      } catch (visionError) {
        console.log('LangGraph: Vision model error:', visionError.message);
        
        // Try fallback approach with text-only analysis
        try {
          const fallbackMessages = [
            new SystemMessage(`Provide analysis based on screenshot context. Note: Screenshot analysis unavailable. ${contextPrompt || ''}`),
            new HumanMessage(`Content: "${contentPreview}". Please provide context analysis based on the content and assume this is from a typical application interface.`)
          ];
          
          const fallbackResponse = await this.llm.invoke(fallbackMessages);
          return fallbackResponse.content;
        } catch (fallbackError) {
          console.log('LangGraph: Fallback analysis also failed:', fallbackError.message);
          return null;
        }
      }
    } catch (error) {
      console.log('LangGraph: Screenshot analysis completely failed:', error.message);
      return null;
    }
  }

  /**
   * Extract structured search results from OpenAI web search response
   */
  async extractSearchResults(searchContent, query) {
    try {
      const messages = [
        new SystemMessage(`Extract structured search results from the web search content. 
        
Return a JSON array of search results with this format:
[
  {
    "title": "Page title",
    "snippet": "Brief description or excerpt",
    "url": "URL if available",
    "date": "Date in YYYY-MM-DD format or current date",
    "type": "search_result"
  }
]

If no specific results can be extracted, return an empty array.`),
        new HumanMessage(`Query: ${query}

Web search content:
${searchContent}

Extract structured results:`)
      ];

      const response = await this.llm.invoke(messages);
      
      try {
        const results = JSON.parse(response.content);
        return Array.isArray(results) ? results : [];
      } catch (parseError) {
        console.log('LangGraph: Could not parse search results, using fallback');
        return [];
      }
    } catch (error) {
      console.error('LangGraph: Error extracting search results:', error);
      return [];
    }
  }

  /**
   * Format research summary for better UI display
   */
  formatResearchSummary(rawSummary, topic) {
    try {
      if (!rawSummary || typeof rawSummary !== 'string') {
        return this.getDefaultFormattedSummary(topic);
      }

      let formatted = rawSummary.trim();
      
      // Ensure it starts with a topic header if it doesn't have one
      if (!formatted.match(/^\*\*.*\*\*/)) {
        formatted = `**${topic}** - Research Summary\n\n${formatted}`;
      }
      
      // Limit length to approximately 300 words (1800 characters)
      if (formatted.length > 1800) {
        // Find a good breaking point near the limit
        const truncateAt = formatted.lastIndexOf('.', 1600);
        if (truncateAt > 1000) {
          formatted = formatted.substring(0, truncateAt + 1) + '\n\n*[Summary truncated for display]*';
        } else {
          formatted = formatted.substring(0, 1600) + '...\n\n*[Summary truncated for display]*';
        }
      }
      
      // Ensure proper line breaks and spacing for paragraph format
      formatted = formatted
        .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
        .replace(/^\s+/gm, '') // Remove leading whitespace from lines
        .trim();
        
      // Clean up any existing bullet points to maintain paragraph format
      // Only preserve bullet points if they are intentionally used in small lists
      const bulletLines = formatted.split('\n').filter(line => line.match(/^[•·*-]\s/)).length;
      const totalLines = formatted.split('\n').length;
      
      // If more than 30% of lines are bullet points, likely it's meant to be paragraph format
      if (bulletLines > 0 && (bulletLines / totalLines) > 0.3) {
        // Convert bullet points back to paragraph sentences
      formatted = formatted
          .replace(/^[•·*-]\s*/gm, '') // Remove bullet markers
          .replace(/\n([A-Z])/g, '. $1') // Connect sentences
          .replace(/\.\s*\./g, '.'); // Clean up double periods
      }
        
      // Convert markdown-style formatting to HTML
      formatted = this.markdownToHtml(formatted);
        
      return formatted;
      
    } catch (error) {
      console.error('LangGraph: Error formatting research summary:', error);
      return this.getDefaultFormattedSummary(topic);
    }
  }

  /**
   * Convert basic markdown formatting to HTML for UI display
   */
  markdownToHtml(text) {
    try {
      let html = text;
      
      // Convert **bold** to <strong>
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      // Convert *italic* to <em>
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
      
      // Convert line breaks to <br> tags, but preserve double line breaks as paragraph breaks
      html = html.replace(/\n\n/g, '</p><p>');
      html = html.replace(/\n/g, '<br>');
      
      // Wrap in paragraph tags
      html = `<p>${html}</p>`;
      
      // Clean up empty paragraphs
      html = html.replace(/<p><\/p>/g, '');
      html = html.replace(/<p>\s*<\/p>/g, '');
      
      // Handle bullet points - convert to proper list format
      const bulletRegex = /<p>([^<]*?)([•·*-]\s[^<]+?)(?:<br>([•·*-]\s[^<]+?))*<\/p>/g;
      html = html.replace(bulletRegex, (match, beforeBullets, ...bulletMatches) => {
        const bullets = match.match(/[•·*-]\s[^<]+/g) || [];
        if (bullets.length > 0) {
          const listItems = bullets.map(bullet => {
            const content = bullet.replace(/^[•·*-]\s/, '').trim();
            return `<li>${content}</li>`;
          }).join('');
          return `${beforeBullets ? `<p>${beforeBullets.trim()}</p>` : ''}<ul>${listItems}</ul>`;
        }
        return match;
      });
      
      // Clean up any remaining bullet points that weren't caught
      html = html.replace(/([•·*-]\s)/g, '<br>• ');
      
      return html;
      
    } catch (error) {
      console.error('LangGraph: Error converting markdown to HTML:', error);
      // Return plain text with minimal formatting if conversion fails
      return text.replace(/\n/g, '<br>');
    }
  }

  /**
   * Get a default formatted summary when formatting fails
   */
  getDefaultFormattedSummary(topic) {
    const defaultText = `**${topic}** - Research Summary

Analysis of this topic has been completed based on available information and provides several key insights worth considering.

Research insights are available for this topic, and multiple perspectives should be considered for comprehensive understanding. Current applications and trends provide valuable context for practical decision-making, while specific use cases may vary depending on individual requirements and objectives.

For next steps, consider gathering additional sources to enhance understanding and verify findings through multiple reliable sources.`;
    
    return this.markdownToHtml(defaultText);
  }
  
  // Vision Analysis Cache Management
  getVisionAnalysisCache(cacheKey) {
    const cached = this.visionAnalysisCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    
    // Check if cache entry is still valid
    const now = Date.now();
    if (now - cached.timestamp > this.visionCacheMaxAge) {
      console.log(`LangGraph: Vision cache expired for key ${cacheKey}`);
      this.visionAnalysisCache.delete(cacheKey);
      return null;
    }
    
    return cached.result;
  }
  
  setVisionAnalysisCache(cacheKey, result) {
    this.visionAnalysisCache.set(cacheKey, {
      result: result,
      timestamp: Date.now()
    });
    console.log(`LangGraph: Cached vision analysis for ${cacheKey} (cache size: ${this.visionAnalysisCache.size})`);
  }

  /**
   * Research Query Generation Workflow - Intelligent query generation for session research
   * Replaces hardcoded content-type checks with AI-powered analysis
   * Analyzes content, context, and session type to generate targeted research queries
   */
  async setupResearchQueryGenerationWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        // Entry analysis data
        entryAnalysis: Object,
        sessionType: String,
        // Generated queries
        researchQueries: Array,
        queryCount: Number,
        analysisMethod: String
      }
    });

    // Single comprehensive query generation node
    workflow.addNode("generate_research_queries", async (state) => {
      try {
        console.log('LangGraph: Generating intelligent research queries...');
        
        const entryAnalysis = state.entryAnalysis || {};
        const sessionType = state.sessionType || 'general_research';
        const originalContent = entryAnalysis.content || state.content || '';
        const contentType = entryAnalysis.contentType || 'unknown';
        const tags = entryAnalysis.tags || [];
        const contextInsights = entryAnalysis.contextInsights || '';
        const visualContext = entryAnalysis.visualContext || {};

        console.log(`LangGraph: Analyzing ${contentType} content for ${sessionType} session`);

        const messages = [
          new SystemMessage(`You are an intelligent research query generator. Generate 1-3 targeted research queries based on the content and context provided.

**REQUIREMENTS:**
1. ALWAYS include the original content exactly as copied in the first query
2. Generate 1-3 total queries (including the original content query)
3. Make queries specific and actionable for web search
4. Consider the session type and content type for context
5. Each query should research a different aspect

**QUERY TYPES:**
- original_content_research: Exact content + "detailed information reviews features pricing availability"
- contextual_research: Related information based on content type and session context
- comparative_research: Alternatives or comparisons when appropriate

**SESSION TYPE CONTEXT:**
- hotel_research: Focus on pricing, amenities, location, reviews
- restaurant_research: Focus on menu, reviews, reservations, experience  
- product_research: Focus on specs, pricing, alternatives, reviews
- academic_research: Focus on sources, recent findings, related work
- general_research: Focus on comprehensive information

Return JSON array of query objects:
{
  "queries": [
    {
      "aspect": "original_content_research",
      "searchQuery": "exact original content detailed information reviews features pricing availability",
      "knownInfo": "Original content: exact content",
      "researchGap": "Comprehensive information about the specific item copied"
    },
    {
      "aspect": "contextual_research",
      "searchQuery": "contextually relevant query based on analysis",
      "knownInfo": "Context from analysis",
      "researchGap": "Specific gap this query addresses"
    }
  ]
}`),
          new HumanMessage(`**CONTENT TO ANALYZE:**
Original Content: "${originalContent}"

**CONTEXT:**
Content Type: ${contentType}
Session Type: ${sessionType}
Tags: ${tags.join(', ')}
Context Insights: ${contextInsights}
Visual Context: ${JSON.stringify(visualContext)}
Source App: ${entryAnalysis.sourceApp || 'unknown'}
Window Title: ${entryAnalysis.windowTitle || 'unknown'}

Generate 1-3 targeted research queries that will provide comprehensive information about this content.`)
        ];
        
        const response = await this.llm.invoke(messages);
        let queryResult;
        
        try {
          queryResult = JSON.parse(response.content);
          
          // Validate and structure the queries
          if (!queryResult.queries || !Array.isArray(queryResult.queries)) {
            throw new Error('Invalid query structure');
          }
          
          // Ensure we have the original content query
          let hasOriginalQuery = queryResult.queries.some(q => 
            q.aspect === 'original_content_research' || 
            q.searchQuery.includes(originalContent.substring(0, 20))
          );
          
          if (!hasOriginalQuery) {
            // Prepend the original content query
            queryResult.queries.unshift({
              aspect: 'original_content_research',
              searchQuery: `${originalContent} detailed information reviews features pricing availability`,
              knownInfo: `Original content: ${originalContent}`,
              researchGap: 'Comprehensive information about the specific item copied'
            });
          }
          
          // Limit to 3 queries and validate structure
          queryResult.queries = queryResult.queries.slice(0, 3).map(query => ({
            aspect: query.aspect || 'research',
            searchQuery: query.searchQuery || query.query || '',
            knownInfo: query.knownInfo || 'Content analysis',
            researchGap: query.researchGap || 'Additional information needed'
          })).filter(query => query.searchQuery.length > 0);
          
        } catch (parseError) {
          console.log('LangGraph: Failed to parse AI-generated queries, creating intelligent fallback');
          
          // Intelligent fallback based on content analysis
          queryResult = {
            queries: [
              {
                aspect: 'original_content_research',
                searchQuery: `${originalContent} detailed information reviews features pricing availability`,
                knownInfo: `Original content: ${originalContent}`,
                researchGap: 'Comprehensive information about the specific item copied'
              }
            ]
          };
          
          // Add contextual query based on content type and session type
          if (contentType === 'location' && sessionType === 'hotel_research') {
            queryResult.queries.push({
              aspect: 'area_research',
              searchQuery: `${originalContent} hotels accommodations options reviews recommendations`,
              knownInfo: `Location: ${originalContent}`,
              researchGap: 'Hotel options and recommendations in this area'
            });
          } else if (contentType === 'product' || sessionType === 'product_research') {
            queryResult.queries.push({
              aspect: 'product_comparison',
              searchQuery: `${originalContent} specifications reviews alternatives comparison`,
              knownInfo: `Product: ${originalContent}`,
              researchGap: 'Product specifications and alternatives'
            });
          } else if (tags.length > 0) {
            queryResult.queries.push({
              aspect: 'contextual_research',
              searchQuery: `${originalContent} ${tags.slice(0, 2).join(' ')} information guide`,
              knownInfo: `Context: ${tags.join(', ')}`,
              researchGap: 'Additional contextual information'
            });
          }
        }
        
        console.log(`LangGraph: Generated ${queryResult.queries.length} intelligent research queries`);
        
        return {
          ...state,
          researchQueries: queryResult.queries,
          queryCount: queryResult.queries.length,
          analysisMethod: 'ai_intelligent'
        };
        
      } catch (error) {
        console.error('LangGraph: Error in query generation:', error);
        
        // Basic fallback - ensure original content is always included
        const originalContent = state.entryAnalysis?.content || state.content || '';
        
        return {
          ...state,
          researchQueries: [
            {
              aspect: 'original_content_research',
              searchQuery: `${originalContent} detailed information reviews features pricing availability`,
              knownInfo: `Original content: ${originalContent}`,
              researchGap: 'Comprehensive information about the specific item copied'
            }
          ],
          queryCount: 1,
          analysisMethod: 'fallback'
        };
      }
    });

    // Set workflow flow (single node)
    workflow.addEdge("generate_research_queries", END);
    workflow.setEntryPoint("generate_research_queries");
    
    // Compile and store workflow
    this.workflows.set("research_query_generation", workflow.compile());
    
    console.log('LangGraph: Research Query Generation workflow ready (replaces hardcoded logic)');
  }

  async init() {
    if (this.isInitialized) return;
    
    try {
      console.log('LangGraph: Initializing client...');
      
      // Initialize OpenAI client with configuration
      const { ChatOpenAI } = await import('@langchain/openai');
      
      this.llm = new ChatOpenAI({
        modelName: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        temperature: 0.7,
        openAIApiKey: process.env.OPENAI_API_KEY
      });
      
      // Initialize vision model for screenshot analysis
      this.visionModel = new ChatOpenAI({
        modelName: process.env.OPENAI_VISION_MODEL || "gpt-4o",
        temperature: 0.7,
        openAIApiKey: process.env.OPENAI_API_KEY
      });
      
      // Vision analysis cache to prevent duplicate calls within workflows
      this.visionAnalysisCache = new Map();
      this.visionCacheMaxAge = 2 * 60 * 1000; // 2 minutes cache for vision analysis
      
      // Initialize all workflows
      await this.initializeWorkflows();
      
      this.isInitialized = true;
      console.log('LangGraph: Client initialized successfully');
    } catch (error) {
      console.error('LangGraph: Failed to initialize client:', error);
      throw error;
    }
  }
}

module.exports = LangGraphClient; 