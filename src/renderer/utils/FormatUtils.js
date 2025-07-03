/**
 * Formatting and utility functions for FlowClip renderer
 */
class FormatUtils {
  
  /**
   * Format relative time (e.g., "2h ago", "Just now")
   */
  static formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Format duration between two timestamps
   */
  static formatDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just started';
    if (diffMins < 60) return `${diffMins}m`;
    
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  }

  /**
   * Format session type for display
   */
  static formatSessionType(sessionType) {
    return sessionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Format progress status
   */
  static formatProgressStatus(status) {
    const statuses = {
      'just_started': 'Just Started',
      'in_progress': 'In Progress', 
      'nearly_complete': 'Nearly Complete',
      'completed': 'Completed'
    };
    return statuses[status] || 'Unknown';
  }

  /**
   * Format completion status
   */
  static formatCompletionStatus(status) {
    const statusMap = {
      'comprehensive': 'Comprehensive Research Complete',
      'substantial': 'Substantial Research Complete',
      'adequate': 'Adequate Research Complete', 
      'preliminary': 'Preliminary Research',
      'in_progress': 'Research In Progress',
      'completed': 'Completed',
      'active': 'Active'
    };
    return statusMap[status] || FormatUtils.formatProgressStatus(status);
  }

  /**
   * Truncate text to specified length
   */
  static truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * Escape HTML characters
   */
  static escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get icon for content type
   */
  static getContentTypeIcon(type) {
    const icons = {
      'TEXT': 'font',
      'IMAGE': 'image',
      'FILE': 'file', 
      'URL': 'link'
    };
    return icons[type] || 'clipboard';
  }

  /**
   * Get icon for session type
   */
  static getSessionTypeIcon(sessionType) {
    const icons = {
      'hotel_research': 'hotel',
      'restaurant_research': 'utensils',
      'product_research': 'shopping-cart',
      'academic_research': 'graduation-cap',
      'travel_research': 'plane',
      'general_research': 'search'
    };
    return icons[sessionType] || 'layer-group';
  }

  /**
   * Get action configuration
   */
  static getActionConfig(action) {
    const configs = {
      'research': { label: 'Research', icon: 'search', description: 'Research this topic' },
      'fact_check': { label: 'Fact Check', icon: 'check-circle', description: 'Verify facts and claims' },
      'summarize': { label: 'Summary', icon: 'compress-alt', description: 'Create a summary' },
      'translate': { label: 'Translate', icon: 'language', description: 'Translate to another language' },
      'explain': { label: 'Explain', icon: 'lightbulb', description: 'Explain the content' },
      'expand': { label: 'Expand', icon: 'expand-alt', description: 'Get more details' },
      'create_task': { label: 'Task', icon: 'tasks', description: 'Create a task from this' },
      'cite': { label: 'Cite', icon: 'quote-left', description: 'Create citation' },
      'respond': { label: 'Reply', icon: 'reply', description: 'Draft a response' },
      'schedule': { label: 'Schedule', icon: 'calendar', description: 'Schedule related activity' }
    };
    return configs[action] || { label: action, icon: 'cog', description: `Perform ${action}` };
  }

  /**
   * Get action priority value for sorting
   */
  static getActionPriorityValue(priority) {
    const priorities = { 'high': 3, 'medium': 2, 'low': 1 };
    return priorities[priority] || 1;
  }

  /**
   * Generate action button HTML
   */
  static getActionButtonHTML(action) {
    const actions = {
      'summarize': '<i class="fas fa-compress-alt"></i> Summarize',
      'research': '<i class="fas fa-search"></i> Research',
      'fact_check': '<i class="fas fa-check-circle"></i> Fact Check',
      'create_task': '<i class="fas fa-tasks"></i> Create Task',
      'translate': '<i class="fas fa-language"></i> Translate',
      'explain': '<i class="fas fa-lightbulb"></i> Explain'
    };
    return actions[action] || action;
  }

  /**
   * Generate concise session title from research data
   */
  static generateConciseSessionTitle(sessionType, research) {
    const researchObjective = research.researchObjective || '';
    const keyFindings = research.keyFindings || [];
    
    // Extract key information patterns
    const locationMatch = researchObjective.match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i);
    const brandsMatch = researchObjective.match(/\b(Hilton|Marriott|Hyatt|Sheraton|Ritz|Four Seasons|Shangri|Apple|Samsung|Google|Microsoft|Amazon|Sony|Nike)\b/gi);
    const cuisineMatch = researchObjective.match(/\b(Italian|French|Japanese|Chinese|Mexican|Thai|Indian|Mediterranean|Steakhouse)\b/i);
    const productMatch = researchObjective.match(/\b(laptop|phone|headphones|camera|watch|tablet|computer|software|app)\b/i);
    
    let conciseTitle = '';
    
    switch (sessionType) {
      case 'hotel_research':
        if (locationMatch && brandsMatch && brandsMatch.length > 0) {
          conciseTitle = brandsMatch.length > 1 
            ? `${brandsMatch.slice(0, 2).join(' vs ')} - ${locationMatch[0]}`
            : `${brandsMatch[0]} Hotels - ${locationMatch[0]}`;
        } else if (locationMatch) {
          conciseTitle = `Hotels in ${locationMatch[0]}`;
        } else if (brandsMatch && brandsMatch.length > 0) {
          conciseTitle = brandsMatch.length > 1
            ? `${brandsMatch.slice(0, 2).join(' vs ')} Hotels`
            : `${brandsMatch[0]} Hotels`;
        } else {
          conciseTitle = 'Hotel Research';
        }
        break;
        
      case 'restaurant_research':
        if (locationMatch && cuisineMatch) {
          conciseTitle = `${cuisineMatch[0]} Restaurants - ${locationMatch[0]}`;
        } else if (locationMatch) {
          conciseTitle = `Restaurants in ${locationMatch[0]}`;
        } else if (cuisineMatch) {
          conciseTitle = `${cuisineMatch[0]} Restaurants`;
        } else {
          conciseTitle = 'Restaurant Research';
        }
        break;
        
      case 'travel_research':
      case 'travel_planning':
        conciseTitle = locationMatch ? `Travel to ${locationMatch[0]}` : 'Travel Planning';
        break;
        
      case 'product_research':
        if (brandsMatch && brandsMatch.length > 1) {
          conciseTitle = `${brandsMatch.slice(0, 2).join(' vs ')} Comparison`;
        } else if (brandsMatch && brandsMatch.length > 0) {
          conciseTitle = `${brandsMatch[0]} Products`;
        } else if (productMatch) {
          conciseTitle = `${productMatch[0].charAt(0).toUpperCase() + productMatch[0].slice(1)} Research`;
        } else {
          conciseTitle = 'Product Research';
        }
        break;
        
      case 'academic_research':
        const academicTerms = researchObjective.match(/\b[A-Z][a-z]+(?:\s+[a-z]+){0,1}\b/g)?.slice(0, 2) || [];
        conciseTitle = academicTerms.length > 0 
          ? `Academic: ${academicTerms.join(' & ')}`
          : 'Academic Research';
        break;
        
      case 'event_planning':
        conciseTitle = locationMatch 
          ? `Event Planning - ${locationMatch[0]}`
          : 'Event Planning';
        break;
        
      default:
        if (keyFindings.length > 0 && keyFindings[0].length < 40) {
          conciseTitle = keyFindings[0];
        } else {
          const keyTerms = researchObjective.match(/\b[A-Z][a-z]+(?:\s+[a-z]+){0,1}\b/g)?.slice(0, 2) || [];
          conciseTitle = keyTerms.length > 0
            ? `Research: ${keyTerms.join(' & ')}`
            : sessionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
    }
    
    // Clean up and constrain length
    conciseTitle = conciseTitle.replace(/^(Research\s+|Find\s+|Get\s+)/i, '');
    
    if (conciseTitle.length > 50) {
      conciseTitle = conciseTitle.substring(0, 47) + '...';
    }
    
    return conciseTitle || 'Research Session';
  }

  /**
   * Safe JSON parsing with fallback
   */
  static safeJsonParse(jsonString, fallback = null) {
    try {
      return typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    } catch (error) {
      console.warn('JSON parsing failed:', error);
      return fallback;
    }
  }
}

module.exports = FormatUtils; 