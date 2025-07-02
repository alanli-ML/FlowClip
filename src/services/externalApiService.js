const EventEmitter = require('events');
const https = require('https');
const http = require('http');

class ExternalApiService extends EventEmitter {
  constructor() {
    super();
    this.n8nEndpoint = process.env.N8N_WEBHOOK_ENDPOINT || 'http://localhost:5678/webhook';
    this.apiKey = process.env.N8N_API_KEY;
    this.rateLimiter = new Map(); // Simple rate limiting
    this.activeWorkflows = new Map();
    this.webhookTimeouts = new Map();
    
    // Workflow configuration for different session types
    this.workflowConfig = {
      hotel_research: {
        webhookPath: '/flowclip-hotel-research',
        triggerThreshold: 2, // items needed to trigger
        maxRetries: 3,
        timeout: 30000, // 30 seconds
        enabled: true
      },
      restaurant_research: {
        webhookPath: '/flowclip-restaurant-research',
        triggerThreshold: 2,
        maxRetries: 3,
        timeout: 25000,
        enabled: true
      },
      product_research: {
        webhookPath: '/flowclip-product-research',
        triggerThreshold: 3,
        maxRetries: 3,
        timeout: 35000,
        enabled: true
      },
      general_research: {
        webhookPath: '/flowclip-general-research',
        triggerThreshold: 3,
        maxRetries: 2,
        timeout: 20000,
        enabled: true
      },
      travel_research: {
        webhookPath: '/flowclip-travel-research',
        triggerThreshold: 2,
        maxRetries: 3,
        timeout: 40000,
        enabled: true
      },
      academic_research: {
        webhookPath: '/flowclip-academic-research',
        triggerThreshold: 4,
        maxRetries: 2,
        timeout: 45000,
        enabled: true
      }
    };
  }

  async processSessionUpdate(sessionData) {
    try {
      console.log(`ExternalApiService: Processing session update for ${sessionData.sessionType}`);
      
      // Check if workflow is configured and enabled
      const config = this.workflowConfig[sessionData.sessionType];
      if (!config || !config.enabled) {
        console.log(`  No workflow configured for session type: ${sessionData.sessionType}`);
        return null;
      }

      // Check if session meets trigger threshold
      if (sessionData.itemCount < config.triggerThreshold) {
        console.log(`  Session item count (${sessionData.itemCount}) below threshold (${config.triggerThreshold})`);
        return null;
      }

      // Rate limiting check
      if (this.isRateLimited(sessionData.sessionId)) {
        console.log(`  Rate limited for session: ${sessionData.sessionId}`);
        return null;
      }

      // Prepare webhook data based on session type
      const webhookData = await this.prepareWebhookData(sessionData);
      
      // Trigger N8N workflow
      const result = await this.triggerN8NWorkflow(sessionData.sessionType, webhookData);
      
      // Update rate limiting
      this.updateRateLimit(sessionData.sessionId);
      
      this.emit('workflow-triggered', {
        sessionId: sessionData.sessionId,
        sessionType: sessionData.sessionType,
        workflowId: result.workflowId,
        status: 'initiated'
      });

      return result;
      
    } catch (error) {
      console.error('ExternalApiService: Error processing session update:', error);
      this.emit('workflow-error', {
        sessionId: sessionData.sessionId,
        sessionType: sessionData.sessionType,
        error: error.message
      });
      return null;
    }
  }

