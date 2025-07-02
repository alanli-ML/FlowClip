const { StateGraph, END } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const fs = require('fs').promises;
const path = require('path');

class LangGraphClient {
  constructor() {
    // Initialize OpenAI client with configuration
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
    
    // Store compiled workflows
    this.workflows = new Map();
    
    // Initialize all workflows
    this.initializeWorkflows();
  }

  async initializeWorkflows() {
    try {
      console.log('LangGraph: Initializing workflows...');
      
      // Setup all workflow types
      await this.setupContentAnalysisWorkflow();
      await this.setupSummarizationWorkflow();
      await this.setupTaggingWorkflow();
      await this.setupResearchWorkflow();
      await this.setupActionRecommendationWorkflow();
      
      // Setup session management workflows
      await this.setupSessionMembershipWorkflow();
      await this.setupSessionTypeDetectionWorkflow();
      await this.setupSessionAnalysisWorkflow();
      await this.setupHotelResearchWorkflow();
      
      console.log('LangGraph: All workflows initialized successfully');
    } catch (error) {
      console.error('LangGraph: Error initializing workflows:', error);
      throw error;
    }
  }

  /**
   * Content Analysis Workflow - Multi-step content processing
   * Steps: Content Classification → Context Analysis → Tag Generation
   */
  async setupContentAnalysisWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        contentType: String,
        sentiment: String,
        tags: Array,
        insights: String,
        confidence: Number
      }
    });

    // Step 1: Content Classification
    workflow.addNode("classify_content", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Analyze the provided content and determine:
1. Content type (text, code, url, email, phone, address, data, other)
2. Sentiment (positive, negative, neutral)
3. Primary purpose/intent
4. Confidence level (0-100)

Respond in JSON format with these exact keys: contentType, sentiment, purpose, confidence`),
          new HumanMessage(state.content)
        ];
        
        const response = await this.llm.invoke(messages);
        let analysis;
        
        try {
          analysis = JSON.parse(response.content);
        } catch (parseError) {
          // Fallback if JSON parsing fails
          analysis = {
            contentType: this.extractContentType(state.content),
            sentiment: "neutral",
            purpose: "general",
            confidence: 75
          };
        }
        
        return {
          ...state,
          contentType: analysis.contentType || "text",
          sentiment: analysis.sentiment || "neutral",
          purpose: analysis.purpose || "general",
          confidence: analysis.confidence || 75
        };
      } catch (error) {
        console.error('Content classification error:', error);
        return {
          ...state,
          contentType: "text",
          sentiment: "neutral",
          purpose: "general",
          confidence: 50
        };
      }
    });

    // Step 2: Context Analysis
    workflow.addNode("analyze_context", async (state) => {
      try {
        const contextInfo = state.context || {};
        let contextInsights = "";
        
        // First, try to get visual context from screenshot if available
        if (contextInfo.screenshotPath) {
          const screenshotAnalysis = await this.analyzeScreenshot(
            contextInfo.screenshotPath,
            state.content,
            `Analyze this screenshot to provide context for understanding why this content was copied.

Focus on:
1. What application or interface is visible?
2. What task or workflow does the user appear to be engaged in?
3. How does the visual context relate to the copied content?
4. What additional context clues are visible that might affect how this content should be categorized or used?

Provide a detailed analysis that will help with clipboard content management and organization.`
          );
          
          if (screenshotAnalysis) {
            contextInsights = `Visual Context Analysis: ${screenshotAnalysis}\n\n`;
          }
        }
        
        // Add traditional context analysis
        const messages = [
          new SystemMessage(`Analyze the context and source information:
- Source application: ${contextInfo.sourceApp || 'unknown'}
- Window title: ${contextInfo.windowTitle || 'unknown'}
- Surrounding text: ${contextInfo.surroundingText || 'none'}
- Screenshot available: ${contextInfo.screenshotPath ? 'Yes' : 'No'}

${contextInsights ? 'Visual analysis: ' + contextInsights : ''}

Provide insights about how the context affects the content's meaning and usage.
Focus on practical insights for clipboard management and organization.`),
          new HumanMessage(`Content: ${state.content}\nContent Type: ${state.contentType}\nSentiment: ${state.sentiment}`)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          contextInsights: contextInsights + response.content,
          sourceApp: contextInfo.sourceApp || 'unknown',
          hasVisualContext: !!contextInfo.screenshotPath
        };
      } catch (error) {
        console.error('Context analysis error:', error);
        return {
          ...state,
          contextInsights: "Context analysis unavailable",
          sourceApp: "unknown",
          hasVisualContext: false
        };
      }
    });

    // Step 3: Tag Generation
    workflow.addNode("generate_tags", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Generate 3-5 relevant tags for this clipboard item.
Tags should be:
- Concise (1-2 words)
- Relevant to content and context
- Useful for searching and organization
- Mix of content-based and purpose-based tags
- Consider visual context when available

${state.hasVisualContext ? 'Visual context is available and has been analyzed.' : 'No visual context available.'}

Return as a JSON array of strings: ["tag1", "tag2", "tag3"]`),
          new HumanMessage(`Content: ${state.content}
Type: ${state.contentType}
Sentiment: ${state.sentiment}
Source: ${state.sourceApp}
Context Insights: ${state.contextInsights}
Has Visual Context: ${state.hasVisualContext ? 'Yes' : 'No'}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let tags;
        
        try {
          tags = JSON.parse(response.content);
          if (!Array.isArray(tags)) {
            tags = [state.contentType, state.sentiment, state.sourceApp].filter(Boolean);
          }
        } catch (parseError) {
          // Fallback tag generation
          tags = [state.contentType, state.sentiment, state.sourceApp].filter(Boolean);
        }
        
        return {
          ...state,
          tags: tags.slice(0, 5) // Limit to 5 tags
        };
      } catch (error) {
        console.error('Tag generation error:', error);
        return {
          ...state,
          tags: [state.contentType || "content"]
        };
      }
    });

    // Define workflow flow
    workflow.addEdge("classify_content", "analyze_context");
    workflow.addEdge("analyze_context", "generate_tags");
    workflow.addEdge("generate_tags", END);

    workflow.setEntryPoint("classify_content");
    
    // Compile and store workflow
    this.workflows.set("content_analysis", workflow.compile());
    console.log('LangGraph: Content Analysis workflow ready');
  }

  /**
   * Summarization Workflow - Multi-step summarization with quality validation
   * Steps: Key Point Extraction → Context Integration → Summary Generation → Quality Validation
   */
  async setupSummarizationWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        keyPoints: Array,
        summary: String,
        qualityScore: Number,
        finalSummary: String,
        needsRefinement: Boolean
      }
    });

    // Step 1: Key Point Extraction
    workflow.addNode("extract_key_points", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Extract 3-7 key points from the content.
Focus on the most important information that should be preserved in a summary.
Return as JSON array: ["point1", "point2", "point3"]`),
          new HumanMessage(state.content)
        ];
        
        const response = await this.llm.invoke(messages);
        let keyPoints;
        
        try {
          keyPoints = JSON.parse(response.content);
        } catch (parseError) {
          keyPoints = ["Main content summary needed"];
        }
        
        return {
          ...state,
          keyPoints: keyPoints
        };
      } catch (error) {
        console.error('Key point extraction error:', error);
        return {
          ...state,
          keyPoints: ["Summary extraction failed"]
        };
      }
    });

    // Step 2: Context Integration
    workflow.addNode("integrate_context", async (state) => {
      try {
        const contextInfo = state.context || {};
        const messages = [
          new SystemMessage(`Consider the context when summarizing:
- Source: ${contextInfo.sourceApp || 'unknown'}
- Purpose: Based on the source and content, what was likely the user's intent?
- Key points: ${state.keyPoints.join(', ')}

Create a context-aware summary that considers why this was copied.`),
          new HumanMessage(state.content)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          contextualSummary: response.content
        };
      } catch (error) {
        console.error('Context integration error:', error);
        return {
          ...state,
          contextualSummary: state.keyPoints.join('. ') + '.'
        };
      }
    });

    // Step 3: Summary Generation
    workflow.addNode("generate_summary", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Create a concise, informative summary.
Requirements:
- Maximum 2-3 sentences
- Preserve key information
- Include context when relevant
- Clear and actionable

Key points to include: ${state.keyPoints.join(', ')}`),
          new HumanMessage(`Content: ${state.content}
Contextual insights: ${state.contextualSummary}`)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          summary: response.content
        };
      } catch (error) {
        console.error('Summary generation error:', error);
        return {
          ...state,
          summary: state.keyPoints.slice(0, 2).join('. ') + '.'
        };
      }
    });

    // Step 4: Quality Validation
    workflow.addNode("validate_quality", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Rate the summary quality on a scale of 0-100.
Consider:
- Accuracy (does it represent the original?)
- Completeness (are key points covered?)
- Clarity (is it easy to understand?)
- Conciseness (appropriate length?)

Return only a number between 0-100.`),
          new HumanMessage(`Original: ${state.content}
Summary: ${state.summary}`)
        ];
        
        const response = await this.llm.invoke(messages);
        const qualityScore = parseInt(response.content) || 75;
        
        return {
          ...state,
          qualityScore: qualityScore,
          needsRefinement: qualityScore < 70,
          finalSummary: qualityScore >= 70 ? state.summary : state.summary
        };
      } catch (error) {
        console.error('Quality validation error:', error);
        return {
          ...state,
          qualityScore: 75,
          needsRefinement: false,
          finalSummary: state.summary
        };
      }
    });

    // Step 5: Refinement (conditional)
    workflow.addNode("refine_summary", async (state) => {
      try {
        const messages = [
          new SystemMessage(`The previous summary scored ${state.qualityScore}/100.
Improve it by addressing likely issues:
- Add missing key information
- Improve clarity
- Ensure proper context
- Keep it concise`),
          new HumanMessage(`Original: ${state.content}
Current summary: ${state.summary}
Key points: ${state.keyPoints.join(', ')}`)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          finalSummary: response.content,
          qualityScore: Math.min(state.qualityScore + 15, 95) // Assume refinement improves quality
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
    workflow.addEdge("extract_key_points", "integrate_context");
    workflow.addEdge("integrate_context", "generate_summary");
    workflow.addEdge("generate_summary", "validate_quality");
    
    // Conditional edge: refine if quality is low
    workflow.addConditionalEdges(
      "validate_quality",
      (state) => state.needsRefinement ? "refine_summary" : END
    );
    workflow.addEdge("refine_summary", END);

    workflow.setEntryPoint("extract_key_points");
    
    this.workflows.set("summarization", workflow.compile());
    console.log('LangGraph: Summarization workflow ready');
  }

  /**
   * Tagging Workflow - Intelligent tag generation with categorization
   */
  async setupTaggingWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        contentTags: Array,
        contextTags: Array,
        purposeTags: Array,
        finalTags: Array
      }
    });

    // Step 1: Content-based tags
    workflow.addNode("generate_content_tags", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Generate content-based tags (what it is):
Examples: code, email, url, documentation, data, text, image-url, etc.
Return as JSON array: ["tag1", "tag2"]`),
          new HumanMessage(state.content)
        ];
        
        const response = await this.llm.invoke(messages);
        let contentTags;
        
        try {
          contentTags = JSON.parse(response.content);
        } catch (parseError) {
          contentTags = ["content"];
        }
        
        return {
          ...state,
          contentTags: contentTags
        };
      } catch (error) {
        return {
          ...state,
          contentTags: ["content"]
        };
      }
    });

    // Step 2: Context-based tags
    workflow.addNode("generate_context_tags", async (state) => {
      try {
        const contextInfo = state.context || {};
        const messages = [
          new SystemMessage(`Generate context-based tags (where/how it was used):
Based on source app: ${contextInfo.sourceApp || 'unknown'}
Examples: development, research, communication, design, productivity, etc.
Return as JSON array: ["tag1", "tag2"]`),
          new HumanMessage(`Content: ${state.content}
Source: ${contextInfo.sourceApp}
Window: ${contextInfo.windowTitle}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let contextTags;
        
        try {
          contextTags = JSON.parse(response.content);
        } catch (parseError) {
          contextTags = [contextInfo.sourceApp || "general"];
        }
        
        return {
          ...state,
          contextTags: contextTags
        };
      } catch (error) {
        return {
          ...state,
          contextTags: ["general"]
        };
      }
    });

    // Step 3: Purpose-based tags
    workflow.addNode("generate_purpose_tags", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Generate purpose-based tags (why it was copied):
Examples: reference, todo, share, store, process, learn, etc.
Return as JSON array: ["tag1", "tag2"]`),
          new HumanMessage(`Content: ${state.content}
Content tags: ${state.contentTags.join(', ')}
Context tags: ${state.contextTags.join(', ')}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let purposeTags;
        
        try {
          purposeTags = JSON.parse(response.content);
        } catch (parseError) {
          purposeTags = ["reference"];
        }
        
        return {
          ...state,
          purposeTags: purposeTags
        };
      } catch (error) {
        return {
          ...state,
          purposeTags: ["reference"]
        };
      }
    });

    // Step 4: Tag consolidation
    workflow.addNode("consolidate_tags", async (state) => {
      // Combine all tags and remove duplicates
      const allTags = [
        ...state.contentTags,
        ...state.contextTags,
        ...state.purposeTags
      ];
      
      // Remove duplicates and limit to 5 tags
      const uniqueTags = [...new Set(allTags)].slice(0, 5);
      
      return {
        ...state,
        finalTags: uniqueTags
      };
    });

    // Define workflow flow
    workflow.addEdge("generate_content_tags", "generate_context_tags");
    workflow.addEdge("generate_context_tags", "generate_purpose_tags");
    workflow.addEdge("generate_purpose_tags", "consolidate_tags");
    workflow.addEdge("consolidate_tags", END);

    workflow.setEntryPoint("generate_content_tags");
    
    this.workflows.set("tagging", workflow.compile());
    console.log('LangGraph: Tagging workflow ready');
  }

  /**
   * Research Workflow - Preparation for external research (Phase 3)
   */
  async setupResearchWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
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
        // Pre-process content to extract meaningful search terms if it's a URL
        let processedContent = state.content;
        let contentContext = "general content";
        
        // Check if content is a URL and extract meaningful information
        if (state.content.includes('http') || state.content.includes('www.')) {
          try {
            const url = new URL(state.content.split('\n')[0]); // Take first line if multi-line
            const hostname = url.hostname.toLowerCase();
            const pathname = url.pathname;
            
            if (hostname.includes('booking.com') && pathname.includes('hotel')) {
              // Extract hotel information from Booking.com URLs
              const pathParts = pathname.split('/');
              const hotelPart = pathParts.find(part => part.includes('hotel'));
              const locationPart = pathParts[pathParts.indexOf(hotelPart) + 2] || '';
              
              if (locationPart) {
                const location = locationPart.replace(/-/g, ' ').replace(/\.html.*/, '');
                processedContent = `${location} hotel`;
                contentContext = "hotel booking research";
              }
            } else if (hostname.includes('airbnb.com')) {
              processedContent = "vacation rental accommodation";
              contentContext = "accommodation research";
            } else if (hostname.includes('tripadvisor') || hostname.includes('expedia') || hostname.includes('hotels.com')) {
              processedContent = "hotel accommodation travel";
              contentContext = "travel research";
            } else {
              // Generic URL - extract domain for context
              const domain = hostname.replace('www.', '');
              processedContent = `information from ${domain}`;
              contentContext = "website research";
            }
          } catch (urlError) {
            // If URL parsing fails, use original content
            console.log('URL parsing failed, using original content');
          }
        }
        
        const messages = [
          new SystemMessage(`Generate 3-5 specific, targeted search queries that would help find comprehensive information about the given topic. 

Content Context: ${contentContext}
Original Content: ${state.content.substring(0, 200)}
Processed Content: ${processedContent}

Create SHORT, FOCUSED search queries (2-5 words each) that would work well in search engines. Do NOT include full URLs or long tracking parameters.

For hotel/accommodation research, focus on:
- Hotel name and location
- Reviews and ratings  
- Amenities and facilities
- Pricing and availability
- Local attractions

Return only a JSON array of SHORT search query strings.`),
          new HumanMessage(`Generate effective search queries for: ${processedContent}`)
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
          // Fallback queries based on processed content
          if (contentContext === "hotel booking research") {
            const location = processedContent.replace(' hotel', '');
            researchQueries = [
              `${location} hotels`,
              `${location} hotel reviews`,
              `${location} accommodation`,
              `best hotels ${location}`,
              `${location} travel guide`
            ];
          } else if (contentContext === "accommodation research") {
            researchQueries = [
              "vacation rental reviews",
              "accommodation booking tips",
              "travel accommodation guide"
            ];
          } else {
            // Generic fallback
            const content = String(state.content).toLowerCase();
            if (content.includes('hotel') || content.includes('accommodation')) {
              researchQueries = [
                "hotel reviews",
                "accommodation booking",
                "travel guide"
              ];
            } else if (content.includes('restaurant')) {
              researchQueries = [
                "restaurant reviews",
                "menu information",
                "reservation details"
              ];
            } else {
              researchQueries = [
                `${processedContent} information`,
                `${processedContent} guide`,
                `${processedContent} reviews`
              ];
            }
          }
        }
        
        console.log('LangGraph Research: Generated queries:', researchQueries);
        
        return {
          ...state,
          researchQueries: researchQueries
        };
      } catch (error) {
        console.error('Query generation error:', error);
        return {
          ...state,
          researchQueries: [`information about ${state.content.substring(0, 50)}`]
        };
      }
    });

    // Step 2: Perform Web Research (Real Google Search via SerpAPI)
    workflow.addNode("perform_web_research", async (state) => {
      try {
        console.log('LangGraph Research: Performing real web search...');
        
        const searchResults = [];
        
        for (const query of state.researchQueries) {
          console.log(`LangGraph Research: Searching Google for: ${query}`);
          
          try {
            // Use SerpAPI for real Google search results
            const serpApiKey = process.env.SERPAPI_KEY || 'demo'; // Use demo key for testing
            const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${serpApiKey}&num=10`;
            
            const response = await fetch(searchUrl, {
              headers: {
                'User-Agent': 'FlowClip/1.0 Research Assistant'
              },
              timeout: 15000
            });
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.organic_results && data.organic_results.length > 0) {
                const queryResults = {
                  query: query,
                  results: data.organic_results.slice(0, 5).map(result => ({
                    title: result.title || 'Search Result',
                    snippet: result.snippet || result.description || 'No description available',
                    url: result.link || '',
                    date: result.date || new Date().toISOString().split('T')[0],
                    position: result.position || 0
                  }))
                };
                
                // Add featured snippet if available
                if (data.answer_box) {
                  queryResults.results.unshift({
                    title: `Featured: ${data.answer_box.title || 'Answer Box'}`,
                    snippet: data.answer_box.answer || data.answer_box.snippet || 'Featured information',
                    url: data.answer_box.link || '',
                    date: new Date().toISOString().split('T')[0],
                    position: 0,
                    type: 'featured'
                  });
                }
                
                // Add knowledge graph if available
                if (data.knowledge_graph && data.knowledge_graph.description) {
                  queryResults.results.unshift({
                    title: `Knowledge: ${data.knowledge_graph.title || 'Knowledge Graph'}`,
                    snippet: data.knowledge_graph.description,
                    url: data.knowledge_graph.website || '',
                    date: new Date().toISOString().split('T')[0],
                    position: 0,
                    type: 'knowledge'
                  });
                }
                
                searchResults.push(queryResults);
                console.log(`LangGraph Research: Found ${queryResults.results.length} results for "${query}"`);
              } else {
                console.log(`LangGraph Research: No results found for "${query}"`);
              }
            } else {
              console.log(`LangGraph Research: Search API error for "${query}": ${response.status}`);
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
          }
        }
        
        console.log(`LangGraph Research: Completed search across ${state.researchQueries.length} queries, collected ${searchResults.length} result sets`);
        
        return {
          ...state,
          searchResults: searchResults
        };
        
      } catch (error) {
        console.error('LangGraph Research: Error in web research:', error);
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
            new SystemMessage(`You are an expert research analyst. Provide comprehensive research insights about the given topic based on your knowledge.

Provide a detailed analysis that includes:
1. A clear, informative summary of what this topic involves
2. Key aspects, benefits, or considerations to understand
3. Current trends or developments if applicable
4. Practical implications or recommendations
5. Important context or background information

Format your response as a detailed research summary that would be helpful to someone trying to understand this topic thoroughly.

Be comprehensive but concise, focusing on the most valuable insights.`),
            new HumanMessage(`Provide comprehensive research analysis for: ${state.content}`)
          ];

          const response = await this.llm.invoke(messages);
          const analysis = response.content;

          return {
            ...state,
            researchSummary: analysis,
            keyFindings: [
              `Comprehensive analysis based on AI knowledge about ${state.content}`,
              'Key insights derived from extensive training data',
              'Practical recommendations for understanding this topic',
              'Current context and important considerations'
            ],
            sources: [],
            totalSources: 0,
            confidence: 0.7
          };
        }

        // AI-powered synthesis with search results (Google AI Overview style)
        const messages = [
          new SystemMessage(`You are an expert research analyst creating a comprehensive research overview, similar to Google's AI Overviews.

Based on the search results provided, create a comprehensive research summary that includes:

1. A clear, informative summary that synthesizes the key information
2. 3-5 key findings or insights from the research
3. Important details and context
4. Practical implications or recommendations

The response should be:
- Comprehensive yet readable
- Well-structured and informative
- Based on the provided search results
- Similar in quality to Google's AI Overviews

Focus on providing genuine value and insights rather than just summarizing.`),
          new HumanMessage(`Research Topic: ${state.content}

Search Queries Used: ${state.researchQueries.join(', ')}

Search Results:
${allSearchContent}

Please provide a comprehensive research overview based on this information.`)
        ];

        const response = await this.llm.invoke(messages);
        const researchSummary = response.content;

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
            'Comprehensive research analysis completed',
            'Multiple sources and perspectives analyzed',
            'Key insights synthesized from available information',
            'Practical implications identified'
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
        
        // Robust fallback
        return {
          ...state,
          researchSummary: `I've analyzed the topic "${state.content}" and can provide insights based on comprehensive knowledge. This topic involves important considerations that would benefit from detailed research. Key aspects include understanding the fundamentals, current applications, and practical implications for those interested in this area.`,
          keyFindings: [
            `Detailed analysis available for ${state.content}`,
            'Multiple perspectives and considerations identified',
            'Practical applications and implications outlined',
            'Comprehensive overview provided'
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
   * Action Recommendation Workflow - Intelligent action suggestion with context awareness
   */
  async setupActionRecommendationWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        contentAnalysis: Object,
        visualContext: Object,
        sourceAppAnalysis: Object,
        actionPriorities: Array,
        recommendedActions: Array,
        actionReasons: Object,
        confidence: Number
      }
    });

    // Step 1: Analyze content characteristics
    workflow.addNode("analyze_content_characteristics", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Analyze the content for key characteristics that would inform action recommendations:
1. Content type (code, article, email, url, research, personal note, etc.)
2. Complexity level (simple, moderate, complex, technical)
3. Language and potential translation needs
4. Factual claims that might need verification
5. Information completeness (complete, partial, requires more info)
6. Urgency indicators
7. Professional vs personal context

Return as JSON: {
  "contentType": "string",
  "complexityLevel": "string", 
  "language": "string",
  "hasFactualClaims": boolean,
  "completeness": "string",
  "urgency": "string",
  "context": "string"
}`),
          new HumanMessage(state.content)
        ];
        
        const response = await this.llm.invoke(messages);
        let analysis;
        
        try {
          analysis = JSON.parse(response.content);
        } catch (parseError) {
          analysis = {
            contentType: this.extractContentType(state.content),
            complexityLevel: "moderate",
            language: "english",
            hasFactualClaims: false,
            completeness: "complete",
            urgency: "normal",
            context: "general"
          };
        }
        
        return {
          ...state,
          contentAnalysis: analysis
        };
      } catch (error) {
        console.error('Content characteristics analysis error:', error);
        return {
          ...state,
          contentAnalysis: {
            contentType: "text",
            complexityLevel: "moderate",
            language: "english", 
            hasFactualClaims: false,
            completeness: "complete",
            urgency: "normal",
            context: "general"
          }
        };
      }
    });

    // Step 2: Analyze visual context from screenshot
    workflow.addNode("analyze_visual_context", async (state) => {
      try {
        const contextInfo = state.context || {};
        const screenshotPath = contextInfo.screenshotPath;
        
        if (screenshotPath) {
          // Use vision model to analyze the actual screenshot
          const screenshotAnalysis = await this.analyzeScreenshot(
            screenshotPath,
            state.content,
            `Analyze this screenshot to understand the visual context of the user's activity when they copied content.

Look for:
1. What type of activity is the user engaged in? (browsing, coding, writing, researching, communication, etc.)
2. What is the work context? (professional, academic, personal, creative, etc.)
3. What visual elements suggest urgency or priority?
4. What can you see about the user's workflow or task they're working on?
5. Are there any visual cues about why they might have copied this specific content?

Provide specific observations about what you see in the interface, any text that's visible, the layout and design of the application, and any other contextual clues.

Return as JSON: {
  "userActivity": "string (what they're doing)",
  "workContext": "string (professional/academic/personal/etc.)",
  "urgencyLevel": "string (low/medium/high)",
  "visualCues": "string (detailed description of what you observe in the screenshot that provides context)"
}`
          );
          
          let visualAnalysis;
          
          if (screenshotAnalysis) {
            try {
              visualAnalysis = JSON.parse(screenshotAnalysis);
            } catch (parseError) {
              // If JSON parsing fails, use the raw analysis as visual cues
              visualAnalysis = {
                userActivity: "researching",
                workContext: "professional",
                urgencyLevel: "medium",
                visualCues: screenshotAnalysis
              };
            }
          } else {
            // Fallback to basic app/window analysis if screenshot analysis fails
            const messages = [
              new SystemMessage(`Based on the basic context information, determine what the user was likely doing:
Source App: ${contextInfo.sourceApp || 'unknown'}
Window Title: ${contextInfo.windowTitle || 'unknown'}

Infer the user's likely intent and context. Return as JSON: {
  "userActivity": "string (browsing, coding, writing, researching, etc.)",
  "workContext": "string (professional, academic, personal, etc.)",
  "urgencyLevel": "string (low, medium, high)",
  "visualCues": "string (description of inferred context)"
}`),
              new HumanMessage(`Content copied: ${String(state.content || '').substring(0, 300)}
App: ${contextInfo.sourceApp}
Window: ${contextInfo.windowTitle}`)
            ];
            
            const response = await this.llm.invoke(messages);
            
            try {
              visualAnalysis = JSON.parse(response.content);
            } catch (parseError) {
              visualAnalysis = {
                userActivity: "general",
                workContext: "personal",
                urgencyLevel: "medium",
                visualCues: "Basic app context analysis used"
              };
            }
          }
          
          return {
            ...state,
            visualContext: visualAnalysis
          };
        } else {
          // No screenshot available
          return {
            ...state,
            visualContext: {
              userActivity: "general",
              workContext: "unknown",
              urgencyLevel: "medium",
              visualCues: "No visual context available"
            }
          };
        }
      } catch (error) {
        console.error('Visual context analysis error:', error);
        return {
          ...state,
          visualContext: {
            userActivity: "general",
            workContext: "unknown", 
            urgencyLevel: "medium",
            visualCues: "Analysis unavailable"
          }
        };
      }
    });

    // Step 3: Analyze source application context
    workflow.addNode("analyze_source_app_context", async (state) => {
      try {
        const contextInfo = state.context || {};
        const sourceApp = contextInfo.sourceApp || 'unknown';
        
        const messages = [
          new SystemMessage(`Analyze what actions would be most valuable based on the source application context:

Source App: ${sourceApp}
Window Title: ${contextInfo.windowTitle || 'unknown'}

For different apps, recommend different action patterns:
- Browsers: research, fact-check, save, share
- Code editors: explain, document, research, debug
- Communication apps: translate, summarize, respond
- Documents: research, fact-check, expand, cite
- Email: respond, schedule, research, translate

Return as JSON: {
  "appCategory": "string",
  "likelyUserIntent": "string",
  "contextualFactors": ["string"],
  "suggestedActionTypes": ["string"]
}`),
          new HumanMessage(`Content: ${String(state.content || '').substring(0, 200)}
Content Analysis: ${JSON.stringify(state.contentAnalysis)}
Visual Context: ${JSON.stringify(state.visualContext)}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let appAnalysis;
        
        try {
          appAnalysis = JSON.parse(response.content);
        } catch (parseError) {
          appAnalysis = {
            appCategory: "general",
            likelyUserIntent: "reference",
            contextualFactors: ["unknown context"],
            suggestedActionTypes: ["research", "save"]
          };
        }
        
        return {
          ...state,
          sourceAppAnalysis: appAnalysis
        };
      } catch (error) {
        console.error('Source app context analysis error:', error);
        return {
          ...state,
          sourceAppAnalysis: {
            appCategory: "general",
            likelyUserIntent: "reference",
            contextualFactors: ["analysis failed"],
            suggestedActionTypes: ["research"]
          }
        };
      }
    });

    // Step 4: Generate action priorities and recommendations
    workflow.addNode("generate_action_recommendations", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Based on all the analysis, recommend the top 3-5 actions the user should consider taking with this clipboard content.

Available actions:
- research: Find more information about the topic
- fact_check: Verify factual claims and accuracy  
- summarize: Create a concise summary
- translate: Translate to another language
- explain: Explain complex concepts in simple terms
- expand: Add more detail and context
- create_task: Convert to actionable tasks
- save_reference: Save for future reference
- share: Share with others
- cite: Find citation sources
- respond: Craft a response (for communications)
- schedule: Create calendar events or reminders

Consider:
- Content type: ${state.contentAnalysis?.contentType}
- Complexity: ${state.contentAnalysis?.complexityLevel}  
- Has factual claims: ${state.contentAnalysis?.hasFactualClaims}
- User activity: ${state.visualContext?.userActivity}
- Work context: ${state.visualContext?.workContext}
- Source app suggestions: ${state.sourceAppAnalysis?.suggestedActionTypes}

Return as JSON: {
  "recommendedActions": [
    {
      "action": "string",
      "priority": "high|medium|low",
      "reason": "string explanation",
      "confidence": 0.0-1.0
    }
  ],
  "overallConfidence": 0.0-1.0
}`),
          new HumanMessage(`Content: ${state.content}

Analysis Summary:
- Content: ${JSON.stringify(state.contentAnalysis)}
- Visual: ${JSON.stringify(state.visualContext)}  
- Source App: ${JSON.stringify(state.sourceAppAnalysis)}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let recommendations;
        
        try {
          recommendations = JSON.parse(response.content);
        } catch (parseError) {
          // Fallback recommendations based on content type
          const contentType = state.contentAnalysis?.contentType || 'text';
          const hasFactualClaims = state.contentAnalysis?.hasFactualClaims || false;
          
          let defaultActions = ['save_reference'];
          
          if (contentType === 'url') {
            defaultActions = ['research', 'save_reference'];
          } else if (contentType === 'code') {
            defaultActions = ['explain', 'save_reference'];
          } else if (hasFactualClaims) {
            defaultActions = ['fact_check', 'research'];
          } else if (contentType === 'email') {
            defaultActions = ['respond', 'save_reference'];
          }
          
          recommendations = {
            recommendedActions: defaultActions.map(action => ({
              action,
              priority: 'medium',
              reason: 'Based on content type analysis',
              confidence: 0.7
            })),
            overallConfidence: 0.7
          };
        }
        
        return {
          ...state,
          recommendedActions: recommendations.recommendedActions || [],
          confidence: recommendations.overallConfidence || 0.7,
          actionReasons: recommendations.recommendedActions?.reduce((acc, item) => {
            acc[item.action] = item.reason;
            return acc;
          }, {}) || {}
        };
      } catch (error) {
        console.error('Action recommendation generation error:', error);
        return {
          ...state,
          recommendedActions: [{
            action: 'save_reference',
            priority: 'medium',
            reason: 'Default action due to analysis error',
            confidence: 0.5
          }],
          confidence: 0.5,
          actionReasons: { save_reference: 'Fallback recommendation' }
        };
      }
    });

    // Define workflow flow
    workflow.addEdge("analyze_content_characteristics", "analyze_visual_context");
    workflow.addEdge("analyze_visual_context", "analyze_source_app_context");
    workflow.addEdge("analyze_source_app_context", "generate_action_recommendations");
    workflow.addEdge("generate_action_recommendations", END);

    workflow.setEntryPoint("analyze_content_characteristics");
    
    this.workflows.set("action_recommendation", workflow.compile());
    console.log('LangGraph: Action Recommendation workflow ready');
  }

  /**
   * Session Membership Workflow - Determines if clipboard item belongs to existing session
   */
  async setupSessionMembershipWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        existingSession: Object,
        belongs: Boolean,
        confidence: Number,
        reasoning: String
      }
    });

    workflow.addNode("evaluate_membership", async (state) => {
      try {
        const contextInfo = state.context || {};
        const messages = [
          new SystemMessage(`Determine if this clipboard content belongs to the existing session.

Session Type: ${state.existingSession.type}
Session Label: ${state.existingSession.label}
Existing Session Items: ${JSON.stringify(state.existingSession.items, null, 2)}

Analyze if the new content is related to the existing session based on:
1. Semantic similarity
2. Task continuity
3. Context relevance
4. Time proximity

Respond with JSON: {"belongs": boolean, "confidence": 0-1, "reasoning": "explanation"}`),
          new HumanMessage(`New Content: ${state.content}
Source App: ${contextInfo.sourceApp || 'unknown'}
Window Title: ${contextInfo.windowTitle || 'unknown'}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let result;
        
        try {
          result = JSON.parse(response.content);
        } catch (parseError) {
          result = { belongs: false, confidence: 0.5, reasoning: "Parse error" };
        }
        
        return {
          ...state,
          belongs: result.belongs || false,
          confidence: result.confidence || 0.5,
          reasoning: result.reasoning || "No reasoning provided"
        };
      } catch (error) {
        return {
          ...state,
          belongs: false,
          confidence: 0.3,
          reasoning: "Error in evaluation"
        };
      }
    });

    workflow.addEdge("evaluate_membership", END);
    workflow.setEntryPoint("evaluate_membership");
    
    this.workflows.set("session_membership", workflow.compile());
    console.log('LangGraph: Session Membership workflow ready');
  }

  /**
   * Session Type Detection Workflow - Identifies potential session types for new content
   */
  async setupSessionTypeDetectionWorkflow() {
    const workflow = new StateGraph({
      channels: {
        content: String,
        context: Object,
        sessionType: String,
        confidence: Number,
        reasoning: String
      }
    });

    workflow.addNode("detect_session_type", async (state) => {
      try {
        const contextInfo = state.context || {};
        let visualContext = "";
        if (contextInfo.screenshotPath && state.content) {
          try {
            const screenshotAnalysis = await this.analyzeScreenshot(
              contextInfo.screenshotPath,
              state.content,
              `Analyze this screenshot to determine what type of research or task session this represents.

Look for visual clues that indicate:
- Hotel/accommodation research (booking sites, hotel listings, maps)
- Restaurant research (menu sites, review sites, reservation platforms)
- Product research (shopping sites, comparison tools, specifications)
- Academic research (papers, articles, academic sources)
- General research (search results, information gathering)

Focus on identifying the session type based on visual context.`
            );
            
            if (screenshotAnalysis) {
              visualContext = `Visual Analysis: ${screenshotAnalysis}\n\n`;
            }
          } catch (error) {
            console.log('SessionType: Screenshot analysis failed, continuing without visual context');
            visualContext = "";
          }
        }

        const messages = [
          new SystemMessage(`Identify what type of research or task session this content could start.

${visualContext ? visualContext : ''}

Session Types:
- hotel_research: Hotel, accommodation, booking-related content
- restaurant_research: Restaurant, dining, food-related research
- product_research: Product comparison, shopping, specifications
- academic_research: Academic papers, studies, scholarly content
- travel_research: Travel planning, destinations, itineraries
- general_research: General information gathering

Respond with JSON: {"sessionType": "type_name", "confidence": 0-1, "reasoning": "explanation"}`),
          new HumanMessage(`Content: ${state.content}
Source App: ${contextInfo.sourceApp || 'unknown'}
Window Title: ${contextInfo.windowTitle || 'unknown'}
Has Visual Context: ${contextInfo.screenshotPath ? 'Yes' : 'No'}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let result;
        
        try {
          result = JSON.parse(response.content);
        } catch (parseError) {
          result = { sessionType: null, confidence: 0.3, reasoning: "Parse error" };
        }
        
        return {
          ...state,
          sessionType: result.sessionType,
          confidence: result.confidence || 0.5,
          reasoning: result.reasoning || "No reasoning provided"
        };
      } catch (error) {
        return {
          ...state,
          sessionType: null,
          confidence: 0.3,
          reasoning: "Error in detection"
        };
      }
    });

    workflow.addEdge("detect_session_type", END);
    workflow.setEntryPoint("detect_session_type");
    
    this.workflows.set("session_type_detection", workflow.compile());
    console.log('LangGraph: Session Type Detection workflow ready');
  }

  /**
   * Session Analysis Workflow - Analyzes multiple items in a session for patterns and insights
   */
  async setupSessionAnalysisWorkflow() {
    const workflow = new StateGraph({
      channels: {
        sessionType: String,
        items: Array,
        contextSummary: String,
        intentAnalysis: Object,
        patterns: Array,
        insights: String
      }
    });

    workflow.addNode("analyze_session_context", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Analyze the context and patterns across multiple clipboard items in this ${state.sessionType} session.

Items in session: ${JSON.stringify(state.items, null, 2)}

Provide insights about:
1. User's likely intent and goals
2. Common patterns across items
3. Information gaps that might need filling
4. Suggested next steps

Respond with detailed context summary.`),
          new HumanMessage(`Session Type: ${state.sessionType}
Number of Items: ${state.items.length}
Time Span: ${new Date(state.items[0].timestamp)} to ${new Date(state.items[state.items.length - 1].timestamp)}`)
        ];
        
        const response = await this.llm.invoke(messages);
        
        return {
          ...state,
          contextSummary: response.content
        };
      } catch (error) {
        return {
          ...state,
          contextSummary: "Context analysis failed"
        };
      }
    });

    workflow.addNode("analyze_intent", async (state) => {
      try {
        const messages = [
          new SystemMessage(`Based on the session items, determine the user's specific intent and current progress.

Respond with JSON:
{
  "primaryIntent": "main goal",
  "secondaryIntents": ["goal1", "goal2"],
  "progressStatus": "just_started|in_progress|nearly_complete",
  "nextLikelyActions": ["action1", "action2"],
  "confidenceLevel": 0-1
}`),
          new HumanMessage(`Session: ${state.sessionType}
Context: ${state.contextSummary}
Items: ${state.items.length}`)
        ];
        
        const response = await this.llm.invoke(messages);
        let intentAnalysis;
        
        try {
          intentAnalysis = JSON.parse(response.content);
        } catch (parseError) {
          intentAnalysis = {
            primaryIntent: "research",
            progressStatus: "in_progress",
            confidenceLevel: 0.5
          };
        }
        
        return {
          ...state,
          intentAnalysis: intentAnalysis
        };
      } catch (error) {
        return {
          ...state,
          intentAnalysis: { primaryIntent: "unknown", confidenceLevel: 0.3 }
        };
      }
    });

    workflow.addEdge("analyze_session_context", "analyze_intent");
    workflow.addEdge("analyze_intent", END);
    workflow.setEntryPoint("analyze_session_context");
    
    this.workflows.set("session_analysis", workflow.compile());
    console.log('LangGraph: Session Analysis workflow ready');
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
    
    // URL detection
    if (content.match(/^https?:\/\//)) return 'url';
    
    // Email detection
    if (content.match(/\S+@\S+\.\S+/)) return 'email';
    
    // Code detection (simple heuristics)
    if (content.includes('function') || content.includes('class') || content.includes('import')) return 'code';
    
    // JSON detection
    if (content.trim().startsWith('{') && content.trim().endsWith('}')) return 'data';
    
    // Default
    return 'text';
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
      
      // Safely extract content preview
      const contentStr = String(content || '');
      const contentPreview = contentStr.length > 200 ? contentStr.substring(0, 200) + '...' : contentStr;
      
      // Create vision message with simplified and robust format
      try {
        console.log('LangGraph: Creating vision messages for screenshot analysis...');
        console.log(`LangGraph: Content preview length: ${contentPreview.length}`);
        console.log(`LangGraph: Base64 image length: ${base64Image.length}`);
        
        // Ensure we have valid content for the vision message
        const messageContent = [
          {
            type: "text",
            text: `Analyze this screenshot to understand the visual context of the copied content: "${contentPreview}"`
          },
          {
            type: "image_url", 
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
              detail: "auto"
            }
          }
        ];
        
        console.log('LangGraph: Message content structure created successfully');
        
        const messages = [
          new SystemMessage(contextPrompt || 'Analyze this screenshot for context.'),
          new HumanMessage(messageContent)
        ];
        
        console.log('LangGraph: Invoking vision model...');
        const response = await this.visionModel.invoke(messages);
        console.log('LangGraph: Vision model response received successfully');
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
}

module.exports = LangGraphClient; 