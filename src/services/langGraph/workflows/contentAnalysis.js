/**
 * Content Analysis Workflows
 * Handles comprehensive content analysis and summarization
 */

const { StateGraph, END } = require("@langchain/langgraph");
const { Logger, JSONParser, MessageBuilder, ContentAnalyzer, TextFormatter } = require('../utils');
const { ALLOWED_ACTIONS, RESPONSE_LIMITS } = require('../constants');

class ContentAnalysisWorkflows {
  constructor(llm, visionModel) {
    this.llm = llm;
    this.visionModel = visionModel;
  }

  /**
   * Setup Comprehensive Content Analysis Workflow
   * Combines: Content Classification + Context Analysis + Action Recommendations + Tagging
   */
  async setupComprehensiveContentAnalysisWorkflow() {
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
3. USER ACTIVITY: What type of work/research activity is happening? (coding, browsing, writing, etc.)
4. WORK CONTEXT: Is this professional, academic, personal, or creative work?
5. URGENCY INDICATORS: Any visual cues about priority or time sensitivity?

Provide detailed insights for content classification, tagging, and action recommendations.`
          );
          
          if (visualAnalysis) {
            contextInsights = `Visual Context Analysis: ${visualAnalysis}\n\n`;
          }
        }

        // Comprehensive content and context analysis
        const systemPrompt = `Perform comprehensive clipboard content analysis. Analyze and return JSON with ALL of the following:

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
⚠️ IMPORTANT: Use ONLY these actions: ${ALLOWED_ACTIONS.join(', ')}

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
}`;

        const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, contextInfo);
        const response = await this.llm.invoke(messages);
        
        const analysis = JSONParser.parseWithFallback(response, () => {
          // Comprehensive fallback
          return {
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
            tags: [
              ContentAnalyzer.extractContentType(state.content),
              contextInfo.sourceApp ? contextInfo.sourceApp.toLowerCase() : "general",
              "reference",
              ...ContentAnalyzer.generateFallbackTags(state.content, contextInfo)
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
        });

        // Validate and filter recommended actions
        if (analysis.recommendedActions && Array.isArray(analysis.recommendedActions)) {
          analysis.recommendedActions = ContentAnalyzer.validateAndFilterActions(analysis.recommendedActions, ALLOWED_ACTIONS);
        }
        
        // Validate and ensure tags are always present
        if (!analysis.tags || !Array.isArray(analysis.tags) || analysis.tags.length === 0) {
          Logger.log('Invalid or missing tags, generating fallback tags');
          analysis.tags = [
            ContentAnalyzer.extractContentType(state.content),
            contextInfo.sourceApp ? contextInfo.sourceApp.toLowerCase() : "general",
            "ai-generated",
            ...ContentAnalyzer.generateFallbackTags(state.content, contextInfo)
          ].slice(0, 5);
        } else {
          // Clean and validate existing tags
          analysis.tags = analysis.tags
            .filter(tag => tag && typeof tag === 'string' && tag.trim().length > 0)
            .map(tag => tag.trim().toLowerCase())
            .slice(0, 5);
          
          // Ensure we have at least 2 tags
          if (analysis.tags.length < 2) {
            const fallbackTags = ContentAnalyzer.generateFallbackTags(state.content, contextInfo);
            analysis.tags.push(...fallbackTags);
            analysis.tags = [...new Set(analysis.tags)].slice(0, 5);
          }
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
        Logger.error('Comprehensive analysis error', 'ContentAnalysis', error);
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
            ContentAnalyzer.extractContentType(state.content),
            state.context?.sourceApp ? state.context.sourceApp.toLowerCase() : "general",
            "error-fallback",
            ...ContentAnalyzer.generateFallbackTags(state.content, state.context || {})
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

    // Step 2: Quality Enhancement & Validation
    workflow.addNode("enhance_results", async (state) => {
      try {
        // Only enhance if we have good base analysis and it's complex content
        if (state.confidence < 80 && state.content.length > 100) {
          const systemPrompt = `Enhance the analysis results for better accuracy:

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
}`;

          const messages = MessageBuilder.createAnalysisMessages(systemPrompt, state.content, { contextInsights: state.contextInsights, confidence: state.confidence });
          const response = await this.llm.invoke(messages);
          
          const enhancement = JSONParser.parseWithFallback(response, () => ({}));
          
          // Validate enhanced actions
          let validatedActions = state.recommendedActions;
          if (enhancement.enhancedActions && Array.isArray(enhancement.enhancedActions)) {
            validatedActions = ContentAnalyzer.validateAndFilterActions(enhancement.enhancedActions, ALLOWED_ACTIONS);
          }
          
          return {
            ...state,
            tags: enhancement.enhancedTags || state.tags,
            recommendedActions: validatedActions,
            confidence: Math.min(state.confidence + (enhancement.confidenceBoost || 0), 95),
            analysisMethod: 'comprehensive_enhanced'
          };
        }
        
        // No enhancement needed
        return state;
      } catch (error) {
        Logger.error('Enhancement error', 'ContentAnalysis', error);
        return state;
      }
    });

    // Define workflow flow
    workflow.addEdge("comprehensive_analysis", "enhance_results");
    workflow.addEdge("enhance_results", END);
    workflow.setEntryPoint("comprehensive_analysis");
    
    const compiledWorkflow = workflow.compile();
    Logger.log('Comprehensive Content Analysis workflow ready (unified approach)');
    return compiledWorkflow;
  }

  /**
   * Setup Optimized Summarization Workflow
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
        const systemPrompt = `Extract key points and create a context-aware summary foundation.