  async prepareWebhookData(sessionData) {
    const baseData = {
      sessionId: sessionData.sessionId,
      sessionType: sessionData.sessionType,
      sessionLabel: sessionData.sessionLabel,
      itemCount: sessionData.itemCount,
      timestamp: new Date().toISOString(),
      triggerReason: 'session_threshold_reached'
    };

    // Add session-specific data based on type
    switch (sessionData.sessionType) {
      case 'hotel_research':
        return {
          ...baseData,
          hotelData: await this.extractHotelData(sessionData),
          searchParams: this.generateHotelSearchParams(sessionData),
          automationTasks: [
            'price_comparison',
            'availability_check',
            'reviews_aggregation',
            'amenities_comparison'
          ]
        };

      case 'restaurant_research':
        return {
          ...baseData,
          restaurantData: await this.extractRestaurantData(sessionData),
          searchParams: this.generateRestaurantSearchParams(sessionData),
          automationTasks: [
            'menu_analysis',
            'reviews_aggregation',
            'reservation_availability',
            'price_comparison'
          ]
        };

      case 'product_research':
        return {
          ...baseData,
          productData: await this.extractProductData(sessionData),
          searchParams: this.generateProductSearchParams(sessionData),
          automationTasks: [
            'price_tracking',
            'feature_comparison',
            'reviews_analysis',
            'availability_check'
          ]
        };

      case 'travel_research':
        return {
          ...baseData,
          travelData: await this.extractTravelData(sessionData),
          searchParams: this.generateTravelSearchParams(sessionData),
          automationTasks: [
            'flight_search',
            'accommodation_search',
            'activity_recommendations',
            'weather_forecast'
          ]
        };

      case 'academic_research':
        return {
          ...baseData,
          academicData: await this.extractAcademicData(sessionData),
          searchParams: this.generateAcademicSearchParams(sessionData),
          automationTasks: [
            'paper_search',
            'citation_analysis',
            'related_work_discovery',
            'author_identification'
          ]
        };

      default: // general_research
        return {
          ...baseData,
          generalData: await this.extractGeneralData(sessionData),
          searchParams: this.generateGeneralSearchParams(sessionData),
          automationTasks: [
            'web_search',
            'fact_checking',
            'related_content_discovery',
            'source_verification'
          ]
        };
    }
  }

