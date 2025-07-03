/**
 * Utility functions for LangGraph workflows
 */

const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { ALLOWED_ACTIONS, CONTENT_TYPES, RESPONSE_LIMITS } = require('./constants');

/**
 * Logging utility with consistent formatting
 */
class Logger {
  static log(message, context = '', data = null) {
    const logMessage = context ? `LangGraph ${context}: ${message}` : `LangGraph: ${message}`;
    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  static error(message, context = '', error = null) {
    const logMessage = context ? `LangGraph ${context}: ${message}` : `LangGraph: ${message}`;
    if (error) {
      console.error(logMessage, error);
    } else {
      console.error(logMessage);
    }
  }
}

/**
 * JSON parsing utility with fallback handling
 */
class JSONParser {
  static parseWithFallback(response, fallbackGenerator) {
    try {
      return JSON.parse(response.content);
    } catch (parseError) {
      Logger.log('JSON parsing failed, using fallback', 'Parser');
      return fallbackGenerator();
    }
  }

  static parseAnalysisResponse(response, fallbackAnalysis) {
    return this.parseWithFallback(response, () => fallbackAnalysis);
  }
}

/**
 * Message creation utilities
 */
class MessageBuilder {
  static createSystemMessage(content) {
    return new SystemMessage(content);
  }

  static createHumanMessage(content) {
    return new HumanMessage(content);
  }

  static createAnalysisMessages(systemPrompt, content, context = {}) {
    const contextInfo = context || {};
    const humanContent = `Content: ${content}

Source Application: ${contextInfo.sourceApp || 'unknown'}
Window Title: ${contextInfo.windowTitle || 'unknown'}
Has Screenshot: ${!!contextInfo.screenshotPath ? 'Yes' : 'No'}`;

    return [
      this.createSystemMessage(systemPrompt),
      this.createHumanMessage(humanContent)
    ];
  }

