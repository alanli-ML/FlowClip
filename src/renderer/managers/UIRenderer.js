const FormatUtils = require('../utils/FormatUtils');

/**
 * Handles common UI rendering functions
 */
class UIRenderer {
  constructor() {
    this.loadingElements = new Set();
  }

  /**
   * Show/hide loading indicator
   */
  showLoading(show, elementId = 'loading') {
    const loading = document.getElementById(elementId);
    if (loading) {
      if (show) {
        loading.classList.remove('hidden');
        this.loadingElements.add(elementId);
      } else {
        loading.classList.add('hidden');
        this.loadingElements.delete(elementId);
      }
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.querySelector('.toast-message');
    const toastIcon = document.querySelector('.toast-icon');
    
    if (!toast || !toastMessage || !toastIcon) return;
    
    toastMessage.textContent = message;
    
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      info: 'fas fa-info-circle',
      warning: 'fas fa-exclamation-triangle'
    };
    
    toastIcon.className = `toast-icon ${icons[type] || icons.info}`;
    toast.className = `toast ${type}`;
    
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  /**
   * Render empty state
   */
  renderEmptyState(container, icon, title, subtitle) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-${icon}"></i>
        <h3>${title}</h3>
        <p>${subtitle}</p>
      </div>
    `;
  }

  /**
   * Render loading state
   */
  renderLoadingState(container, message = 'Loading...') {
    container.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderErrorState(container, message = 'An error occurred') {
    container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Create clipboard item HTML
   */
  createClipboardItemHTML(item) {
    const timeAgo = FormatUtils.formatTimeAgo(new Date(item.timestamp));
    const contentPreview = FormatUtils.truncateText(item.content, 150);
    const tags = item.tags || [];

    return `
      <div class="clipboard-item" data-item-id="${item.id}">
        <div class="clipboard-item-header">
          <div class="clipboard-item-meta">
            <span class="clipboard-item-type">
              <i class="fas fa-${FormatUtils.getContentTypeIcon(item.content_type)}"></i>
              ${item.content_type}
            </span>
            <span>${item.source_app || 'Unknown'}</span>
            <span>${timeAgo}</span>
          </div>
        </div>
        <div class="clipboard-item-content">${contentPreview}</div>
        <div class="clipboard-item-action-results" data-item-id="${item.id}" style="display: none;">
          <!-- Action results will be inserted here -->
        </div>
        <div class="clipboard-item-footer">
          <div class="clipboard-item-tags">
            ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
          <div class="clipboard-item-actions">
            <div class="recommended-actions" data-item-id="${item.id}">
              <div class="actions-loading">
                <i class="fas fa-spinner fa-spin"></i>
              </div>
            </div>
            <button class="btn btn-sm btn-icon copy-btn" onclick="event.stopPropagation(); window.copyItemDirect('${item.id}')" title="Copy">
              <i class="fas fa-copy"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render recommended actions
   */
  renderRecommendedActions(container, actions, confidence, cached = false) {
    if (!actions || actions.length === 0) {
      container.innerHTML = '';
      return;
    }

    const actionsHTML = actions.map(actionItem => {
      const actionConfig = FormatUtils.getActionConfig(actionItem.action);
      const priorityClass = actionItem.priority === 'high' ? 'priority-high' : 
                          actionItem.priority === 'medium' ? 'priority-medium' : 'priority-low';
      
      return `
        <button class="btn btn-sm btn-action ${priorityClass}" 
                data-action="${actionItem.action}" 
                data-item-id="${container.dataset.itemId || ''}"
                title="${actionItem.reason || actionConfig.description}"
                onclick="event.stopPropagation(); window.flowClipRenderer.triggerActionFromButton('${container.dataset.itemId || ''}', '${actionItem.action}')">
          <i class="fas fa-${actionConfig.icon}"></i>
          <span>${actionConfig.label}</span>
        </button>
      `;
    }).join('');

    const confidenceIndicator = cached ? '' : 
      `<div class="confidence-indicator ${confidence > 0.7 ? 'high' : confidence > 0.5 ? 'medium' : 'low'}" 
            title="AI Confidence: ${Math.round(confidence * 100)}%">
         <i class="fas fa-brain"></i>
       </div>`;

    container.innerHTML = actionsHTML + confidenceIndicator;
  }

  /**
   * Create session HTML
   */
  createSessionHTML(session, sessionInfo) {
    const timeAgo = FormatUtils.formatTimeAgo(new Date(session.start_time));
    const duration = FormatUtils.formatDuration(session.start_time, session.last_activity);
    const statusClass = session.status === 'active' ? 'status-active' : 
                       session.status === 'expired' ? 'status-expired' : 'status-completed';

    return `
      <div class="session-item" data-session-id="${session.id}">
        <div class="session-header">
          <div class="session-title">
            <i class="fas fa-${FormatUtils.getSessionTypeIcon(session.session_type)}"></i>
            <span class="session-label">${sessionInfo.title}</span>
            <span class="session-type-badge ${session.session_type}">${FormatUtils.formatSessionType(session.session_type)}</span>
          </div>
          <div class="session-status">
            <span class="status-indicator ${statusClass}">${session.status}</span>
          </div>
        </div>
        <div class="session-meta">
          <div class="session-info">
            <span><i class="fas fa-clipboard-list"></i> ${session.item_count} items</span>
            <span><i class="fas fa-clock"></i> ${duration}</span>
            <span><i class="fas fa-calendar"></i> ${timeAgo}</span>
            ${sessionInfo.metrics ? `<span><i class="fas fa-chart-bar"></i> ${sessionInfo.metrics}</span>` : ''}
          </div>
        </div>
        <div class="session-preview">
          ${this.createSessionPreview(session, sessionInfo)}
        </div>
      </div>
    `;
  }

  /**
   * Create session preview HTML
   */
  createSessionPreview(session, sessionInfo = null) {
    if (sessionInfo && sessionInfo.preview) {
      return `<p class="session-summary">${FormatUtils.truncateText(sessionInfo.preview, 150)}</p>`;
    }
    
    let preview = '';
    
    try {
      if (session.context_summary) {
        const contextSummary = FormatUtils.safeJsonParse(session.context_summary);
        
        if (contextSummary?.sessionResearch?.comprehensiveSummary) {
          preview = contextSummary.sessionResearch.comprehensiveSummary;
        } else if (contextSummary?.sessionSummary) {
          preview = contextSummary.sessionSummary;
        } else if (contextSummary?.comprehensiveAnalysis) {
          const analysis = contextSummary.comprehensiveAnalysis;
          preview = `${analysis.totalItems} items analyzed across ${analysis.contentTypes.length} content types with ${analysis.totalSources} sources`;
        }
      }
    } catch (error) {
      console.error('Error parsing context summary for preview:', error);
    }

    if (!preview) {
      preview = `${session.session_type.replace('_', ' ')} session with ${session.item_count} items`;
    }

    return `<p class="session-summary">${FormatUtils.truncateText(preview, 150)}</p>`;
  }

  /**
   * Render session items
   */
  renderSessionItems(container, sessionItems) {
    if (!sessionItems || sessionItems.length === 0) {
      this.renderEmptyState(container, 'clipboard', 'No items in this session', '');
      return;
    }

    container.innerHTML = sessionItems.map((item, index) => `
      <div class="session-item-card" data-item-id="${item.id}">
        <div class="item-header">
          <span class="item-sequence">#${index + 1}</span>
          <span class="item-source">${item.source_app || 'Unknown'}</span>
          <span class="item-time">${FormatUtils.formatTimeAgo(new Date(item.timestamp))}</span>
        </div>
        <div class="item-content">
          ${FormatUtils.truncateText(item.content, 200)}
        </div>
        <div class="item-tags">
          ${(item.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  /**
   * Render research timeline
   */
  renderResearchTimeline(container, sessionItems) {
    if (!sessionItems || sessionItems.length === 0) {
      this.renderEmptyState(container, 'chart-line', 'Research flow will be displayed as items are added', '');
      return;
    }

    const timeline = sessionItems.map((item, index) => {
      const timeAgo = FormatUtils.formatTimeAgo(new Date(item.timestamp));
      const contentPreview = FormatUtils.truncateText(item.content || '', 80);
      const sourceApp = FormatUtils.escapeHtml(item.source_app || 'Unknown');
      
      return `
        <div class="timeline-item">
          <div class="timeline-marker">${index + 1}</div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-time">${timeAgo}</span>
              <span class="timeline-source">${sourceApp}</span>
            </div>
            <div class="timeline-text">${FormatUtils.escapeHtml(contentPreview)}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="research-timeline">
        ${timeline}
      </div>
    `;
  }

  /**
   * Render hotel research data
   */
  renderHotelResearchData(container, session, sessionItems) {
    // Extract hotel information from session items
    const hotels = [];
    const locations = new Set();
    
    sessionItems.forEach(item => {
      const content = item.content.toLowerCase();
      
      const hotelKeywords = ['hilton', 'marriott', 'ritz', 'shangri', 'hyatt', 'sheraton', 'holiday inn', 'courtyard'];
      hotelKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
          hotels.push(item.content.substring(0, 50) + '...');
        }
      });
      
      const locationMatch = content.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)*)\b/);
      if (locationMatch && locationMatch[1].length < 20) {
        locations.add(locationMatch[1]);
      }
    });

    const uniqueHotels = [...new Set(hotels)];
    const locationsList = [...locations];

    container.innerHTML = `
      <div class="hotel-analysis">
        <div class="hotel-summary">
          <div class="summary-item">
            <i class="fas fa-hotel"></i>
            <span><strong>${uniqueHotels.length}</strong> hotels researched</span>
          </div>
          <div class="summary-item">
            <i class="fas fa-map-marker-alt"></i>
            <span><strong>${locationsList.length}</strong> locations</span>
          </div>
          <div class="summary-item">
            <i class="fas fa-clock"></i>
            <span><strong>${sessionItems.length}</strong> research actions</span>
          </div>
        </div>
        
        ${uniqueHotels.length > 0 ? `
          <div class="hotels-list">
            <h5>Hotels Researched:</h5>
            <ul>
              ${uniqueHotels.map(hotel => `<li>${hotel}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${locationsList.length > 0 ? `
          <div class="locations-list">
            <h5>Locations:</h5>
            <div class="location-tags">
              ${locationsList.map(location => `<span class="location-tag">${location}</span>`).join('')}
            </div>
          </div>
        ` : ''}
        
        <div class="hotel-actions">
          <button class="btn btn-sm btn-primary" onclick="window.flowClipRenderer.triggerHotelComparison()">
            <i class="fas fa-balance-scale"></i>
            Compare Hotels
          </button>
          <button class="btn btn-sm btn-secondary" onclick="window.flowClipRenderer.showBookingOptions()">
            <i class="fas fa-external-link-alt"></i>
            View Booking Options
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Show session research loading
   */
  showSessionResearchLoading(container) {
    const existingLoader = container.querySelector('.research-loading-overlay');
    if (!existingLoader) {
      const loadingOverlay = document.createElement('div');
      loadingOverlay.className = 'research-loading-overlay';
      loadingOverlay.innerHTML = `
        <div class="research-loading-content">
          <div class="loading-spinner"></div>
          <p>Analyzing session research...</p>
        </div>
      `;
      container.appendChild(loadingOverlay);
    }
  }

  /**
   * Hide session research loading
   */
  hideSessionResearchLoading(container) {
    const loadingOverlay = container.querySelector('.research-loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.remove();
    }
  }

  /**
   * Update button state
   */
  updateButtonState(button, loading = false, config = null) {
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else {
      button.disabled = false;
      if (config) {
        button.innerHTML = `<i class="fas fa-${config.icon}"></i> ${config.label}`;
      }
    }
  }

  /**
   * Populate source app filter
   */
  populateSourceAppFilter(items, filterId = 'source-app-filter') {
    const sourceAppFilter = document.getElementById(filterId);
    if (!sourceAppFilter) return;

    const apps = [...new Set(items.map(item => item.source_app).filter(Boolean))];
    
    sourceAppFilter.innerHTML = '<option value="">All Apps</option>';
    
    apps.forEach(app => {
      const option = document.createElement('option');
      option.value = app;
      option.textContent = app;
      sourceAppFilter.appendChild(option);
    });
  }

  /**
   * Clean up all loading states
   */
  clearAllLoading() {
    this.loadingElements.forEach(elementId => {
      this.showLoading(false, elementId);
    });
    this.loadingElements.clear();
  }
}

module.exports = UIRenderer; 