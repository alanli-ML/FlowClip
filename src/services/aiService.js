const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const Database = require('../database/database');
const Store = require('electron-store');
const LangGraphClient = require('./langGraphClient');

class AIService {
  constructor(database) {
    this.openai = null;
    this.langGraphClient = null;
    this.database = database;
    this.store = new Store();
    this.useLangGraph = process.env.USE_LANGGRAPH !== 'false'; // Default to true for Phase 2
    this.initializeOpenAI();
    this.initializeLangGraph();
  }

  initializeOpenAI() {
    const apiKey = this.store.get('openaiApiKey');
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey: apiKey
      });
      // Set environment variable for LangGraph
      process.env.OPENAI_API_KEY = apiKey;
      // Initialize LangGraph asynchronously
      this.initializeLangGraph().catch(error => {
        console.error('Failed to initialize LangGraph during OpenAI setup:', error);
      });
    }
  }

  async initializeLangGraph() {
    const apiKey = this.store.get('openaiApiKey');
    if (apiKey && this.useLangGraph) {
      try {
        // Set environment variable for LangGraph
        process.env.OPENAI_API_KEY = apiKey;
        this.langGraphClient = new LangGraphClient();
        
        // Initialize the LangGraph client
        await this.langGraphClient.init();
        
        console.log('LangGraph client initialized successfully');
      } catch (error) {
        console.error('Failed to initialize LangGraph client:', error);
        this.langGraphClient = null;
      }
    }
  }

  setApiKey(apiKey) {
    this.store.set('openaiApiKey', apiKey);
    this.initializeOpenAI();
    // Initialize LangGraph asynchronously
    this.initializeLangGraph().then(() => {
      console.log(`AIService: Reinitialized with new API key. OpenAI: ${this.openai ? 'Ready' : 'Failed'}, LangGraph: ${this.langGraphClient ? 'Ready' : 'Failed'}`);
    }).catch(error => {
      console.error('Failed to initialize LangGraph during API key setup:', error);
      console.log(`AIService: Reinitialized with new API key. OpenAI: ${this.openai ? 'Ready' : 'Failed'}, LangGraph: Failed`);
    });
  }

  isConfigured() {
    const apiKey = this.store.get('openaiApiKey');
    if (!apiKey) {
      return false;
    }
    
    if (this.useLangGraph) {
      return this.langGraphClient !== null && this.openai !== null;
    }
    return this.openai !== null;
  }

  async analyzeClipboardItem(clipboardItem) {
    console.log('AI Service: Starting analysis for clipboard item:', clipboardItem.id);
    
    try {
      const workflowData = {
        content: clipboardItem.content,
        context: {
          sourceApp: clipboardItem.source_app,
          windowTitle: clipboardItem.window_title,
          surroundingText: clipboardItem.surrounding_text,
          timestamp: clipboardItem.timestamp,
          screenshotPath: clipboardItem.screenshot_path
        }
      };

      // Use unified comprehensive analysis instead of separate workflows
      const comprehensiveResult = await this.langGraphClient.executeWorkflow('comprehensive_content_analysis', workflowData);
      console.log('LangGraph: Comprehensive analysis completed', comprehensiveResult);

      // Transform result to match expected format
      const analysisResult = {
        type: comprehensiveResult.contentType,
        category: comprehensiveResult.purpose,
        sentiment: comprehensiveResult.sentiment,
        confidence: comprehensiveResult.confidence / 100,
        language: 'unknown', // LangGraph doesn't detect language yet
        insights: comprehensiveResult.contextInsights,
        tags: comprehensiveResult.tags || [],
        recommendedActions: comprehensiveResult.recommendedActions || [],
        actionConfidence: comprehensiveResult.actionConfidence || 0.7,
        actionReasons: comprehensiveResult.actionReasons || {},
        visualContext: comprehensiveResult.visualContext,
        hasVisualContext: comprehensiveResult.hasVisualContext,
        analysisMethod: 'comprehensive'
      };

      // Save unified analysis task
      const taskId = uuidv4();
        await this.database.saveAITask({
        id: taskId,
          clipboard_item_id: clipboardItem.id,
        task_type: 'comprehensive_analysis',
          status: 'completed',
        result: JSON.stringify(comprehensiveResult),
          error: null
        });

      // Update clipboard item with tags if available
      if (comprehensiveResult.tags && comprehensiveResult.tags.length > 0) {
        await this.database.addTags(clipboardItem.id, comprehensiveResult.tags);
      }

      return analysisResult;
    } catch (error) {
      console.error('LangGraph: Comprehensive analysis failed:', error);
      
      // Save failed task
      const failedTaskId = uuidv4();
      await this.database.saveAITask({
        id: failedTaskId,
        clipboard_item_id: clipboardItem.id,
        task_type: 'comprehensive_analysis',
        status: 'failed',
        result: null,
        error: error.message
      });
      
      throw error;
    }
  }

  async executeLangGraphTask(clipboardItem, taskType) {
    console.log(`LangGraph: Executing ${taskType} task...`);
    
    try {
      const workflowData = {
        content: clipboardItem.content,
        context: {
          sourceApp: clipboardItem.source_app,
          windowTitle: clipboardItem.window_title,
          surroundingText: clipboardItem.surrounding_text,
          timestamp: clipboardItem.timestamp
        }
      };

      let result;
      switch (taskType) {
        case 'summarize':
          result = await this.langGraphClient.executeWorkflow('summarization', workflowData);
          
          // Merge summarization results back into comprehensive analysis
          if (result && clipboardItem.id) {
            console.log('AIService: Merging summarization results into comprehensive analysis...');
            try {
              await this.database.mergeWorkflowResults(clipboardItem.id, 'summarize', result);
              console.log('AIService: Successfully merged summarization results into comprehensive analysis');
            } catch (mergeError) {
              console.error('AIService: Error merging summarization results:', mergeError);
            }
          }
          
          // Transform LangGraph result to match expected format
          result = {
            summary: result.finalSummary || result.summary,
            qualityScore: result.qualityScore,
            keyPoints: result.keyPoints,
            word_count: clipboardItem.content.split(' ').length,
            summary_ratio: result.finalSummary ? Math.round((result.finalSummary.split(' ').length / clipboardItem.content.split(' ').length) * 100) : 0
          };
          break;
          
        case 'research':
          console.log('AIService: Executing research workflow...');
          console.log('AIService: Clipboard item ID:', clipboardItem.id);
          
          // Ensure comprehensive analysis is available before research
          let existingAnalysis = null;
          try {
            console.log('AIService: Checking for existing comprehensive analysis...');
            const existingItem = await this.database.getClipboardItem(clipboardItem.id);
            console.log('AIService: Retrieved item from database:', !!existingItem);
            
            if (existingItem && existingItem.analysis_data) {
              console.log('AIService: Found existing analysis_data');
              console.log('AIService: Analysis data length:', existingItem.analysis_data.length);
              existingAnalysis = JSON.parse(existingItem.analysis_data);
              console.log('AIService: Parsed existing analysis successfully');
              console.log('AIService: Analysis content type:', existingAnalysis.contentType);
              console.log('AIService: Analysis has visual context:', existingAnalysis.hasVisualContext);
            } else {
              console.log('AIService: No existing analysis_data found');
            }
          } catch (error) {
            console.log('AIService: Error loading existing analysis:', error.message);
          }
          
          // Enhance workflow data with existing analysis
          const enhancedWorkflowData = {
            ...workflowData,
            existingAnalysis: existingAnalysis
          };
          
          console.log('AIService: Enhanced workflow data keys:', Object.keys(enhancedWorkflowData));
          console.log('AIService: Passing existingAnalysis to LangGraph:', !!enhancedWorkflowData.existingAnalysis);
          
          result = await this.langGraphClient.executeWorkflow('research', enhancedWorkflowData);
          
          // Merge research results back into comprehensive analysis
          if (result && clipboardItem.id) {
            console.log('AIService: Merging research results into comprehensive analysis...');
            try {
              await this.database.mergeWorkflowResults(clipboardItem.id, 'research', result);
              console.log('AIService: Successfully merged research results into comprehensive analysis');
            } catch (mergeError) {
              console.error('AIService: Error merging research results:', mergeError);
            }
          }
          
          // Transform new LangGraph result structure to match expected UI format
          if (result.researchSummary) {
            result = {
              research_summary: result.researchSummary,
              key_findings: result.keyFindings || [],
              sources: result.sources || [],
              total_sources: result.totalSources || 0,
              confidence: result.confidence || 0.7,
              research_quality: result.sources?.length > 3 ? 'comprehensive' : 'basic',
              research_categories: ['langgraph', 'ai-assisted', 'real-search'],
              suggested_keywords: result.researchQueries || [],
              search_queries_used: result.researchQueries || [],
              last_updated: new Date().toISOString()
            };
          } else {
            // Fallback for old structure (backward compatibility)
            result = {
              research_suggestions: result.researchQuestions ? result.researchQuestions.join('\n') : 'Research analysis completed',
              suggested_keywords: result.keyTerms || [],
              search_queries: result.searchQueries || [],
              research_categories: ['langgraph', 'ai-assisted', 'contextual'],
              readyForExternalResearch: result.readyForExternalResearch
            };
          }
          break;
          
        default:
          throw new Error(`LangGraph task type ${taskType} not implemented`);
      }

      console.log(`LangGraph: ${taskType} task completed successfully`);
      return result;
    } catch (error) {
      console.error(`LangGraph: ${taskType} task failed:`, error);
      throw error;
    }
  }

  async generateTags(clipboardItem) {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      clipboard_item_id: clipboardItem.id,
      task_type: 'generate_tags',
      status: 'pending',
      result: null,
      error: null
    };

    try {
      await this.database.saveAITask(task);

      const prompt = `
        Analyze the following content and generate 3-5 relevant tags that describe the content, its purpose, or context.
        Return only the tags as a JSON array of strings, nothing else.

        Content: "${clipboardItem.content.substring(0, 1000)}"
        Source App: ${clipboardItem.source_app || 'Unknown'}
        Window Title: ${clipboardItem.window_title || 'Unknown'}
        
        Examples of good tags: ["email", "work", "project-alpha"], ["code", "javascript", "debugging"], ["article", "ai", "technology"]
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates relevant tags for clipboard content. Always respond with a valid JSON array of strings.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      });

      const tagsResult = response.choices[0].message.content.trim();
      const tags = JSON.parse(tagsResult);

      // Update task with result
      await this.database.updateAITask(taskId, {
        status: 'completed',
        result: JSON.stringify(tags)
      });

      // Add tags to clipboard item
      await this.database.addTags(clipboardItem.id, tags);

      return tags;
    } catch (error) {
      console.error('Error generating tags:', error);
      await this.database.updateAITask(taskId, {
        status: 'failed',
        error: error.message
      });
      return [];
    }
  }

  async detectContentType(clipboardItem) {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      clipboard_item_id: clipboardItem.id,
      task_type: 'detect_content_type',
      status: 'pending',
      result: null,
      error: null
    };

    try {
      await this.database.saveAITask(task);

      const prompt = `
        Analyze the following content and determine its type and characteristics.
        Return a JSON object with: type, category, language, sentiment, and confidence.

        Content: "${clipboardItem.content.substring(0, 500)}"
        Source App: ${clipboardItem.source_app || 'Unknown'}
        
        Possible types: email, code, article, url, phone, address, task, note, quote, data, other
        Possible categories: work, personal, research, entertainment, shopping, communication, development
        Sentiment: positive, negative, neutral
        Confidence: 0.0 to 1.0
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a content analyzer. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.2
      });

      const analysisResult = JSON.parse(response.choices[0].message.content.trim());

      await this.database.updateAITask(taskId, {
        status: 'completed',
        result: JSON.stringify(analysisResult)
      });

      return analysisResult;
    } catch (error) {
      console.error('Error detecting content type:', error);
      await this.database.updateAITask(taskId, {
        status: 'failed',
        error: error.message
      });
      return null;
    }
  }

  async suggestActions(clipboardItem) {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      clipboard_item_id: clipboardItem.id,
      task_type: 'suggest_actions',
      status: 'pending',
      result: null,
      error: null
    };

    try {
      await this.database.saveAITask(task);

      const prompt = `
        Based on the following clipboard content, suggest 3-5 actionable next steps the user might want to take.
        Return a JSON array of objects with: action, description, priority (1-5), and category.

        Content: "${clipboardItem.content.substring(0, 800)}"
        Source App: ${clipboardItem.source_app || 'Unknown'}
        Window Title: ${clipboardItem.window_title || 'Unknown'}
        
        Action categories: research, organize, communicate, create, analyze, remember
        Example: {"action": "Research topic", "description": "Look up more information about this topic", "priority": 3, "category": "research"}
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a productivity assistant. Suggest helpful actions based on clipboard content. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.4
      });

      const suggestions = JSON.parse(response.choices[0].message.content.trim());

      await this.database.updateAITask(taskId, {
        status: 'completed',
        result: JSON.stringify(suggestions)
      });

      return suggestions;
    } catch (error) {
      console.error('Error suggesting actions:', error);
      await this.database.updateAITask(taskId, {
        status: 'failed',
        error: error.message
      });
      return [];
    }
  }

  async triggerTask(clipboardItemId, taskType) {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    const taskId = uuidv4();
    const task = {
      id: taskId,
      clipboard_item_id: clipboardItemId,
      task_type: taskType,
      status: 'pending',
      result: null,
      error: null
    };

    try {
      // Get clipboard item
      const clipboardItem = await this.database.getClipboardItem(clipboardItemId);
      if (!clipboardItem) {
        throw new Error('Clipboard item not found');
      }

      // Save task
      await this.database.saveAITask(task);

      let result;
      
      // Use LangGraph for supported workflows
      if (this.useLangGraph && this.langGraphClient && ['summarize', 'research'].includes(taskType)) {
        result = await this.executeLangGraphTask(clipboardItem, taskType);
      } else {
        // Legacy OpenAI execution
        switch (taskType) {
          case 'summarize':
            result = await this.summarizeContent(clipboardItem);
            break;
          case 'research':
            result = await this.researchContent(clipboardItem);
            break;
          case 'fact_check':
            result = await this.factCheckContent(clipboardItem);
            break;
          case 'create_task':
            result = await this.createTaskFromContent(clipboardItem);
            break;
          case 'translate':
            result = await this.translateContent(clipboardItem);
            break;
          case 'explain':
            result = await this.explainContent(clipboardItem);
            break;
          default:
            throw new Error(`Unknown task type: ${taskType}`);
        }
      }

      // Update task with result
      await this.database.updateAITask(taskId, {
        status: 'completed',
        result: JSON.stringify(result)
      });

      return { taskId, result };
    } catch (error) {
      console.error(`Error executing ${taskType} task:`, error);
      await this.database.updateAITask(taskId, {
        status: 'failed',
        error: error.message
      });
      throw error;
    }
  }

  async summarizeContent(clipboardItem) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates concise, accurate summaries of content.'
        },
        {
          role: 'user',
          content: `Please provide a concise summary of the following content:\n\n${clipboardItem.content}`
        }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    return {
      summary: response.choices[0].message.content.trim(),
      word_count: clipboardItem.content.split(' ').length,
      summary_ratio: Math.round((response.choices[0].message.content.trim().split(' ').length / clipboardItem.content.split(' ').length) * 100)
    };
  }

  async researchContent(clipboardItem) {
    console.log('Starting comprehensive research for content...');
    
    try {
      // Step 1: Generate smart search queries using AI
      const queriesResponse = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Generate 3-5 specific, targeted search queries that would help find comprehensive information about the given content. Return only a JSON array of search query strings.'
          },
          {
            role: 'user',
            content: `Generate effective search queries for: ${clipboardItem.content.substring(0, 500)}`
          }
        ],
        max_tokens: 200,
        temperature: 0.4
      });

      let searchQueries;
      try {
        searchQueries = JSON.parse(queriesResponse.choices[0].message.content.trim());
      } catch {
        // Fallback if JSON parsing fails
        searchQueries = [clipboardItem.content.substring(0, 100)];
      }

      console.log('Generated search queries:', searchQueries);

      // Step 2: Perform web searches
      const searchResults = [];
      for (const query of searchQueries.slice(0, 3)) { // Limit to 3 queries to avoid rate limits
        try {
          const results = await this.performWebSearch(query);
          searchResults.push(...results);
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Search failed for query "${query}":`, error);
        }
      }

      console.log(`Found ${searchResults.length} search results`);

      // Step 3: Synthesize findings using AI
      const synthesisPrompt = `
        Based on the original content and the search results below, provide a comprehensive research summary with:
        1. Key findings and answers to relevant questions
        2. Important facts and insights discovered
        3. Relevant statistics or data points
        4. Actionable next steps or recommendations
        5. Areas that need further investigation

        Original Content: "${clipboardItem.content.substring(0, 500)}"
        
        Search Results:
        ${searchResults.slice(0, 10).map((result, i) => 
          `${i + 1}. ${result.title}\n   ${result.snippet}\n   Source: ${result.link}`
        ).join('\n\n')}
        
        Provide a well-structured research summary with specific findings, not just questions.
      `;

      const synthesisResponse = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a research analyst. Synthesize web search results into comprehensive, actionable insights. Focus on providing concrete answers and findings, not just questions.'
          },
          {
            role: 'user',
            content: synthesisPrompt
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      });

      const researchSynthesis = synthesisResponse.choices[0].message.content.trim();

      // Step 4: Generate additional insights
      const keywords = this.extractKeywords(clipboardItem.content);
      const sources = searchResults.slice(0, 8).map(result => ({
        title: result.title,
        url: result.link,
        snippet: result.snippet.substring(0, 150) + '...'
      }));

      return {
        research_summary: researchSynthesis,
        key_findings: await this.extractKeyFindings(researchSynthesis),
        search_queries_used: searchQueries,
        sources: sources,
        total_sources: searchResults.length,
        suggested_keywords: keywords,
        research_categories: ['web_research', 'ai_synthesis', 'factual'],
        research_quality: searchResults.length > 5 ? 'comprehensive' : 'basic',
        last_updated: new Date().toISOString()
      };

    } catch (error) {
      console.error('Research failed:', error);
      
      // Fallback to basic research suggestions if web search fails
      const basicResponse = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Provide research insights and analysis based on the content, even without web search.'
          },
          {
            role: 'user',
            content: `Analyze and provide insights about: ${clipboardItem.content.substring(0, 800)}`
          }
        ],
        max_tokens: 400,
        temperature: 0.5
      });

      return {
        research_summary: basicResponse.choices[0].message.content.trim(),
        key_findings: ['Unable to perform web search - providing AI analysis only'],
        search_queries_used: [],
        sources: [],
        total_sources: 0,
        suggested_keywords: this.extractKeywords(clipboardItem.content),
        research_categories: ['ai_analysis', 'offline'],
        research_quality: 'limited',
        error: 'Web search unavailable - AI analysis only',
        last_updated: new Date().toISOString()
      };
    }
  }

  async performWebSearch(query) {
    const axios = require('axios');
    
    try {
      // Use DuckDuckGo Instant Answer API (no API key required)
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      
      const response = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'FlowClip Research Assistant'
        }
      });

      const results = [];
      
      // Process instant answer if available
      if (response.data.Abstract) {
        results.push({
          title: response.data.Heading || 'Instant Answer',
          snippet: response.data.Abstract,
          link: response.data.AbstractURL || 'https://duckduckgo.com'
        });
      }

      // Process related topics
      if (response.data.RelatedTopics) {
        response.data.RelatedTopics.slice(0, 5).forEach(topic => {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || 'Related Topic',
              snippet: topic.Text,
              link: topic.FirstURL
            });
          }
        });
      }

      // If no results from DuckDuckGo, try alternative approach
      if (results.length === 0) {
        // Use a simple search result generator based on the query
        results.push({
          title: `Search Results for: ${query}`,
          snippet: `Research query about ${query}. Consider checking academic sources, news articles, and official websites for comprehensive information.`,
          link: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
        });
      }

      return results;
    } catch (error) {
      console.error('Web search error:', error);
      return [{
        title: `Search: ${query}`,
        snippet: 'Unable to fetch live search results. Consider manually searching for this topic on your preferred search engine.',
        link: `https://www.google.com/search?q=${encodeURIComponent(query)}`
      }];
    }
  }

  async extractKeyFindings(researchText) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Extract 3-5 key findings from the research summary. Return a JSON array of concise finding statements.'
          },
          {
            role: 'user',
            content: researchText
          }
        ],
        max_tokens: 200,
        temperature: 0.2
      });

      return JSON.parse(response.choices[0].message.content.trim());
    } catch (error) {
      // Fallback to simple extraction
      const sentences = researchText.split('.').filter(s => s.trim().length > 20);
      return sentences.slice(0, 3).map(s => s.trim() + '.');
    }
  }

  async factCheckContent(clipboardItem) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a fact-checking assistant. Identify claims that can be verified and suggest how to verify them.'
        },
        {
          role: 'user',
          content: `Identify factual claims in this content and suggest how to verify them:\n\n${clipboardItem.content.substring(0, 1000)}`
        }
      ],
      max_tokens: 400,
      temperature: 0.2
    });

    return {
      fact_check_analysis: response.choices[0].message.content.trim(),
      verification_needed: true,
      confidence_level: 'medium'
    };
  }

  async createTaskFromContent(clipboardItem) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a task management assistant. Create actionable tasks based on content. Return JSON with title, description, priority, and estimated_time.'
        },
        {
          role: 'user',
          content: `Create actionable tasks based on this content:\n\n${clipboardItem.content.substring(0, 800)}`
        }
      ],
      max_tokens: 300,
      temperature: 0.4
    });

    return JSON.parse(response.choices[0].message.content.trim());
  }

  async translateContent(clipboardItem, targetLanguage = 'English') {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a translator. Translate the given content to ${targetLanguage}.`
        },
        {
          role: 'user',
          content: clipboardItem.content
        }
      ],
      max_tokens: clipboardItem.content.length * 2,
      temperature: 0.2
    });

    return {
      translated_text: response.choices[0].message.content.trim(),
      target_language: targetLanguage,
      original_length: clipboardItem.content.length,
      translated_length: response.choices[0].message.content.trim().length
    };
  }

  async explainContent(clipboardItem) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert explainer. Break down complex content into simple, understandable explanations.'
        },
        {
          role: 'user',
          content: `Please explain this content in simple terms:\n\n${clipboardItem.content.substring(0, 1000)}`
        }
      ],
      max_tokens: 500,
      temperature: 0.4
    });

    return {
      explanation: response.choices[0].message.content.trim(),
      complexity_level: 'beginner',
      key_concepts: this.extractKeywords(clipboardItem.content)
    };
  }

  extractKeywords(text) {
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'said', 'each', 'which', 'their', 'time', 'would', 'about', 'could', 'other', 'after', 'first', 'well', 'never', 'these', 'than', 'where', 'being', 'every', 'through', 'during', 'before', 'again', 'same', 'while'].includes(word));

    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Set progress callback for LangGraph workflows
   */
  setLangGraphProgressCallback(callback) {
    if (this.langGraphClient) {
      this.langGraphClient.setProgressCallback(callback);
    }
  }

  /**
   * Clear progress callback for LangGraph workflows  
   */
  clearLangGraphProgressCallback() {
    if (this.langGraphClient) {
      this.langGraphClient.clearProgressCallback();
    }
  }
}

module.exports = AIService; 