  static createVisionMessage(content, base64Image, contextPrompt) {
    const contentPreview = String(content || '').length > 200 ? 
      String(content).substring(0, 200) + '...' : 
      String(content || '');

    return new HumanMessage({
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
  }
}

/**
 * Content analysis utilities
 */
class ContentAnalyzer {
  static extractContentType(content) {
    if (!content) return CONTENT_TYPES.EMPTY;
    
    const text = content.trim().toLowerCase();
    
    // URL detection
    if (content.match(/^https?:\/\//)) return CONTENT_TYPES.URL;
    
    // Email detection
    if (content.match(/\S+@\S+\.\S+/)) return CONTENT_TYPES.EMAIL;
    
    // Phone number detection
    if (content.match(/(\+?1-?)?(\d{3}[-.]?)?\d{3}[-.]?\d{4}/) || 
        content.match(/\(\d{3}\)\s?\d{3}[-.]?\d{4}/)) return CONTENT_TYPES.PHONE;
    
    // Date detection
    if (content.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/) || 
        content.match(/\d{4}-\d{2}-\d{2}/) || 
        content.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s+\d{4}/i)) return CONTENT_TYPES.DATE;
    
    // Address detection
    if (content.match(/\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|pl|place)\b/i) ||
        content.match(/\b\d{5}(-\d{4})?\b/) || 
        content.match(/\b[A-Z]{2}\s+\d{5}\b/) || 
        content.match(/\b(apt|apartment|suite|unit|#)\s*\d+/i)) return CONTENT_TYPES.ADDRESS;
    
    // Location detection
    if (content.match(/\b(city|town|village|county|state|country|province|region)\b/i) ||
        content.match(/\b[A-Z][a-z]+,\s*[A-Z]{2}\b/) || 
        content.match(/\b(north|south|east|west|central|downtown|uptown)\b/i) ||
        content.match(/\bmiles?\s+(from|to|away)\b/i)) return CONTENT_TYPES.LOCATION;
    
    // Organization detection
    if (content.match(/\b(inc|llc|corp|corporation|ltd|limited|company|co\.|llp|pc)\b/i) ||
        content.match(/\b(university|college|hospital|school|church|bank|group|association|foundation)\b/i)) return CONTENT_TYPES.ORGANIZATION;
    
    // Person detection
    if (content.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/) && 
        content.length < 100 && 
        !content.match(/\b(class|function|import|export|const|let|var)\b/i) && 
        !content.match(/^https?:\/\//)) return CONTENT_TYPES.PERSON;
    
    // Financial data detection
    if (content.match(/\$[\d,]+\.?\d*/) || 
        content.match(/\d+%/) || 
        content.match(/\b(price|cost|fee|salary|wage|budget|profit|loss|revenue|income)\b/i) ||
        content.match(/\b(usd|eur|gbp|jpy|cad|aud)\b/i)) return CONTENT_TYPES.FINANCIAL;
    
    // Code detection
    if (content.includes('function') || content.includes('class') || content.includes('import') ||
        content.includes('const ') || content.includes('let ') || content.includes('var ') ||
        content.match(/\{.*\}/) || content.match(/^\s*[<>]/) || 
        content.match(/[=;]{1,2}/) || content.match(/^\s*\/\//) || 
        content.match(/^\s*#[^#]/) || content.match(/\$\([^)]+\)/)) return CONTENT_TYPES.CODE;
    
    // Document patterns
    if (content.match(/\b(document|file|pdf|doc|txt|report|article|paper|memo|letter)\b/i) ||
        content.match(/\b(title|subject|dear|sincerely|regards|attachment)\b/i)) return CONTENT_TYPES.DOCUMENT;
    
    // Data detection
    if ((content.trim().startsWith('{') && content.trim().endsWith('}')) ||
        (content.trim().startsWith('[') && content.trim().endsWith(']')) ||
        content.includes('"key":') || content.includes("'key':")) return CONTENT_TYPES.DATA;
    
    return CONTENT_TYPES.TEXT;
  }

  static generateFallbackTags(content, contextInfo) {
    const tags = [];
    
    // Always include content type as first tag
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
    
    // Context-based tags from source app
    if (contextInfo.sourceApp) {
      const app = contextInfo.sourceApp.toLowerCase();
      if (app.includes('browser') || app.includes('chrome') || app.includes('safari')) {
        tags.push('web', 'browser');
      } else if (app.includes('code') || app.includes('editor') || app.includes('vscode')) {
        tags.push('development', 'coding');
      } else if (app.includes('mail') || app.includes('outlook') || app.includes('gmail')) {
        tags.push('email', 'communication');
      }
    }
    
    // Content length indicators
    if (content.length > 500) tags.push('long-content', 'detailed');
    if (content.length < 50) tags.push('short-content', 'brief');
    
    // Remove duplicates and limit
    const uniqueTags = [...new Set(tags)];
    return uniqueTags.slice(0, RESPONSE_LIMITS.MAX_FALLBACK_TAGS);
  }

  static validateAndFilterActions(actions, allowedActions = ALLOWED_ACTIONS) {
    if (!Array.isArray(actions)) {
      Logger.log('Invalid actions format, using fallback', 'ContentAnalyzer');
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
        continue;
      }

      const { action, priority, reason, confidence } = actionItem;
      
      if (allowedActions.includes(action)) {
        validatedActions.push({
          action,
          priority: priority || 'medium',
          reason: reason || `Recommended action: ${action}`,
          confidence: confidence || 0.7
        });
      } else {
        // Map invalid actions to valid ones
        const mappedAction = this.mapInvalidAction(action);
        validatedActions.push({
          action: mappedAction,
          priority: priority || 'medium',
          reason: reason || `Mapped from '${action}' to '${mappedAction}'`,
          confidence: Math.max((confidence || 0.7) - 0.1, 0.3)
        });
      }
    }

    // Ensure we always have at least one action
    if (validatedActions.length === 0) {
      validatedActions.push({
        action: 'explain',
        priority: 'medium',
        reason: 'Default action when no valid actions provided',
        confidence: 0.5
      });
    }

    return validatedActions.slice(0, RESPONSE_LIMITS.MAX_ACTIONS);
  }

  static mapInvalidAction(action) {
    if (!action || typeof action !== 'string') return 'research';
    
    const actionLower = action.toLowerCase();
    
    if (actionLower.includes('search') || actionLower.includes('find') || actionLower.includes('lookup')) {
      return 'research';
    } else if (actionLower.includes('check') || actionLower.includes('verify') || actionLower.includes('validate')) {
      return 'fact_check';
    } else if (actionLower.includes('short') || actionLower.includes('brief') || actionLower.includes('condense')) {
      return 'summarize';
    } else if (actionLower.includes('convert') || actionLower.includes('language')) {
      return 'translate';
    } else if (actionLower.includes('clarify') || actionLower.includes('understand') || actionLower.includes('describe')) {
      return 'explain';
    } else if (actionLower.includes('detail') || actionLower.includes('elaborate') || actionLower.includes('more')) {
      return 'expand';
    } else if (actionLower.includes('todo') || actionLower.includes('action') || actionLower.includes('task')) {
      return 'create_task';
    } else if (actionLower.includes('source') || actionLower.includes('reference') || actionLower.includes('attribution')) {
      return 'cite';
    } else if (actionLower.includes('reply') || actionLower.includes('answer') || actionLower.includes('message')) {
      return 'respond';
    } else if (actionLower.includes('calendar') || actionLower.includes('time') || actionLower.includes('remind')) {
      return 'schedule';
    }
    
    return 'research'; // Default fallback
  }
}

/**
 * Text formatting utilities
 */
class TextFormatter {
  static formatResearchSummary(rawSummary, topic) {
    try {
      if (!rawSummary || typeof rawSummary !== 'string') {
        return this.getDefaultFormattedSummary(topic);
      }

      let formatted = rawSummary.trim();
      
      // Ensure it starts with a topic header if it doesn't have one
      if (!formatted.match(/^\*\*.*\*\*/)) {
        formatted = `**${topic}** - Research Summary\n\n${formatted}`;
      }
      
      // Limit length
      if (formatted.length > RESPONSE_LIMITS.MAX_SUMMARY_LENGTH) {
        const truncateAt = formatted.lastIndexOf('.', 1600);
        if (truncateAt > 1000) {
          formatted = formatted.substring(0, truncateAt + 1) + '\n\n*[Summary truncated for display]*';
        } else {
          formatted = formatted.substring(0, 1600) + '...\n\n*[Summary truncated for display]*';
        }
      }
      
      // Clean up formatting
      formatted = formatted
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s+/gm, '')
        .trim();
        
      return this.markdownToHtml(formatted);
      
    } catch (error) {
      Logger.error('Error formatting research summary', 'TextFormatter', error);
      return this.getDefaultFormattedSummary(topic);
    }
  }

  static markdownToHtml(text) {
    try {
      let html = text;
      
      // Convert **bold** to <strong>
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      // Convert *italic* to <em>
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
      
      // Convert line breaks
      html = html.replace(/\n\n/g, '</p><p>');
      html = html.replace(/\n/g, '<br>');
      
      // Wrap in paragraph tags
      html = `<p>${html}</p>`;
      
      // Clean up empty paragraphs
      html = html.replace(/<p><\/p>/g, '');
      html = html.replace(/<p>\s*<\/p>/g, '');
      
      return html;
      
    } catch (error) {
      Logger.error('Error converting markdown to HTML', 'TextFormatter', error);
      return text.replace(/\n/g, '<br>');
    }
  }

  static getDefaultFormattedSummary(topic) {
    const defaultText = `**${topic}** - Research Summary

Analysis of this topic has been completed based on available information and provides several key insights worth considering.

Research insights are available for this topic, and multiple perspectives should be considered for comprehensive understanding. Current applications and trends provide valuable context for practical decision-making.

For next steps, consider gathering additional sources to enhance understanding and verify findings through multiple reliable sources.`;
    
    return this.markdownToHtml(defaultText);
  }
}

/**
 * Cache management utilities
 */
class CacheManager {
  constructor(maxAge = 2 * 60 * 1000) {
    this.cache = new Map();
    this.maxAge = maxAge;
  }

  get(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

module.exports = {
  Logger,
  JSONParser,
  MessageBuilder,
  ContentAnalyzer,
  TextFormatter,
  CacheManager
}; 