1. EXTRACT 3-7 key points from the content
2. CONSIDER the context: Source app (${contextInfo.sourceApp || 'unknown'}), purpose, and user intent
3. CREATE a contextual summary that preserves essential information

Return as JSON:
{
  "keyPoints": ["point1", "point2", "point3"],
  "contextualSummary": "Context-aware summary that considers why this was copied and how it might be used"
}`;

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
        Logger.error('Key point extraction error', 'ContentAnalysis', error);
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
        const systemPrompt = `Create a high-quality, concise summary with built-in quality validation.

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
}`;

        const humanContent = `Original Content: ${state.content}

Key Points: ${state.keyPoints.join(', ')}
Contextual Foundation: ${state.contextualSummary}`;

        const messages = [
          MessageBuilder.createSystemMessage(systemPrompt),
          MessageBuilder.createHumanMessage(humanContent)
        ];
        
        const response = await this.llm.invoke(messages);
        
        const result = JSONParser.parseWithFallback(response, () => {
          return {
            summary: state.keyPoints.slice(0, 2).join('. ') + '.',
            qualityScore: 75,
            needsRefinement: false,
            qualityNotes: "Fallback summary generated"
          };
        });
        
        const qualityScore = result.qualityScore || 75;
        
        return {
          ...state,
          summary: result.summary || state.contextualSummary,
          qualityScore: qualityScore,
          needsRefinement: qualityScore < 70,
          finalSummary: qualityScore >= 70 ? result.summary : result.summary
        };
      } catch (error) {
        Logger.error('Summary generation error', 'ContentAnalysis', error);
        return {
          ...state,
          summary: state.keyPoints.slice(0, 2).join('. ') + '.',
          qualityScore: 60,
          needsRefinement: true,
          finalSummary: state.contextualSummary
        };
      }
    });

    // Step 3: Conditional Refinement
    workflow.addNode("refine_summary", async (state) => {
      try {
        const systemPrompt = `Improve the summary (current score: ${state.qualityScore}/100).

Address likely issues and create a better version:
- Add missing key information
- Improve clarity and flow
- Ensure proper context
- Keep it concise (2-3 sentences max)

Return the improved summary as plain text.`;

        const humanContent = `Original Content: ${state.content}

Current Summary: ${state.summary}
Key Points to Include: ${state.keyPoints.join(', ')}`;

        const messages = [
          MessageBuilder.createSystemMessage(systemPrompt),
          MessageBuilder.createHumanMessage(humanContent)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          finalSummary: response.content,
          qualityScore: Math.min(state.qualityScore + 15, 95)
        };
      } catch (error) {
        Logger.error('Summary refinement error', 'ContentAnalysis', error);
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
    
    const compiledWorkflow = workflow.compile();
    Logger.log('Optimized Summarization workflow ready (reduced from 5 to 3 steps)');
    return compiledWorkflow;
  }

  /**
   * Analyze screenshot using vision model
   */
  async analyzeScreenshot(screenshotPath, content, contextPrompt) {
    try {
      if (!screenshotPath || !content || !contextPrompt) {
        return null;
      }

      if (!this.visionModel) {
        Logger.log('Vision model not initialized');
        return null;
      }
      
      const fs = require('fs').promises;
      const path = require('path');
      
      // Check if screenshot file exists
      const absolutePath = path.resolve(screenshotPath);
      await fs.access(absolutePath);
      
      // Read and encode screenshot as base64
      const imageBuffer = await fs.readFile(absolutePath);
      const base64Image = imageBuffer.toString('base64');
      
      // Validate base64 image
      if (!base64Image || base64Image.length < 100) {
        Logger.log('Invalid screenshot data');
        return null;
      }
      
      // Validate image size (should be reasonable for vision processing)
      if (base64Image.length > 20000000) { // ~20MB limit
        Logger.log('Screenshot too large for vision processing');
        return null;
      }
      
      // Create vision message
      const visionMessage = MessageBuilder.createVisionMessage(content, base64Image, contextPrompt);
      
      Logger.log('Invoking vision model...');
      const response = await this.visionModel.invoke([visionMessage]);
      Logger.log('Vision model response received successfully');
      
      return response.content;
    } catch (error) {
      Logger.error('Screenshot analysis failed', 'ContentAnalysis', error);
      return null;
    }
  }
}

module.exports = ContentAnalysisWorkflows; 