  async triggerN8NWorkflow(sessionType, webhookData) {
    const config = this.workflowConfig[sessionType];
    const webhookUrl = `${this.n8nEndpoint}${config.webhookPath}`;
    const workflowId = this.generateWorkflowId();

    console.log(`  Triggering N8N workflow: ${webhookUrl}`);

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(webhookData);
      const url = new URL(webhookUrl);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-FlowClip-Session-Type': sessionType,
          'X-FlowClip-Workflow-Id': workflowId
        },
        timeout: config.timeout
      };

      if (this.apiKey) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log(`  N8N workflow response:`, response);
            
            resolve({
              workflowId,
              status: 'initiated',
              response,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            console.error('  Failed to parse N8N response:', error);
            resolve({
              workflowId,
              status: 'initiated',
              response: { rawData: data },
              timestamp: new Date().toISOString()
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error(`  N8N webhook error:`, error);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Webhook timeout after ${config.timeout}ms`));
      });

      req.write(postData);
      req.end();
    });
  }

  // Data extraction methods for different session types
  async extractHotelData(sessionData) {
    return {
      hotelNames: this.extractEntityNames(sessionData.items, ['hotel', 'resort', 'inn']),
      locations: this.extractLocations(sessionData.items),
      checkInDates: this.extractDates(sessionData.items),
      priceRanges: this.extractPrices(sessionData.items),
      amenities: this.extractAmenities(sessionData.items)
    };
  }

  async extractRestaurantData(sessionData) {
    return {
      restaurantNames: this.extractEntityNames(sessionData.items, ['restaurant', 'cafe', 'bistro']),
      cuisineTypes: this.extractCuisines(sessionData.items),
      locations: this.extractLocations(sessionData.items),
      priceRanges: this.extractPrices(sessionData.items),
      diningTimes: this.extractTimes(sessionData.items)
    };
  }

  async extractProductData(sessionData) {
    return {
      productNames: this.extractProductNames(sessionData.items),
      categories: this.extractCategories(sessionData.items),
      specifications: this.extractSpecifications(sessionData.items),
      priceRanges: this.extractPrices(sessionData.items),
      brands: this.extractBrands(sessionData.items)
    };
  }

  async extractTravelData(sessionData) {
    return {
      destinations: this.extractLocations(sessionData.items),
      travelDates: this.extractDates(sessionData.items),
      accommodationTypes: this.extractAccommodationTypes(sessionData.items),
      activities: this.extractActivities(sessionData.items),
      budgetRanges: this.extractPrices(sessionData.items)
    };
  }

  async extractAcademicData(sessionData) {
    return {
      researchTopics: this.extractResearchTopics(sessionData.items),
      authors: this.extractAuthors(sessionData.items),
      publications: this.extractPublications(sessionData.items),
      keywords: this.extractKeywords(sessionData.items),
      yearRanges: this.extractYears(sessionData.items)
    };
  }

  async extractGeneralData(sessionData) {
    return {
      topics: this.extractTopics(sessionData.items),
      entities: this.extractGeneralEntities(sessionData.items),
      keywords: this.extractKeywords(sessionData.items),
      sources: this.extractSources(sessionData.items),
      questions: this.extractQuestions(sessionData.items)
    };
  }

  // Utility extraction methods
  extractEntityNames(items, entityTypes) {
    const names = [];
    items.forEach(item => {
      const content = item.content.toLowerCase();
      // Simple entity extraction - could be enhanced with NLP
      const words = content.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        if (entityTypes.some(type => words[i].includes(type))) {
          // Extract potential entity name around the type keyword
          const context = words.slice(Math.max(0, i-2), i+3).join(' ');
          if (context.length > 10) {
            names.push(context);
          }
        }
      }
    });
    return [...new Set(names)]; // Remove duplicates
  }

  extractLocations(items) {
    const locations = [];
    items.forEach(item => {
      // Simple location extraction - look for capitalized words that might be places
      const matches = item.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
      if (matches) {
        locations.push(...matches.filter(match => match.length > 3));
      }
    });
    return [...new Set(locations)];
  }

  extractDates(items) {
    const dates = [];
    items.forEach(item => {
      const dateMatches = item.content.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi);
      if (dateMatches) {
        dates.push(...dateMatches);
      }
    });
    return [...new Set(dates)];
  }

  extractPrices(items) {
    const prices = [];
    items.forEach(item => {
      const priceMatches = item.content.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?|\b\d+\s*(?:dollars?|USD|CAD|EUR)\b/gi);
      if (priceMatches) {
        prices.push(...priceMatches);
      }
    });
    return [...new Set(prices)];
  }

  extractTopics(items) {
    const topics = [];
    items.forEach(item => {
      // Extract potential topics from content
      const sentences = item.content.split(/[.!?]+/);
      sentences.forEach(sentence => {
        if (sentence.length > 20 && sentence.length < 100) {
          topics.push(sentence.trim());
        }
      });
    });
    return topics.slice(0, 10); // Limit to top 10 topics
  }

  extractKeywords(items) {
    const keywords = [];
    items.forEach(item => {
      // Simple keyword extraction
      const words = item.content.toLowerCase().match(/\b[a-z]{4,}\b/g);
      if (words) {
        keywords.push(...words);
      }
    });
    
    // Return most frequent keywords
    const frequency = {};
    keywords.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);
  }

  // Search parameter generation
  generateHotelSearchParams(sessionData) {
    return {
      query: `hotels ${sessionData.sessionLabel}`,
      filters: {
        type: 'accommodation',
        category: 'hotel',
        location: this.extractPrimaryLocation(sessionData.items)
      }
    };
  }

  generateRestaurantSearchParams(sessionData) {
    return {
      query: `restaurants ${sessionData.sessionLabel}`,
      filters: {
        type: 'restaurant',
        category: 'dining',
        location: this.extractPrimaryLocation(sessionData.items)
      }
    };
  }

  generateProductSearchParams(sessionData) {
    return {
      query: `product research ${sessionData.sessionLabel}`,
      filters: {
        type: 'product',
        category: 'shopping'
      }
    };
  }

  generateTravelSearchParams(sessionData) {
    return {
      query: `travel ${sessionData.sessionLabel}`,
      filters: {
        type: 'travel',
        category: 'tourism'
      }
    };
  }

  generateAcademicSearchParams(sessionData) {
    return {
      query: `academic research ${sessionData.sessionLabel}`,
      filters: {
        type: 'academic',
        category: 'research'
      }
    };
  }

  generateGeneralSearchParams(sessionData) {
    return {
      query: sessionData.sessionLabel,
      filters: {
        type: 'general',
        category: 'research'
      }
    };
  }

  extractPrimaryLocation(items) {
    const locations = this.extractLocations(items);
    return locations.length > 0 ? locations[0] : null;
  }

  // Additional extraction methods for specific data types
  extractAmenities(items) {
    const amenities = [];
    const amenityKeywords = ['wifi', 'pool', 'gym', 'spa', 'parking', 'restaurant', 'bar', 'breakfast', 'room service'];
    items.forEach(item => {
      const content = item.content.toLowerCase();
      amenityKeywords.forEach(amenity => {
        if (content.includes(amenity)) {
          amenities.push(amenity);
        }
      });
    });
    return [...new Set(amenities)];
  }

  extractCuisines(items) {
    const cuisines = [];
    const cuisineKeywords = ['italian', 'chinese', 'japanese', 'mexican', 'french', 'indian', 'thai', 'mediterranean', 'american', 'steakhouse'];
    items.forEach(item => {
      const content = item.content.toLowerCase();
      cuisineKeywords.forEach(cuisine => {
        if (content.includes(cuisine)) {
          cuisines.push(cuisine);
        }
      });
    });
    return [...new Set(cuisines)];
  }

  extractTimes(items) {
    const times = [];
    items.forEach(item => {
      const timeMatches = item.content.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b|\b(?:breakfast|lunch|dinner|brunch)\b/gi);
      if (timeMatches) {
        times.push(...timeMatches);
      }
    });
    return [...new Set(times)];
  }

  extractProductNames(items) {
    const products = [];
    items.forEach(item => {
      // Look for quoted product names or title-cased phrases
      const quotedMatches = item.content.match(/"([^"]+)"/g);
      if (quotedMatches) {
        products.push(...quotedMatches.map(match => match.replace(/"/g, '')));
      }
      
      // Look for potential product names (capitalized words)
      const titleMatches = item.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
      if (titleMatches) {
        products.push(...titleMatches.filter(match => match.length > 5 && match.length < 50));
      }
    });
    return [...new Set(products)];
  }

  extractCategories(items) {
    const categories = [];
    const categoryKeywords = ['electronics', 'clothing', 'books', 'home', 'sports', 'beauty', 'automotive', 'tools', 'toys', 'kitchen'];
    items.forEach(item => {
      const content = item.content.toLowerCase();
      categoryKeywords.forEach(category => {
        if (content.includes(category)) {
          categories.push(category);
        }
      });
    });
    return [...new Set(categories)];
  }

  extractSpecifications(items) {
    const specs = [];
    items.forEach(item => {
      // Look for specification-like patterns
      const specMatches = item.content.match(/\b\d+(?:\.\d+)?\s*(?:GB|MB|TB|kg|lbs|inches|mm|cm|Hz|GHz|MP|V|W)\b/gi);
      if (specMatches) {
        specs.push(...specMatches);
      }
    });
    return [...new Set(specs)];
  }

  extractBrands(items) {
    const brands = [];
    const brandKeywords = ['apple', 'samsung', 'google', 'microsoft', 'sony', 'nike', 'adidas', 'amazon', 'dell', 'hp'];
    items.forEach(item => {
      const content = item.content.toLowerCase();
      brandKeywords.forEach(brand => {
        if (content.includes(brand)) {
          brands.push(brand);
        }
      });
    });
    return [...new Set(brands)];
  }

  extractAccommodationTypes(items) {
    const types = [];
    const typeKeywords = ['hotel', 'hostel', 'resort', 'apartment', 'villa', 'bed and breakfast', 'motel', 'lodge'];
    items.forEach(item => {
      const content = item.content.toLowerCase();
      typeKeywords.forEach(type => {
        if (content.includes(type)) {
          types.push(type);
        }
      });
    });
    return [...new Set(types)];
  }

  extractActivities(items) {
    const activities = [];
    const activityKeywords = ['museum', 'tour', 'hiking', 'beach', 'shopping', 'restaurant', 'theater', 'concert', 'park', 'gallery'];
    items.forEach(item => {
      const content = item.content.toLowerCase();
      activityKeywords.forEach(activity => {
        if (content.includes(activity)) {
          activities.push(activity);
        }
      });
    });
    return [...new Set(activities)];
  }

  extractResearchTopics(items) {
    const topics = [];
    items.forEach(item => {
      // Look for academic-style topics
      const phrases = item.content.split(/[.!?;]+/);
      phrases.forEach(phrase => {
        phrase = phrase.trim();
        if (phrase.length > 15 && phrase.length < 80 && 
            (phrase.includes('research') || phrase.includes('analysis') || phrase.includes('study'))) {
          topics.push(phrase);
        }
      });
    });
    return topics.slice(0, 10);
  }

  extractAuthors(items) {
    const authors = [];
    items.forEach(item => {
      // Look for name patterns (First Last, First M. Last)
      const nameMatches = item.content.match(/\b[A-Z][a-z]+\s+(?:[A-Z]\.\s+)?[A-Z][a-z]+\b/g);
      if (nameMatches) {
        authors.push(...nameMatches.filter(name => name.length > 5 && name.length < 40));
      }
    });
    return [...new Set(authors)];
  }

  extractPublications(items) {
    const publications = [];
    items.forEach(item => {
      // Look for journal/conference names or quoted titles
      const quotedMatches = item.content.match(/"([^"]{10,100})"/g);
      if (quotedMatches) {
        publications.push(...quotedMatches.map(match => match.replace(/"/g, '')));
      }
    });
    return [...new Set(publications)];
  }

  extractYears(items) {
    const years = [];
    items.forEach(item => {
      const yearMatches = item.content.match(/\b(19|20)\d{2}\b/g);
      if (yearMatches) {
        years.push(...yearMatches);
      }
    });
    return [...new Set(years)].sort();
  }

  extractGeneralEntities(items) {
    const entities = [];
    items.forEach(item => {
      // Extract capitalized phrases that might be entities
      const entityMatches = item.content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
      if (entityMatches) {
        entities.push(...entityMatches.filter(entity => entity.length > 3 && entity.length < 50));
      }
    });
    return [...new Set(entities)];
  }

  extractSources(items) {
    const sources = [];
    items.forEach(item => {
      // Extract URLs or website names
      const urlMatches = item.content.match(/https?:\/\/[^\s]+/g);
      if (urlMatches) {
        sources.push(...urlMatches);
      }
      
      // Extract potential source names
      if (item.source_app) {
        sources.push(item.source_app);
      }
      if (item.window_title) {
        sources.push(item.window_title);
      }
    });
    return [...new Set(sources)];
  }

  extractQuestions(items) {
    const questions = [];
    items.forEach(item => {
      const questionMatches = item.content.match(/[^.!?]*\?/g);
      if (questionMatches) {
        questions.push(...questionMatches.map(q => q.trim()).filter(q => q.length > 10));
      }
    });
    return questions.slice(0, 10);
  }

  // Rate limiting
  isRateLimited(sessionId) {
    const lastTrigger = this.rateLimiter.get(sessionId);
    if (!lastTrigger) return false;
    
    const timeSinceLastTrigger = Date.now() - lastTrigger;
    return timeSinceLastTrigger < 60000; // 1 minute rate limit
  }

  updateRateLimit(sessionId) {
    this.rateLimiter.set(sessionId, Date.now());
  }

  generateWorkflowId() {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Configuration management
  updateWorkflowConfig(sessionType, config) {
    if (this.workflowConfig[sessionType]) {
      this.workflowConfig[sessionType] = { ...this.workflowConfig[sessionType], ...config };
      console.log(`Updated workflow config for ${sessionType}:`, this.workflowConfig[sessionType]);
    }
  }

  enableWorkflow(sessionType) {
    if (this.workflowConfig[sessionType]) {
      this.workflowConfig[sessionType].enabled = true;
      console.log(`Enabled workflow for ${sessionType}`);
    }
  }

  disableWorkflow(sessionType) {
    if (this.workflowConfig[sessionType]) {
      this.workflowConfig[sessionType].enabled = false;
      console.log(`Disabled workflow for ${sessionType}`);
    }
  }

  getWorkflowStatus() {
    return Object.entries(this.workflowConfig).map(([type, config]) => ({
      sessionType: type,
      enabled: config.enabled,
      triggerThreshold: config.triggerThreshold,
      webhookPath: config.webhookPath
    }));
  }
}

module.exports = ExternalApiService; 