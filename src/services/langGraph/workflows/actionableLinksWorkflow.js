/**
 * Actionable Links Generation Workflow
 * Converts text recommendations into clickable web links while preserving original text
 */

const { StateGraph, END } = require("@langchain/langgraph");
const { Logger, JSONParser, MessageBuilder } = require('../utils');

class ActionableLinksWorkflow {
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Setup the actionable links generation workflow
   */
  async setupActionableLinksGenerationWorkflow() {
    const workflow = new StateGraph({
      channels: {
        nextSteps: Array,           // Input: text recommendations
        sessionContext: Object,     // Session type, entities, location
        researchData: Object,       // Existing research findings
        actionableLinks: Array,     // Output: recommendations with links
        searchQueries: Array,       // Generated search queries
        searchResults: Array,       // Web search results
        linkConfidence: Number      // Overall link quality score
      }
    });

    // Step 1: Generate targeted search queries for each recommendation
    workflow.addNode("generate_link_queries", async (state) => {
      try {
        Logger.log('Generating search queries for actionable links', 'ActionableLinks');
        
        const sessionContext = state.sessionContext || {};
        const entities = sessionContext.entities || [];
        const location = sessionContext.location || '';
        const sessionType = sessionContext.sessionType || '';
        
        const searchQueries = [];
        
        for (const step of state.nextSteps) {
          const stepText = typeof step === 'string' ? step : step.text || step;
          
          const systemPrompt = `Generate a highly specific web search query to find direct actionable links for this recommendation.

CONTEXT:
- Session Type: ${sessionType}
- Entities: ${entities.join(', ') || 'none'}
- Location: ${location || 'none'}
- Recommendation: "${stepText}"

SEARCH STRATEGY:
1. Focus on official websites and direct booking/action platforms
2. Include specific entity names and locations when relevant
3. Use site-specific searches for known platforms (site:booking.com, site:opentable.com, etc.)
4. Prioritize actionable pages over informational content

Return JSON with ONE highly targeted search query:
{
  "searchQuery": "specific search query for direct action links",
  "linkType": "booking|official|review|search|reservation|purchase",
  "expectedSites": ["expected1.com", "expected2.com"],
  "reasoning": "why this query will find actionable links"
}`;

          const messages = MessageBuilder.createAnalysisMessages(systemPrompt, stepText, sessionContext);
          const response = await this.llm.invoke(messages);
          
          const queryData = JSONParser.parseWithFallback(response, () => ({
            searchQuery: this.generateFallbackQuery(stepText, entities, location, sessionType),
            linkType: this.determineLinkType(stepText, sessionType),
            expectedSites: this.getExpectedSites(sessionType),
            reasoning: `Fallback query for: ${stepText}`
          }));

          searchQueries.push({
            originalStep: stepText,
            ...queryData
          });
        }
        
        Logger.log(`Generated ${searchQueries.length} search queries for actionable links`);
        
        return {
          ...state,
          searchQueries: searchQueries
        };
        
      } catch (error) {
        Logger.error('Error generating link queries', 'ActionableLinks', error);
        
        // Fallback: create basic search queries
        const fallbackQueries = state.nextSteps.map(step => {
          const stepText = typeof step === 'string' ? step : step.text || step;
          return {
            originalStep: stepText,
            searchQuery: `${stepText} online`,
            linkType: 'search',
            expectedSites: ['google.com'],
            reasoning: 'Fallback search query'
          };
        });
        
        return {
          ...state,
          searchQueries: fallbackQueries
        };
      }
    });

    // Step 2: Perform web research to find actionable links
    workflow.addNode("search_actionable_links", async (state) => {
      try {
        Logger.log('Searching for actionable links via web research', 'ActionableLinks');
        
        const searchResults = [];
        
        for (const queryData of state.searchQueries) {
          try {
            // Use OpenAI's web search tool for real search results
            const openai = new (await import('openai')).OpenAI({
              apiKey: process.env.OPENAI_API_KEY
            });
            
            const response = await openai.responses.create({
              model: "gpt-4o",
              tools: [{ type: "web_search_preview" }],
              input: queryData.searchQuery
            });
            
            let responseText = '';
            let annotations = [];
            
            // Process the response output array
            if (response.output && Array.isArray(response.output)) {
              for (const outputItem of response.output) {
                if (outputItem.type === 'message' && outputItem.content) {
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
            
            // Extract actionable URLs from annotations
            const actionableUrls = annotations
              .filter(annotation => annotation.type === 'url_citation')
              .map(annotation => ({
                url: annotation.url,
                title: annotation.title || 'Action Link',
                snippet: responseText.substring(
                  Math.max(0, annotation.start_index - 100),
                  Math.min(responseText.length, annotation.end_index + 100)
                ).trim()
              }));
            
            searchResults.push({
              originalStep: queryData.originalStep,
              searchQuery: queryData.searchQuery,
              linkType: queryData.linkType,
              urls: actionableUrls,
              fullText: responseText
            });
            
            Logger.log(`Found ${actionableUrls.length} URLs for: ${queryData.originalStep}`);
            
            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (searchError) {
            Logger.error(`Search error for query "${queryData.searchQuery}"`, 'ActionableLinks', searchError);
            
            // Fallback: create search URL
            searchResults.push({
              originalStep: queryData.originalStep,
              searchQuery: queryData.searchQuery,
              linkType: 'search',
              urls: [{
                url: `https://www.google.com/search?q=${encodeURIComponent(queryData.searchQuery)}`,
                title: `Search: ${queryData.originalStep}`,
                snippet: `Search Google for: ${queryData.searchQuery}`
              }],
              fullText: ''
            });
          }
        }
        
        return {
          ...state,
          searchResults: searchResults
        };
        
      } catch (error) {
        Logger.error('Error in actionable links search', 'ActionableLinks', error);
        
        // Fallback: create Google search URLs for all steps
        const fallbackResults = state.searchQueries.map(queryData => ({
          originalStep: queryData.originalStep,
          searchQuery: queryData.searchQuery,
          linkType: 'search',
          urls: [{
            url: `https://www.google.com/search?q=${encodeURIComponent(queryData.searchQuery)}`,
            title: `Search: ${queryData.originalStep}`,
            snippet: `Search for: ${queryData.originalStep}`
          }],
          fullText: ''
        }));
        
        return {
          ...state,
          searchResults: fallbackResults
        };
      }
    });

    // Step 3: Create final actionable links with quality scoring
    workflow.addNode("create_actionable_links", async (state) => {
      try {
        Logger.log('Creating final actionable links with quality scoring', 'ActionableLinks');
        
        const actionableLinks = [];
        let totalConfidence = 0;
        
        for (const searchResult of state.searchResults) {
          const bestUrl = this.selectBestUrl(searchResult.urls, searchResult.linkType);
          
          if (bestUrl) {
            const confidence = this.calculateLinkConfidence(bestUrl, searchResult.linkType);
            
            actionableLinks.push({
              text: searchResult.originalStep,  // Keep original text unchanged
              link: bestUrl.url,
              linkType: searchResult.linkType,
              confidence: confidence,
              description: bestUrl.title,
              searchQuery: searchResult.searchQuery
            });
            
            totalConfidence += confidence;
          } else {
            // Fallback for steps without good URLs
            actionableLinks.push({
              text: searchResult.originalStep,
              link: `https://www.google.com/search?q=${encodeURIComponent(searchResult.originalStep)}`,
              linkType: 'search',
              confidence: 0.3,
              description: `Search for: ${searchResult.originalStep}`,
              searchQuery: searchResult.searchQuery
            });
            
            totalConfidence += 0.3;
          }
        }
        
        const avgConfidence = actionableLinks.length > 0 ? totalConfidence / actionableLinks.length : 0;
        
        Logger.log(`Created ${actionableLinks.length} actionable links with average confidence: ${avgConfidence.toFixed(2)}`);
        
        return {
          ...state,
          actionableLinks: actionableLinks,
          linkConfidence: avgConfidence
        };
        
      } catch (error) {
        Logger.error('Error creating actionable links', 'ActionableLinks', error);
        
        // Final fallback: convert all steps to Google searches
        const fallbackLinks = state.nextSteps.map(step => {
          const stepText = typeof step === 'string' ? step : step.text || step;
          return {
            text: stepText,
            link: `https://www.google.com/search?q=${encodeURIComponent(stepText)}`,
            linkType: 'search',
            confidence: 0.2,
            description: `Search for: ${stepText}`,
            searchQuery: stepText
          };
        });
        
        return {
          ...state,
          actionableLinks: fallbackLinks,
          linkConfidence: 0.2
        };
      }
    });

    // Define workflow flow
    workflow.addEdge("generate_link_queries", "search_actionable_links");
    workflow.addEdge("search_actionable_links", "create_actionable_links");
    workflow.addEdge("create_actionable_links", END);
    workflow.setEntryPoint("generate_link_queries");
    
    const compiledWorkflow = workflow.compile();
    Logger.log('Actionable Links Generation workflow ready');
    return compiledWorkflow;
  }

  /**
   * Generate fallback search query when AI fails
   */
  generateFallbackQuery(stepText, entities, location, sessionType) {
    const entity = entities.length > 0 ? entities[0] : '';
    
    if (sessionType === 'hotel_research' && stepText.toLowerCase().includes('reservation')) {
      return `${entity} ${location} hotel booking reservation official website`.trim();
    } else if (sessionType === 'hotel_research' && stepText.toLowerCase().includes('review')) {
      return `${entity} ${location} hotel reviews tripadvisor google`.trim();
    } else if (sessionType === 'restaurant_research' && stepText.toLowerCase().includes('reservation')) {
      return `${entity} ${location} restaurant reservation opentable book table`.trim();
    } else if (stepText.toLowerCase().includes('book') || stepText.toLowerCase().includes('purchase')) {
      return `${entity} buy online official website booking`.trim();
    }
    
    return `${stepText} ${entity} ${location}`.trim();
  }

  /**
   * Determine link type based on step text and session type
   */
  determineLinkType(stepText, sessionType) {
    const text = stepText.toLowerCase();
    
    if (text.includes('book') || text.includes('reservation') || text.includes('reserve')) {
      return sessionType === 'restaurant_research' ? 'reservation' : 'booking';
    } else if (text.includes('review') || text.includes('rating')) {
      return 'review';
    } else if (text.includes('buy') || text.includes('purchase')) {
      return 'purchase';
    } else if (text.includes('official') || text.includes('website')) {
      return 'official';
    }
    
    return 'search';
  }

  /**
   * Get expected sites for different session types
   */
  getExpectedSites(sessionType) {
    const siteMap = {
      'hotel_research': ['booking.com', 'expedia.com', 'hotels.com', 'tripadvisor.com'],
      'restaurant_research': ['opentable.com', 'resy.com', 'yelp.com', 'tripadvisor.com'],
      'product_research': ['amazon.com', 'bestbuy.com', 'target.com'],
      'travel_research': ['expedia.com', 'kayak.com', 'booking.com']
    };
    
    return siteMap[sessionType] || ['google.com'];
  }

  /**
   * Select the best URL from search results
   */
  selectBestUrl(urls, linkType) {
    if (!urls || urls.length === 0) return null;
    
    // Prioritize URLs based on link type
    const priorityPatterns = {
      'booking': ['booking.com', 'expedia.com', 'hotels.com', 'official'],
      'reservation': ['opentable.com', 'resy.com', 'official'],
      'review': ['tripadvisor.com', 'yelp.com', 'google.com/maps'],
      'purchase': ['amazon.com', 'bestbuy.com', 'official'],
      'official': ['official', '.com']
    };
    
    const patterns = priorityPatterns[linkType] || [];
    
    // Score URLs based on patterns
    const scoredUrls = urls.map(url => {
      let score = 0;
      const urlLower = url.url.toLowerCase();
      
      for (let i = 0; i < patterns.length; i++) {
        if (urlLower.includes(patterns[i].toLowerCase())) {
          score += (patterns.length - i) * 10;
          break;
        }
      }
      
      // Bonus for HTTPS
      if (urlLower.startsWith('https://')) score += 5;
      
      // Bonus for shorter, cleaner URLs
      if (url.url.length < 100) score += 3;
      
      return { ...url, score };
    });
    
    // Return highest scored URL
    scoredUrls.sort((a, b) => b.score - a.score);
    return scoredUrls[0];
  }

  /**
   * Calculate confidence score for a link
   */
  calculateLinkConfidence(url, linkType) {
    let confidence = 0.5; // Base confidence
    
    const urlLower = url.url.toLowerCase();
    
    // Boost confidence for known good sites
    if (urlLower.includes('booking.com') || urlLower.includes('opentable.com') || 
        urlLower.includes('amazon.com') || urlLower.includes('tripadvisor.com')) {
      confidence += 0.3;
    }
    
    // Boost for HTTPS
    if (urlLower.startsWith('https://')) confidence += 0.1;
    
    // Boost for URL matching link type
    if ((linkType === 'booking' && urlLower.includes('book')) ||
        (linkType === 'reservation' && urlLower.includes('reserv')) ||
        (linkType === 'review' && urlLower.includes('review'))) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }
}

module.exports = ActionableLinksWorkflow; 