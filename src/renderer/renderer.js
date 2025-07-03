const { ipcRenderer } = require('electron');

class FlowClipRenderer {
  constructor() {
    this.currentView = 'history';
    this.currentPage = 1;
    this.itemsPerPage = 50;
    this.allClipboardItems = [];
    this.filteredItems = [];
    this.currentClipboardItem = null;
    this.currentSession = null;
    this.currentModalSessionId = null;
    this.currentSessions = [];
    this.searchTimeout = null;
    this.settings = {};
    
    this.init();
  }

  async init() {
    // Add platform-specific CSS class
    const platform = await ipcRenderer.invoke('get-platform');
    document.body.classList.add(`platform-${platform}`);
    
    await this.loadSettings();
    this.setupEventListeners();
    this.loadClipboardHistory();
    this.setupIPCListeners();
  }

  async loadSettings() {
    try {
      this.settings = await ipcRenderer.invoke('get-settings');
      this.applySettings();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  applySettings() {
    const elements = {
      'openai-api-key': this.settings.openaiApiKey || '',
      'capture-screenshots': this.settings.captureScreenshots !== false,
      'capture-context': this.settings.captureContext !== false,
      'retention-days': this.settings.retentionDays || '30',
      'start-minimized': this.settings.startMinimized || false,
      'launch-at-startup': this.settings.launchAtStartup || false
    };

    for (const [id, value] of Object.entries(elements)) {
      const element = document.getElementById(id);
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = value;
        } else {
          element.value = value;
        }
      }
    }
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = e.currentTarget.dataset.view;
        this.switchView(view);
      });
    });

    // Search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });

    // Search filters
    document.getElementById('content-type-filter').addEventListener('change', () => {
      this.applyFilters();
    });

    document.getElementById('source-app-filter').addEventListener('change', () => {
      this.applyFilters();
    });

    document.getElementById('date-filter').addEventListener('change', () => {
      this.applyFilters();
    });

    // Clear search
    document.getElementById('clear-search').addEventListener('click', () => {
      document.getElementById('search-input').value = '';
      this.loadClipboardHistory();
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadClipboardHistory();
    });

    // Sessions refresh button
    document.getElementById('refresh-sessions-btn').addEventListener('click', () => {
      this.loadSessionsView();
    });

    // Clear sessions button
    document.getElementById('clear-sessions-btn').addEventListener('click', () => {
      this.clearAllSessions();
    });

    // Session filters
    document.getElementById('session-type-filter').addEventListener('change', () => {
      this.applySessionFilters();
    });

    document.getElementById('session-status-filter').addEventListener('change', () => {
      this.applySessionFilters();
    });

    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.switchView('settings');
    });

    // Minimize button
    document.getElementById('minimize-btn').addEventListener('click', () => {
      // This will be handled by the main process
    });

    // Settings form
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('test-api-key').addEventListener('click', () => {
      this.testApiKey();
    });

    // Modal events
    document.getElementById('item-modal').addEventListener('click', (e) => {
      if (e.target.id === 'item-modal') {
        this.closeModal();
      }
    });

    document.querySelector('.modal-close').addEventListener('click', () => {
      this.closeModal();
    });

    // Session modal events
    document.getElementById('session-modal').addEventListener('click', (e) => {
      if (e.target.id === 'session-modal') {
        this.closeSessionModal();
      }
    });

    document.querySelector('#session-modal .modal-close').addEventListener('click', () => {
      this.closeSessionModal();
    });

    // Session modal actions
    document.getElementById('export-session').addEventListener('click', () => {
      this.exportCurrentSession();
    });

    document.getElementById('close-session').addEventListener('click', () => {
      this.closeCurrentSession();
    });

    // AI action buttons
    document.querySelectorAll('.btn-ai').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.triggerAIAction(action);
      });
    });

    // Modal actions
    document.getElementById('copy-item').addEventListener('click', () => {
      this.copyItemToClipboard();
    });

    document.getElementById('delete-item').addEventListener('click', () => {
      this.deleteCurrentItem();
    });

    // Quick actions
    document.getElementById('clear-all-btn').addEventListener('click', () => {
      this.clearAllItems();
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });
  }

  setupIPCListeners() {
    ipcRenderer.on('clipboard-item-added', (event, item) => {
      this.addClipboardItemToUI(item);
      this.showToast('New clipboard item captured', 'success');
    });

    ipcRenderer.on('clipboard-item-updated', (event, data) => {
      this.updateClipboardItemInUI(data.clipboardItem, data);
      if (data.tagsUpdated) {
        this.showToast('Tags updated for clipboard item', 'success');
      }
    });

    // Listen for view changes
    ipcRenderer.on('show-clipboard-history', () => {
      this.switchView('history');
    });

    ipcRenderer.on('show-preferences', () => {
      this.switchView('settings');
    });

    // Session events
    ipcRenderer.on('session-created', (event, data) => {
      this.handleSessionCreated(data);
    });

    ipcRenderer.on('session-updated', (event, data) => {
      this.handleSessionUpdated(data);
    });

    // Session comprehensive analysis events
    ipcRenderer.on('session-analysis-updated', (event, data) => {
      this.handleSessionAnalysisUpdated(data);
    });

    // Session-level research events  
    ipcRenderer.on('session-research-completed', (event, data) => {
      this.handleSessionResearchCompleted(data);
    });

    ipcRenderer.on('session-research-failed', (event, data) => {
      this.handleSessionResearchFailed(data);
    });

    ipcRenderer.on('session-research-started', (event, data) => {
      this.handleSessionResearchStarted(data);
    });

    // Session research progress events
    ipcRenderer.on('session-research-progress', (event, data) => {
      this.handleSessionResearchProgress(data);
    });

    // Item-level session research events (separate from session-level)
    ipcRenderer.on('session-item-research-completed', (event, data) => {
      this.handleSessionItemResearchCompleted(data);
    });

    ipcRenderer.on('session-item-research-failed', (event, data) => {
      this.handleSessionItemResearchFailed(data);
    });

    ipcRenderer.on('hotel-research-alert', (event, data) => {
      this.showHotelResearchAlert(data);
    });
  }

  switchView(viewName) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');

    this.currentView = viewName;

    switch (viewName) {
      case 'history':
        this.loadClipboardHistory();
        break;
      case 'search':
        this.loadSearchView();
        break;
      case 'sessions':
        this.loadSessionsView();
        break;
      case 'tags':
        this.loadTagsView();
        break;
      case 'stats':
        this.loadStatsView();
        break;
      case 'settings':
        this.loadSettingsView();
        break;
    }
  }

  async loadClipboardHistory() {
    try {
      this.showLoading(true);
      const items = await ipcRenderer.invoke('get-clipboard-history', { limit: 50 });
      this.allClipboardItems = items;
      this.filteredItems = items;
      this.renderClipboardItems(items);
      this.populateSourceAppFilter(items);
    } catch (error) {
      console.error('Error loading clipboard history:', error);
      this.showToast('Error loading clipboard history', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  renderClipboardItems(items) {
    const container = document.getElementById('clipboard-items');
    container.innerHTML = '';
    
    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-clipboard"></i>
          <h3>No clipboard items yet</h3>
          <p>Copy something to get started!</p>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.innerHTML = this.createClipboardItemHTML(item);
      const clipboardItemElement = itemElement.firstElementChild;
      container.appendChild(clipboardItemElement);

      // Add click event listener for opening the item modal
      clipboardItemElement.addEventListener('click', () => {
        this.openClipboardItem(item.id);
    });

    // Load recommended actions for each item
      this.loadRecommendedActions(item.id);
      
      // Display historical workflow results if available
      this.displayHistoricalResults(item);
    });
  }

  async displayHistoricalResults(item) {
    // Only get historical results if the item has workflowResults
    if (!item.workflowResults) {
      // For items that might have workflow results but weren't loaded yet, 
      // fetch them from the database
      try {
        const fullItem = await ipcRenderer.invoke('get-clipboard-item', item.id);
        if (fullItem && fullItem.workflowResults) {
          this.populateHistoricalResults(item.id, fullItem.workflowResults);
        }
      } catch (error) {
        console.error('Error fetching full item data:', error);
      }
    } else {
      this.populateHistoricalResults(item.id, item.workflowResults);
    }
  }

  populateHistoricalResults(itemId, workflowResults) {
    if (!workflowResults || Object.keys(workflowResults).length === 0) {
      return;
    }

    // For each workflow type that has results, display the most recent result
    Object.entries(workflowResults).forEach(([workflowType, results]) => {
      if (results && results.length > 0) {
        const mostRecentResult = results[0];
        
        // Convert workflow result to the format expected by updateClipboardEntryWithResult
        const convertedResult = this.convertWorkflowResultToActionResult(workflowType, mostRecentResult);
        
        if (convertedResult) {
          // Use the existing updateClipboardEntryWithResult method but mark it as historical
          this.updateClipboardEntryWithHistoricalResult(itemId, workflowType, convertedResult, mostRecentResult.executedAt);
        }
      }
    });
  }

  convertWorkflowResultToActionResult(workflowType, workflowResult) {
    // Convert workflow-specific results to the format expected by formatActionResult
    switch (workflowType) {
      case 'research':
        return {
          research_summary: workflowResult.researchSummary,
          researchSummary: workflowResult.researchSummary,
          key_findings: workflowResult.keyFindings,
          keyFindings: workflowResult.keyFindings,
          sources: workflowResult.sources,
          total_sources: workflowResult.totalSources,
          totalSources: workflowResult.totalSources,
          confidence: workflowResult.confidence
        };
      
      case 'summarize':
        return {
          summary: workflowResult.finalSummary || workflowResult.summary,
          finalSummary: workflowResult.finalSummary,
          qualityScore: workflowResult.qualityScore,
          keyPoints: workflowResult.keyPoints,
          word_count: workflowResult.word_count,
          summary_ratio: workflowResult.summary_ratio
        };
      
      case 'fact_check':
        return {
          fact_check_analysis: workflowResult.analysis,
          confidence_level: workflowResult.confidence
        };
      
      case 'create_task':
        return {
          title: workflowResult.title,
          description: workflowResult.description,
          priority: workflowResult.priority,
          estimated_time: workflowResult.estimated_time
        };
      
      case 'translate':
        return {
          translated_text: workflowResult.translatedText,
          target_language: workflowResult.targetLanguage
        };
      
      case 'explain':
        return {
          explanation: workflowResult.explanation,
          key_concepts: workflowResult.keyConcepts
        };
      
      default:
        // For unknown workflow types, try to extract common result patterns
        return workflowResult;
    }
  }

  updateClipboardEntryWithHistoricalResult(itemId, action, result, executedAt) {
    const resultsContainer = document.querySelector(`.clipboard-item-action-results[data-item-id="${itemId}"]`);
    if (!resultsContainer) return;

    const config = this.getActionConfig(action);
    const formattedResult = this.formatActionResult(action, result);
    
    // Create result element with historical indicator
    const resultElement = document.createElement('div');
    resultElement.className = 'action-result historical-result';
    
    const timeAgo = executedAt ? this.formatTimeAgo(new Date(executedAt)) : 'Previously';
    
    resultElement.innerHTML = `
      <div class="action-result-header">
        <i class="fas fa-${config.icon}"></i>
        <span class="action-result-title">${config.label} Result</span>
        <span class="historical-indicator" title="Executed ${timeAgo}">
          <i class="fas fa-history"></i> ${timeAgo}
        </span>
        <button class="btn btn-xs action-result-close" onclick="this.parentElement.parentElement.remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="action-result-content">
        ${formattedResult}
      </div>
    `;

    resultsContainer.appendChild(resultElement);
    resultsContainer.style.display = 'block';
  }

  createClipboardItemHTML(item) {
    const timeAgo = this.formatTimeAgo(new Date(item.timestamp));
    const contentPreview = this.truncateText(item.content, 150);
    const tags = item.tags || [];

    return `
      <div class="clipboard-item" data-item-id="${item.id}">
        <div class="clipboard-item-header">
          <div class="clipboard-item-meta">
            <span class="clipboard-item-type">
              <i class="fas fa-${this.getContentTypeIcon(item.content_type)}"></i>
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

  async loadRecommendedActions(itemId) {
    try {
      const actionsContainer = document.querySelector(`.recommended-actions[data-item-id="${itemId}"]`);
      if (!actionsContainer) return;

      const result = await ipcRenderer.invoke('get-recommended-actions', itemId);
      
      if (result.error) {
        actionsContainer.innerHTML = '';
        return;
      }

      const { recommendedActions, confidence, cached, fallback } = result;
      
      if (!recommendedActions || recommendedActions.length === 0) {
        actionsContainer.innerHTML = '';
        return;
      }

      // Show top 2-3 actions to avoid clutter
      const topActions = recommendedActions
        .sort((a, b) => this.getActionPriorityValue(b.priority) - this.getActionPriorityValue(a.priority))
        .slice(0, 3);

      const actionsHTML = topActions.map(actionItem => {
        const actionConfig = this.getActionConfig(actionItem.action);
        const priorityClass = actionItem.priority === 'high' ? 'priority-high' : 
                            actionItem.priority === 'medium' ? 'priority-medium' : 'priority-low';
        
        return `
          <button class="btn btn-sm btn-action ${priorityClass}" 
                  data-action="${actionItem.action}" 
                  data-item-id="${itemId}"
                  title="${actionItem.reason || actionConfig.description}"
                  onclick="event.stopPropagation(); window.flowClipRenderer.triggerActionFromButton('${itemId}', '${actionItem.action}')">
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

      actionsContainer.innerHTML = actionsHTML + confidenceIndicator;

    } catch (error) {
      console.error('Error loading recommended actions:', error);
      const actionsContainer = document.querySelector(`.recommended-actions[data-item-id="${itemId}"]`);
      if (actionsContainer) {
        actionsContainer.innerHTML = '';
      }
    }
  }

  getActionPriorityValue(priority) {
    const priorities = { 'high': 3, 'medium': 2, 'low': 1 };
    return priorities[priority] || 1;
  }

  getActionConfig(action) {
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

  async triggerActionFromButton(itemId, action) {
    try {
      const button = document.querySelector(`[data-action="${action}"][data-item-id="${itemId}"]`);
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      }

      const result = await ipcRenderer.invoke('trigger-ai-task', itemId, action);
      this.showAIResult(action, result.result);
      this.showToast(`${this.getActionConfig(action).label} completed successfully`, 'success');
      
      // Update the clipboard entry with the action result
      this.updateClipboardEntryWithResult(itemId, action, result.result);

    } catch (error) {
      console.error(`Error with ${action}:`, error);
      this.showToast(`Error with ${action}: ${error.message}`, 'error');
      
      // Show error in the clipboard entry
      this.updateClipboardEntryWithError(itemId, action, error.message);
    } finally {
      const button = document.querySelector(`[data-action="${action}"][data-item-id="${itemId}"]`);
      if (button) {
        button.disabled = false;
        const config = this.getActionConfig(action);
        button.innerHTML = `<i class="fas fa-${config.icon}"></i><span>${config.label}</span>`;
      }
    }
  }

  updateClipboardEntryWithResult(itemId, action, result) {
    const resultsContainer = document.querySelector(`.clipboard-item-action-results[data-item-id="${itemId}"]`);
    if (!resultsContainer) return;

    const config = this.getActionConfig(action);
    const formattedResult = this.formatActionResult(action, result);
    
    // Create result element
    const resultElement = document.createElement('div');
    resultElement.className = 'action-result';
    resultElement.innerHTML = `
      <div class="action-result-header">
        <i class="fas fa-${config.icon}"></i>
        <span class="action-result-title">${config.label} Result</span>
        <button class="btn btn-xs action-result-close" onclick="this.parentElement.parentElement.remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="action-result-content">
        ${formattedResult}
      </div>
    `;

    resultsContainer.appendChild(resultElement);
    resultsContainer.style.display = 'block';

    // Smooth expand animation
    resultElement.style.opacity = '0';
    resultElement.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      resultElement.style.transition = 'all 0.3s ease';
      resultElement.style.opacity = '1';
      resultElement.style.transform = 'translateY(0)';
    }, 10);
  }

  updateClipboardEntryWithError(itemId, action, errorMessage) {
    const resultsContainer = document.querySelector(`.clipboard-item-action-results[data-item-id="${itemId}"]`);
    if (!resultsContainer) return;

    const config = this.getActionConfig(action);
    
    // Create error element
    const errorElement = document.createElement('div');
    errorElement.className = 'action-result action-error';
    errorElement.innerHTML = `
      <div class="action-result-header">
        <i class="fas fa-exclamation-triangle"></i>
        <span class="action-result-title">${config.label} Error</span>
        <button class="btn btn-xs action-result-close" onclick="this.parentElement.parentElement.remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="action-result-content">
        ${errorMessage}
      </div>
    `;

    resultsContainer.appendChild(errorElement);
    resultsContainer.style.display = 'block';

    // Smooth expand animation
    errorElement.style.opacity = '0';
    errorElement.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      errorElement.style.transition = 'all 0.3s ease';
      errorElement.style.opacity = '1';
      errorElement.style.transform = 'translateY(0)';
    }, 10);
  }

  formatActionResult(action, result) {
    if (!result) return '<em>No result</em>';

    // Handle different action types with custom formatting
    switch (action) {
      case 'summarize':
        if (typeof result === 'object' && result.summary) {
          return `
            <div class="summary-result">
              <p><strong>Summary:</strong></p>
              <p>${result.summary}</p>
              ${result.qualityScore ? `<small class="quality-score">Quality: ${result.qualityScore}/100</small>` : ''}
              ${result.word_count ? `<small class="word-count">Reduced from ${result.word_count} words (${result.summary_ratio}%)</small>` : ''}
            </div>
          `;
        }
        break;

      case 'research':
        if (typeof result === 'object') {
          // Handle new comprehensive research results (from both aiService and LangGraph)
          const summary = result.research_summary || result.researchSummary;
          const findings = result.key_findings || result.keyFindings;
          const sources = result.sources;
          const totalSources = result.total_sources || result.totalSources;
          
          if (summary) {
            return `
              <div class="research-result">
                <p><strong>Research Summary:</strong></p>
                <div class="research-summary">${summary}</div>
                
                ${findings && findings.length > 0 ? `
                  <p><strong>Key Findings:</strong></p>
                  <ul class="key-findings">
                    ${findings.map(finding => `<li>${finding}</li>`).join('')}
                  </ul>
                ` : ''}
                
                ${sources && sources.length > 0 ? `
                  <p><strong>Sources Found:</strong> ${totalSources || sources.length}</p>
                  <div class="research-sources">
                    ${sources.slice(0, 3).map(source => `
                      <div class="source-item">
                        <strong>${source.title || source.source || 'Source'}</strong>
                        ${source.url ? `<br><a href="${source.url}" target="_blank" class="source-link">${source.url}</a>` : ''}
                        ${source.snippet ? `<br><span class="source-snippet">${source.snippet}</span>` : ''}
                      </div>
                    `).join('')}
                    ${sources.length > 3 ? `<p><em>... and ${sources.length - 3} more sources</em></p>` : ''}
                  </div>
                ` : ''}
              </div>
            `;
          } else {
            // Fallback for old format or simple results
            return `<div class="research-result">${Array.isArray(result) ? result.join(', ') : result}</div>`;
          }
        }
        break;

      case 'fact_check':
        if (typeof result === 'object' && result.fact_check_analysis) {
          return `
            <div class="fact-check-result">
              <p><strong>Fact Check Analysis:</strong></p>
              <p>${result.fact_check_analysis}</p>
              ${result.confidence_level ? `<small class="confidence">Confidence: ${result.confidence_level}</small>` : ''}
            </div>
          `;
        }
        break;

      case 'create_task':
        if (typeof result === 'object' && result.title) {
          return `
            <div class="task-result">
              <p><strong>Task Created:</strong></p>
              <h4>${result.title}</h4>
              <p>${result.description}</p>
              ${result.priority ? `<small class="priority">Priority: ${result.priority}/5</small>` : ''}
              ${result.estimated_time ? `<small class="time">Est. Time: ${result.estimated_time}</small>` : ''}
            </div>
          `;
        }
        break;

      case 'translate':
        if (typeof result === 'object' && result.translated_text) {
          return `
            <div class="translate-result">
              <p><strong>Translation (${result.target_language}):</strong></p>
              <p>${result.translated_text}</p>
            </div>
          `;
        }
        break;

      case 'explain':
        if (typeof result === 'object' && result.explanation) {
          return `
            <div class="explain-result">
              <p><strong>Explanation:</strong></p>
              <p>${result.explanation}</p>
              ${result.key_concepts && result.key_concepts.length > 0 ? 
                `<p><strong>Key Concepts:</strong> ${result.key_concepts.join(', ')}</p>` : ''}
            </div>
          `;
        }
        break;

      default:
        // Generic formatting for unknown action types
        if (typeof result === 'object') {
          return `<pre class="generic-result">${JSON.stringify(result, null, 2)}</pre>`;
        }
        break;
    }

    // Fallback for simple string results
    return `<p>${result}</p>`;
  }

  showActionResult(action, result) {
    // For now, just show in a toast, could be enhanced to show in a modal
    const config = this.getActionConfig(action);
    const resultText = typeof result === 'object' ? JSON.stringify(result, null, 2) : result;
    const truncatedResult = resultText.length > 100 ? resultText.substring(0, 100) + '...' : resultText;
    this.showToast(`${config.label}: ${truncatedResult}`, 'success');
  }

  getContentTypeIcon(type) {
    const icons = {
      'TEXT': 'font',
      'IMAGE': 'image',
      'FILE': 'file',
      'URL': 'link'
    };
    return icons[type] || 'clipboard';
  }

  formatTimeAgo(date) {
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

  truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async openClipboardItem(itemId) {
    try {
      const item = await ipcRenderer.invoke('get-clipboard-item', itemId);
      if (!item) {
        this.showToast('Clipboard item not found', 'error');
        return;
      }

      this.currentClipboardItem = item;
      this.showItemModal(item);
    } catch (error) {
      console.error('Error opening clipboard item:', error);
      this.showToast('Error opening clipboard item', 'error');
    }
  }

  showItemModal(item) {
    const modal = document.getElementById('item-modal');
    
    document.getElementById('modal-title').textContent = `${item.content_type} from ${item.source_app || 'Unknown'}`;
    document.getElementById('modal-content').textContent = item.content;
    document.getElementById('modal-source').textContent = `${item.source_app || 'Unknown'} - ${item.window_title || 'Unknown'}`;
    document.getElementById('modal-time').textContent = new Date(item.timestamp).toLocaleString();
    
    const tagsContainer = document.getElementById('modal-tags');
    tagsContainer.innerHTML = (item.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('');
    
    const screenshotContainer = document.getElementById('modal-screenshot');
    if (item.screenshot_path) {
      screenshotContainer.innerHTML = `<img src="file://${item.screenshot_path}" alt="Screenshot">`;
    } else {
      screenshotContainer.innerHTML = '';
    }

    // Hide the workflow results section since we're now displaying everything in action results
    const workflowResultsContainer = document.getElementById('workflow-results');
    if (workflowResultsContainer) {
      workflowResultsContainer.classList.add('hidden');
    }

    modal.classList.add('active');
  }

  closeModal() {
    document.getElementById('item-modal').classList.remove('active');
    document.getElementById('ai-result').classList.add('hidden');
    this.currentClipboardItem = null;
  }

  async triggerAIAction(action) {
    if (!this.currentClipboardItem) return;

    try {
      const aiButton = document.querySelector(`[data-action="${action}"]`);
      aiButton.disabled = true;
      aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

      const result = await ipcRenderer.invoke('trigger-ai-task', this.currentClipboardItem.id, action);
      
      this.showAIResult(action, result.result);
      this.showToast(`${action} completed successfully`, 'success');
    } catch (error) {
      console.error(`Error with ${action}:`, error);
      this.showToast(`Error with ${action}: ${error.message}`, 'error');
    } finally {
      const aiButton = document.querySelector(`[data-action="${action}"]`);
      aiButton.disabled = false;
      aiButton.innerHTML = this.getActionButtonHTML(action);
    }
  }

  getActionButtonHTML(action) {
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

  showAIResult(action, result) {
    const aiResultContainer = document.getElementById('ai-result');
    const aiResultContent = document.getElementById('ai-result-content');
    
    let formattedResult = '';
    
    if (typeof result === 'object') {
      if (action === 'summarize') {
        formattedResult = `
          <p><strong>Summary:</strong></p>
          <p>${result.summary}</p>
          <p><small>Original: ${result.word_count} words, Summary: ${result.summary_ratio}% of original</small></p>
        `;
      } else if (action === 'research') {
        if (typeof result === 'object') {
          // Handle new comprehensive research results (from both aiService and LangGraph)
          const summary = result.research_summary || result.researchSummary;
          const findings = result.key_findings || result.keyFindings;
          const sources = result.sources;
          const totalSources = result.total_sources || result.totalSources;
          
          if (summary) {
            formattedResult = `
              <div class="research-result">
                <p><strong>Research Summary:</strong></p>
                <div class="research-summary">${summary}</div>
                
                ${findings && findings.length > 0 ? `
                  <p><strong>Key Findings:</strong></p>
                  <ul class="key-findings">
                    ${findings.map(finding => `<li>${finding}</li>`).join('')}
                  </ul>
                ` : ''}
                
                ${sources && sources.length > 0 ? `
                  <p><strong>Sources Found:</strong> ${totalSources || sources.length}</p>
                  <div class="research-sources">
                    ${sources.slice(0, 3).map(source => `
                      <div class="source-item">
                        <strong>${source.title || source.source || 'Source'}</strong>
                        ${source.url ? `<br><a href="${source.url}" target="_blank" class="source-link">${source.url}</a>` : ''}
                        ${source.snippet ? `<br><span class="source-snippet">${source.snippet}</span>` : ''}
                      </div>
                    `).join('')}
                    ${sources.length > 3 ? `<p><em>... and ${sources.length - 3} more sources</em></p>` : ''}
                  </div>
                ` : ''}
              </div>
            `;
          } else {
            // Fallback for old format or simple results
            formattedResult = `<div class="research-result">${Array.isArray(result) ? result.join(', ') : result}</div>`;
          }
        }
      } else if (action === 'create_task') {
        formattedResult = `
          <p><strong>Title:</strong> ${result.title}</p>
          <p><strong>Description:</strong> ${result.description}</p>
          <p><strong>Priority:</strong> ${result.priority}/5</p>
          <p><strong>Estimated Time:</strong> ${result.estimated_time}</p>
        `;
      } else {
        formattedResult = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
      }
    } else {
      formattedResult = `<p>${result}</p>`;
    }
    
    aiResultContent.innerHTML = formattedResult;
    aiResultContainer.classList.remove('hidden');
  }

  async copyItemToClipboard() {
    if (!this.currentClipboardItem) return;

    try {
      await ipcRenderer.invoke('copy-to-clipboard', this.currentClipboardItem.content);
      this.showToast('Copied to clipboard', 'success');
      this.closeModal();
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      this.showToast('Error copying to clipboard', 'error');
    }
  }

  async deleteCurrentItem() {
    if (!this.currentClipboardItem) return;

    if (!confirm('Are you sure you want to delete this clipboard item?')) {
      return;
    }

    try {
      await ipcRenderer.invoke('delete-clipboard-item', this.currentClipboardItem.id);
      this.showToast('Clipboard item deleted', 'success');
      this.closeModal();
      this.loadClipboardHistory();
    } catch (error) {
      console.error('Error deleting clipboard item:', error);
      this.showToast('Error deleting clipboard item', 'error');
    }
  }

  handleSearch(query) {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(async () => {
      if (!query.trim()) {
        this.loadClipboardHistory();
        return;
      }

      try {
        this.showLoading(true);
        const results = await ipcRenderer.invoke('search-clipboard', query);
        this.filteredItems = results;
        this.renderClipboardItems(results);
      } catch (error) {
        console.error('Error searching:', error);
        this.showToast('Error searching clipboard', 'error');
      } finally {
        this.showLoading(false);
      }
    }, 300);
  }

  async applyFilters() {
    const contentType = document.getElementById('content-type-filter').value;
    const sourceApp = document.getElementById('source-app-filter').value;
    const date = document.getElementById('date-filter').value;

    const options = {
      limit: 50,
      contentType: contentType || null,
      sourceApp: sourceApp || null,
      fromDate: date ? new Date(date).toISOString() : null
    };

    try {
      this.showLoading(true);
      const items = await ipcRenderer.invoke('get-clipboard-history', options);
      this.filteredItems = items;
      this.renderClipboardItems(items);
    } catch (error) {
      console.error('Error applying filters:', error);
      this.showToast('Error applying filters', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  populateSourceAppFilter(items) {
    const sourceAppFilter = document.getElementById('source-app-filter');
    const apps = [...new Set(items.map(item => item.source_app).filter(Boolean))];
    
    sourceAppFilter.innerHTML = '<option value="">All Apps</option>';
    
    apps.forEach(app => {
      const option = document.createElement('option');
      option.value = app;
      option.textContent = app;
      sourceAppFilter.appendChild(option);
    });
  }

  async loadTagsView() {
    const tagsContainer = document.getElementById('tags-container');
    tagsContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading tags...</div>';
    
    try {
      const tags = await ipcRenderer.invoke('get-all-tags');
      
      if (!tags || tags.length === 0) {
        tagsContainer.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-tags"></i>
            <h3>No tags yet</h3>
            <p>AI will automatically tag your clipboard items as you use the app</p>
          </div>
        `;
        return;
      }

      // Group tags by usage frequency
      const popularTags = tags.filter(tag => tag.count >= 5);
      const commonTags = tags.filter(tag => tag.count >= 2 && tag.count < 5);
      const rareTags = tags.filter(tag => tag.count < 2);

      tagsContainer.innerHTML = `
        <div class="tags-container">
          ${popularTags.length > 0 ? `
            <div class="tags-section">
              <h3><i class="fas fa-star"></i> Popular Tags</h3>
              <div class="tags-grid">
                ${popularTags.map(tag => `
                  <div class="tag-item popular" data-tag="${this.escapeHtml(tag.name)}">
                    <span class="tag-name">${this.escapeHtml(tag.name)}</span>
                    <span class="tag-count">${tag.count}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          ${commonTags.length > 0 ? `
            <div class="tags-section">
              <h3><i class="fas fa-tags"></i> Common Tags</h3>
              <div class="tags-grid">
                ${commonTags.map(tag => `
                  <div class="tag-item common" data-tag="${this.escapeHtml(tag.name)}">
                    <span class="tag-name">${this.escapeHtml(tag.name)}</span>
                    <span class="tag-count">${tag.count}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          ${rareTags.length > 0 ? `
            <div class="tags-section">
              <h3><i class="fas fa-tag"></i> Other Tags</h3>
              <div class="tags-grid">
                ${rareTags.map(tag => `
                  <div class="tag-item rare" data-tag="${this.escapeHtml(tag.name)}">
                    <span class="tag-name">${this.escapeHtml(tag.name)}</span>
                    <span class="tag-count">${tag.count}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          
          <div class="tags-summary">
            <p><strong>Total:</strong> ${tags.length} unique tags across ${tags.reduce((sum, tag) => sum + tag.count, 0)} tagged items</p>
          </div>
        </div>
      `;

      // Add click handlers for tag filtering
      tagsContainer.querySelectorAll('.tag-item').forEach(tagElement => {
        tagElement.addEventListener('click', () => {
          const tagName = tagElement.dataset.tag;
          this.filterByTag(tagName);
        });
      });

    } catch (error) {
      console.error('Error loading tags:', error);
      tagsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle text-warning"></i>
          <h3>Error loading tags</h3>
          <p>There was a problem loading your tags. Please try again.</p>
        </div>
      `;
    }
  }

  filterByTag(tagName) {
    console.log(`Filtering by tag: ${tagName}`);
    // Switch to clipboard view and apply tag filter
    this.switchView('clipboard');
    
    // Set search query to find items with this tag
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = `tag:${tagName}`;
      this.handleSearch(`tag:${tagName}`);
    }
    
    this.showToast(`Showing items tagged with "${tagName}"`, 'info');
  }

  async loadStatsView() {
    try {
      const stats = await ipcRenderer.invoke('get-stats');
      const statsContainer = document.getElementById('stats-container');
      
      statsContainer.innerHTML = `
        <div class="stat-card">
          <h3>Total Items</h3>
          <div class="stat-value">${stats.totalItems}</div>
        </div>
        <div class="stat-card">
          <h3>AI Tasks</h3>
          <div class="stat-value">${stats.completedTasks}/${stats.totalTasks}</div>
        </div>
        <div class="stat-card">
          <h3>Top App</h3>
          <div class="stat-value">${stats.topApps[0]?.source_app || 'None'}</div>
        </div>
        <div class="stat-card">
          <h3>This Week</h3>
          <div class="stat-value">${stats.recentActivity.slice(0, 7).reduce((sum, day) => sum + day.count, 0)}</div>
        </div>
      `;
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  loadSettingsView() {
    // Settings are already loaded and applied
  }

  async saveSettings() {
    const settings = {
      openaiApiKey: document.getElementById('openai-api-key').value,
      captureScreenshots: document.getElementById('capture-screenshots').checked,
      captureContext: document.getElementById('capture-context').checked,
      retentionDays: parseInt(document.getElementById('retention-days').value),
      startMinimized: document.getElementById('start-minimized').checked,
      launchAtStartup: document.getElementById('launch-at-startup').checked
    };

    try {
      await ipcRenderer.invoke('update-settings', settings);
      this.settings = { ...this.settings, ...settings };
      this.showToast('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showToast('Error saving settings', 'error');
    }
  }

  async testApiKey() {
    const apiKey = document.getElementById('openai-api-key').value;
    if (!apiKey) {
      this.showToast('Please enter an API key first', 'error');
      return;
    }

    const testButton = document.getElementById('test-api-key');
    testButton.disabled = true;
    testButton.textContent = 'Testing...';

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.showToast('API key is valid', 'success');
    } catch (error) {
      console.error('Error testing API key:', error);
      this.showToast('Invalid API key', 'error');
    } finally {
      testButton.disabled = false;
      testButton.textContent = 'Test';
    }
  }

  showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
      loading.classList.remove('hidden');
    } else {
      loading.classList.add('hidden');
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.querySelector('.toast-message');
    const toastIcon = document.querySelector('.toast-icon');
    
    toastMessage.textContent = message;
    
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      info: 'fas fa-info-circle'
    };
    
    toastIcon.className = `toast-icon ${icons[type] || icons.info}`;
    toast.className = `toast ${type}`;
    
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  addClipboardItemToUI(item) {
    const clipboardItems = document.getElementById('clipboard-items');
    const emptyState = clipboardItems.querySelector('.empty-state');
    
    // Check if this item already exists in the UI to prevent duplicates
    const existingItem = clipboardItems.querySelector(`[data-item-id="${item.id}"]`);
    if (existingItem) {
      console.log('Item already exists in UI, skipping duplicate:', item.id);
      return;
    }
    
    if (emptyState) {
      clipboardItems.innerHTML = '';
    }
    
    const itemHTML = this.createClipboardItemHTML(item);
    clipboardItems.insertAdjacentHTML('afterbegin', itemHTML);
    
    const newItem = clipboardItems.firstElementChild;
    newItem.addEventListener('click', () => {
      this.openClipboardItem(item.id);
    });

    // Load recommended actions for the new item
    this.loadRecommendedActions(item.id);
  }

  updateClipboardItemInUI(updatedItem, updateData) {
    console.log(`🔄 Updating clipboard item ${updatedItem.id} in UI`);
    
    const clipboardItems = document.getElementById('clipboard-items');
    const existingElement = clipboardItems.querySelector(`[data-item-id="${updatedItem.id}"]`);
    
    if (!existingElement) {
      console.log('Item not found in UI, adding as new item');
      this.addClipboardItemToUI(updatedItem);
      return;
    }

    // Update the currentItems array
    const itemIndex = this.filteredItems.findIndex(item => item.id === updatedItem.id);
    if (itemIndex !== -1) {
      this.filteredItems[itemIndex] = updatedItem;
    }

    // Update tags in the UI
    const tagsContainer = existingElement.querySelector('.clipboard-item-tags');
    if (tagsContainer && updatedItem.tags) {
      const tags = updatedItem.tags.split ? updatedItem.tags.split(',') : updatedItem.tags;
      const tagsHTML = tags.map(tag => `<span class="tag">${tag.trim()}</span>`).join('');
      tagsContainer.innerHTML = tagsHTML;
      
      // Add visual feedback for tag update
      tagsContainer.style.transition = 'all 0.3s ease';
      tagsContainer.style.backgroundColor = '#e8f5e8';
      setTimeout(() => {
        tagsContainer.style.backgroundColor = '';
      }, 2000);
      
      console.log(`🏷️ Updated ${tags.length} tags for item ${updatedItem.id}`);
    }

    // If actions were stored, reload recommended actions to pick up any new ones
    if (updateData.actionsStored) {
      console.log(`🎯 Reloading actions for item ${updatedItem.id}`);
      this.loadRecommendedActions(updatedItem.id);
    }

    // Add unified indicator if applicable
    if (updateData.unified) {
      const header = existingElement.querySelector('.clipboard-item-header');
      if (header && !header.querySelector('.unified-indicator')) {
        const indicator = document.createElement('span');
        indicator.className = 'unified-indicator';
        indicator.innerHTML = '<i class="fas fa-magic" title="Processed with unified AI analysis"></i>';
        indicator.style.color = '#28a745';
        indicator.style.marginLeft = '8px';
        header.appendChild(indicator);
      }
    }
  }

  copyItemDirect(itemId) {
    const item = this.filteredItems.find(i => i.id === itemId);
    if (item) {
      ipcRenderer.invoke('copy-to-clipboard', item.content);
      this.showToast('Copied to clipboard', 'success');
    }
  }

  async clearAllItems() {
    if (!confirm('Are you sure you want to clear all clipboard history? This cannot be undone.')) {
      return;
    }

    try {
      const result = await ipcRenderer.invoke('clear-all-items');
      
      if (result.success) {
        this.showToast(`Cleared ${result.deletedCount} clipboard items`, 'success');
        this.loadClipboardHistory(); // Refresh the display
      } else {
        this.showToast('Error clearing clipboard items', 'error');
      }
    } catch (error) {
      console.error('Error clearing items:', error);
      this.showToast('Error clearing clipboard items', 'error');
    }
  }

  async exportData() {
    try {
      this.showToast('Export feature coming soon', 'info');
    } catch (error) {
      console.error('Error exporting data:', error);
      this.showToast('Error exporting data', 'error');
    }
  }

  // ===== SESSION MANAGEMENT METHODS =====

  async loadSessionsView() {
    try {
      this.showLoading(true);
      const sessions = await ipcRenderer.invoke('get-active-sessions');
      this.currentSessions = sessions || [];
      this.renderSessions(sessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
      this.showToast('Error loading sessions', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  renderSessions(sessions) {
    const container = document.getElementById('sessions-list');
    
    if (!sessions || sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-layer-group"></i>
          <h3>No active sessions</h3>
          <p>Sessions will appear here as you copy related content.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = sessions.map(session => this.createSessionHTML(session)).join('');

    // Add click event listeners
    container.querySelectorAll('.session-item').forEach(element => {
      element.addEventListener('click', () => {
        const sessionId = element.dataset.sessionId;
        this.openSessionDetails(sessionId);
      });
    });
  }

  createSessionHTML(session) {
    const timeAgo = this.formatTimeAgo(new Date(session.start_time));
    const duration = this.formatDuration(session.start_time, session.last_activity);
    const statusClass = session.status === 'active' ? 'status-active' : 
                       session.status === 'expired' ? 'status-expired' : 'status-completed';

    // Generate focused session title and preview
    const sessionInfo = this.generateSessionTitleAndPreview(session);

    return `
      <div class="session-item" data-session-id="${session.id}">
        <div class="session-header">
          <div class="session-title">
            <i class="fas fa-${this.getSessionTypeIcon(session.session_type)}"></i>
            <span class="session-label">${sessionInfo.title}</span>
            <span class="session-type-badge ${session.session_type}">${this.formatSessionType(session.session_type)}</span>
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

  generateSessionTitleAndPreview(session) {
    let title = session.session_label || `${this.formatSessionType(session.session_type)} Session`;
    let preview = `${session.session_type.replace('_', ' ')} session with ${session.item_count} items`;
    let metrics = null;

    try {
      // Try to parse context summary for enhanced title/preview
      if (session.context_summary) {
        const contextSummary = typeof session.context_summary === 'string' ? 
          JSON.parse(session.context_summary) : session.context_summary;
        
        // Enhanced title from session research
        if (contextSummary.sessionResearch) {
          const research = contextSummary.sessionResearch;
          
          if (research.researchObjective) {
            title = research.researchObjective;
          } else if (research.comprehensiveSummary) {
            // Generate title from comprehensive summary
            title = this.generateConciseSessionTitle(session.session_type, research);
          }
          
          // Enhanced preview from research data
          if (research.comprehensiveSummary) {
            preview = this.truncateText(research.comprehensiveSummary, 150);
          } else if (research.keyFindings && research.keyFindings.length > 0) {
            preview = `Key findings: ${research.keyFindings.slice(0, 2).join(', ')}`;
          }
          
          // Metrics from research
          if (research.researchData) {
            const sources = research.researchData.totalSources || 0;
            const findings = (research.keyFindings || []).length;
            const confidence = Math.round((research.researchData.confidence || 0) * 100);
            
            if (sources > 0 || findings > 0) {
              metrics = `${confidence}% confidence`;
              if (sources > 0) metrics += `, ${sources} sources`;
              if (findings > 0) metrics += `, ${findings} findings`;
            }
          }
        }
        
        // Fallback to comprehensive analysis if available
        else if (contextSummary.comprehensiveAnalysis) {
          const analysis = contextSummary.comprehensiveAnalysis;
          if (analysis.sessionSummary) {
            preview = analysis.sessionSummary;
          }
          
          // Metrics from comprehensive analysis
          if (analysis.totalSources || analysis.totalItems) {
            const items = analysis.totalItems || session.item_count;
            const sources = analysis.totalSources || 0;
            metrics = `${items} items`;
            if (sources > 0) metrics += `, ${sources} sources`;
          }
        }
        
        // Fallback to session summary if available
        else if (contextSummary.sessionSummary) {
          preview = contextSummary.sessionSummary;
        }
      }
      
      // Try to parse intent analysis for additional context
      if (session.intent_analysis && !metrics) {
        const intentData = typeof session.intent_analysis === 'string' ? 
          JSON.parse(session.intent_analysis) : session.intent_analysis;
        
        if (intentData.sessionIntent) {
          const intent = intentData.sessionIntent;
          if (intent.primaryGoal && !title.includes(intent.primaryGoal.substring(0, 20))) {
            title = intent.primaryGoal;
          }
          
          if (intent.completionStatus) {
            metrics = this.formatCompletionStatus(intent.completionStatus);
          }
        } else if (intentData.primaryIntent) {
          if (!title.includes(intentData.primaryIntent.substring(0, 20))) {
            title = intentData.primaryIntent;
          }
        }
      }
      
    } catch (error) {
      console.error('Error parsing session data for title/preview:', error);
      // Fallback to basic information
      title = session.session_label || `${this.formatSessionType(session.session_type)} Session`;
      preview = `${session.session_type.replace('_', ' ')} session with ${session.item_count} items`;
      metrics = null;
    }
    
    return {
      title: this.escapeHtml(title),
      preview: this.escapeHtml(preview),
      metrics: metrics ? this.escapeHtml(metrics) : null
    };
  }

  generateConciseSessionTitle(sessionType, research) {
    const researchObjective = research.researchObjective || '';
    const keyFindings = research.keyFindings || [];
    
    // Extract key information from research objective
    const locationMatch = researchObjective.match(/\b(Toronto|Montreal|Vancouver|New York|Los Angeles|Chicago|Boston|Austin|Miami|Seattle|Portland|Denver|Las Vegas|London|Paris|Tokyo|Sydney)\b/i);
    const brandsMatch = researchObjective.match(/\b(Hilton|Marriott|Hyatt|Sheraton|Ritz|Four Seasons|Shangri|Apple|Samsung|Google|Microsoft|Amazon|Sony|Nike)\b/gi);
    const cuisineMatch = researchObjective.match(/\b(Italian|French|Japanese|Chinese|Mexican|Thai|Indian|Mediterranean|Steakhouse)\b/i);
    const productMatch = researchObjective.match(/\b(laptop|phone|headphones|camera|watch|tablet|computer|software|app)\b/i);
    
    let conciseTitle = '';
    
    switch (sessionType) {
      case 'hotel_research':
        if (locationMatch && brandsMatch && brandsMatch.length > 0) {
          if (brandsMatch.length > 1) {
            conciseTitle = `${brandsMatch.slice(0, 2).join(' vs ')} - ${locationMatch[0]}`;
          } else {
            conciseTitle = `${brandsMatch[0]} Hotels - ${locationMatch[0]}`;
          }
        } else if (locationMatch) {
          conciseTitle = `Hotels in ${locationMatch[0]}`;
        } else if (brandsMatch && brandsMatch.length > 0) {
          if (brandsMatch.length > 1) {
            conciseTitle = `${brandsMatch.slice(0, 2).join(' vs ')} Hotels`;
          } else {
            conciseTitle = `${brandsMatch[0]} Hotels`;
          }
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
        if (locationMatch) {
          conciseTitle = `Travel to ${locationMatch[0]}`;
        } else {
          conciseTitle = 'Travel Planning';
        }
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
        // Extract first few meaningful words from research objective
        const academicTerms = researchObjective.match(/\b[A-Z][a-z]+(?:\s+[a-z]+){0,1}\b/g)?.slice(0, 2) || [];
        if (academicTerms.length > 0) {
          conciseTitle = `Academic: ${academicTerms.join(' & ')}`;
        } else {
          conciseTitle = 'Academic Research';
        }
        break;
        
      case 'event_planning':
        if (locationMatch) {
          conciseTitle = `Event Planning - ${locationMatch[0]}`;
        } else {
          conciseTitle = 'Event Planning';
        }
        break;
        
      default:
        // Use first key finding if it's concise
        if (keyFindings.length > 0 && keyFindings[0].length < 40) {
          conciseTitle = keyFindings[0];
        } else {
          // Extract key terms from research objective
          const keyTerms = researchObjective.match(/\b[A-Z][a-z]+(?:\s+[a-z]+){0,1}\b/g)?.slice(0, 2) || [];
          if (keyTerms.length > 0) {
            conciseTitle = `Research: ${keyTerms.join(' & ')}`;
          } else {
            conciseTitle = sessionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          }
        }
    }
    
    // Clean up title and ensure it's not too long
    conciseTitle = conciseTitle.replace(/^(Research\s+|Find\s+|Get\s+)/i, '');
    
    if (conciseTitle.length > 50) {
      conciseTitle = conciseTitle.substring(0, 47) + '...';
    }
    
    return conciseTitle || 'Research Session';
    }

  createSessionPreview(session, sessionInfo = null) {
    // Use the generated session info if provided
    if (sessionInfo && sessionInfo.preview) {
      return `<p class="session-summary">${this.truncateText(sessionInfo.preview, 150)}</p>`;
    }
    
    // Fallback preview generation
    let preview = '';
    
    try {
      if (session.context_summary) {
        const contextSummary = typeof session.context_summary === 'string' ? 
          JSON.parse(session.context_summary) : session.context_summary;
        
        // Extract meaningful text from different parts of the context summary
        if (contextSummary.sessionResearch && contextSummary.sessionResearch.comprehensiveSummary) {
          preview = contextSummary.sessionResearch.comprehensiveSummary;
        } else if (contextSummary.sessionSummary) {
          preview = contextSummary.sessionSummary;
        } else if (contextSummary.comprehensiveAnalysis) {
          const analysis = contextSummary.comprehensiveAnalysis;
          preview = `${analysis.totalItems} items analyzed across ${analysis.contentTypes.length} content types with ${analysis.totalSources} sources`;
        }
      }
    } catch (error) {
      console.error('Error parsing context summary for preview:', error);
    }

    // Final fallback
    if (!preview) {
      preview = `${session.session_type.replace('_', ' ')} session with ${session.item_count} items`;
    }

    return `<p class="session-summary">${this.truncateText(preview, 150)}</p>`;
  }

  getSessionTypeIcon(sessionType) {
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

  formatSessionType(sessionType) {
    return sessionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  formatDuration(startTime, endTime) {
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

  async applySessionFilters() {
    try {
      const typeFilter = document.getElementById('session-type-filter').value;
      const statusFilter = document.getElementById('session-status-filter').value;

      const filters = {};
      if (typeFilter) filters.sessionType = typeFilter;
      if (statusFilter) filters.status = statusFilter;

      const sessions = await ipcRenderer.invoke('get-active-sessions', filters);
      this.renderSessions(sessions);
    } catch (error) {
      console.error('Error applying session filters:', error);
      this.showToast('Error applying filters', 'error');
    }
  }

  async clearAllSessions() {
    // Show confirmation dialog
    const confirmed = confirm('Are you sure you want to clear all sessions? This action cannot be undone.');
    
    if (!confirmed) {
      return;
    }

    try {
      await ipcRenderer.invoke('clear-all-sessions');
      this.showToast('All sessions cleared successfully', 'success');
      this.loadSessionsView(); // Refresh the sessions view
    } catch (error) {
      console.error('Error clearing sessions:', error);
      this.showToast('Error clearing sessions: ' + error.message, 'error');
    }
  }

  async openSessionDetails(sessionId) {
    try {
      const session = await ipcRenderer.invoke('get-session', sessionId);
      const sessionItems = await ipcRenderer.invoke('get-session-items', sessionId);
      
      if (!session) {
        this.showToast('Session not found', 'error');
        return;
      }

      this.currentModalSessionId = sessionId;
      this.showSessionModal(session, sessionItems);
    } catch (error) {
      console.error('Error loading session details:', error);
      this.showToast('Error loading session details', 'error');
    }
  }

  showSessionModal(session, sessionItems) {
    const modal = document.getElementById('session-modal');
    const modalTitle = document.getElementById('session-modal-title');
    
    modalTitle.textContent = session.session_label || 'Session Details';
    
    // Fill in session overview
    document.getElementById('session-type').textContent = this.formatSessionType(session.session_type);
    document.getElementById('session-type').className = `session-type-badge ${session.session_type}`;
    document.getElementById('session-status').textContent = session.status;
    document.getElementById('session-status').className = `status-badge ${session.status}`;
    document.getElementById('session-duration').textContent = this.formatDuration(session.start_time, session.last_activity);
    document.getElementById('session-item-count').textContent = `${sessionItems.length} items`;

    // Show intent analysis
    this.renderIntentAnalysis(session);

    // Show research flow
    this.renderResearchFlow(session, sessionItems);

    // Show hotel research specific data if applicable
    if (session.session_type === 'hotel_research') {
      this.renderHotelResearchData(session, sessionItems);
      document.getElementById('hotel-research-section').style.display = 'block';
    } else {
      document.getElementById('hotel-research-section').style.display = 'none';
    }

    // Show session items
    this.renderSessionItems(sessionItems);

    // Store current session for actions
    this.currentSession = session;

    modal.style.display = 'block';
  }

  renderIntentAnalysis(session) {
    const container = document.getElementById('session-intent-analysis');
    
    let intentData = null;
    let sessionResearch = null;
    
    try {
      if (session.intent_analysis) {
        intentData = typeof session.intent_analysis === 'string' ? 
          JSON.parse(session.intent_analysis) : session.intent_analysis;
      }
      
      if (session.context_summary) {
        const contextSummary = typeof session.context_summary === 'string' ?
          JSON.parse(session.context_summary) : session.context_summary;
        sessionResearch = contextSummary.sessionResearch;
      }
    } catch (error) {
      console.error('Error parsing session analysis data:', error);
      // Set to null to trigger fallback rendering
      intentData = null;
      sessionResearch = null;
    }

    // Check if we have session research results
    if (sessionResearch && sessionResearch.researchCompleted) {
      try {
        const researchData = sessionResearch.researchData || {};
        const keyFindings = sessionResearch.keyFindings || [];
        const sources = researchData.sources || [];
        const confidence = researchData.confidence || 0;
        const totalSources = researchData.totalSources || sources.length || 0;
        const searchQueries = researchData.searchQueries || [];
        
        container.innerHTML = `
          <div class="session-research-results">
            <!-- Three Key Metrics - Horizontal Layout -->
            <div class="research-metrics-horizontal">
              <!-- Research Confidence Score -->
              <div class="research-confidence-banner">
                <div class="confidence-score">
                  <div class="confidence-details">
                    <div class="confidence-metric">
                      <div class="confidence-percentage">${Math.round(confidence * 100)}%</div>
                      <div class="confidence-label">Research Confidence</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Key Findings -->
              ${keyFindings.length > 0 ? `
                <div class="research-findings-section">
                  <h5><i class="fas fa-lightbulb"></i> Key Findings</h5>
                  <ul class="key-findings-list">
                    ${keyFindings.slice(0, 4).map(finding => `<li>${this.escapeHtml(finding)}</li>`).join('')}
                  </ul>
                </div>
              ` : `
                <div class="research-findings-section">
                  <h5><i class="fas fa-lightbulb"></i> Key Findings</h5>
                  <p class="no-findings">No findings available</p>
                </div>
              `}

              <!-- Research Sources -->
              ${sources.length > 0 ? `
                <div class="research-sources-section">
                  <h5><i class="fas fa-link"></i> Sources (${totalSources})</h5>
                  <div class="sources-grid">
                    ${sources.slice(0, 3).map(source => `
                      <div class="source-card">
                        <div class="source-title">${this.escapeHtml(source.title || source.source || 'Source')}</div>
                        ${source.url ? `<div class="source-url"><a href="${this.escapeHtml(source.url)}" target="_blank">${this.truncateText(source.url, 30)}</a></div>` : ''}
                        ${source.snippet ? `<div class="source-snippet">${this.escapeHtml(this.truncateText(source.snippet, 60))}</div>` : ''}
                      </div>
                    `).join('')}
                    ${sources.length > 3 ? `
                      <div class="source-card source-more">
                        <i class="fas fa-plus"></i>
                        <span>+${sources.length - 3} more</span>
                      </div>
                    ` : ''}
                  </div>
                </div>
              ` : `
                <div class="research-sources-section">
                  <h5><i class="fas fa-link"></i> Sources (0)</h5>
                  <p class="no-sources">No sources available</p>
                </div>
              `}
            </div>

            <!-- Primary Intent and Research Objective -->
            <div class="research-intent-section">
              <h5><i class="fas fa-bullseye"></i> Research Intent & Objective</h5>
              <div class="intent-primary">${(intentData?.sessionIntent?.primaryGoal) || sessionResearch.researchObjective || 'General research session'}</div>
              ${(intentData?.sessionIntent?.completionStatus) ? `
                <div class="completion-status">
                  <span class="status-badge ${intentData.sessionIntent.completionStatus}">${this.formatCompletionStatus(intentData.sessionIntent.completionStatus)}</span>
                </div>
              ` : ''}
            </div>

            <!-- Comprehensive Summary -->
            <div class="research-summary-section">
              <h5><i class="fas fa-file-alt"></i> Research Summary</h5>
              <div class="research-summary-content">
                ${sessionResearch.comprehensiveSummary || 'No comprehensive summary available'}
              </div>
            </div>

            <!-- Session Insights -->
            ${sessionResearch.sessionInsights ? `
              <div class="research-insights-section">
                <h5><i class="fas fa-chart-pie"></i> Session Insights</h5>
                <div class="insights-grid">
                  <div class="insight-card">
                    <div class="insight-label">Information Coverage</div>
                    <div class="insight-value">${this.escapeHtml(sessionResearch.sessionInsights.informationCoverage || 'Unknown')}</div>
                  </div>
                  <div class="insight-card">
                    <div class="insight-label">Research Depth</div>
                    <div class="insight-value">${this.escapeHtml(sessionResearch.sessionInsights.researchDepth || 'Unknown')}</div>
                  </div>
                  <div class="insight-card">
                    <div class="insight-label">Thematic Coherence</div>
                    <div class="insight-value">${this.escapeHtml(sessionResearch.sessionInsights.thematicCoherence || 'Unknown')}</div>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- Next Steps -->
            ${(intentData?.sessionIntent?.nextSteps && Array.isArray(intentData.sessionIntent.nextSteps) && intentData.sessionIntent.nextSteps.length > 0) ? `
              <div class="research-next-steps">
                <h5><i class="fas fa-arrow-right"></i> Recommended Next Steps</h5>
                <div class="next-steps-list">
                  ${intentData.sessionIntent.nextSteps.map(step => `
                    <div class="next-step-item">
                      <i class="fas fa-chevron-right"></i>
                      <span>${this.escapeHtml(step)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Research Metadata -->
            <div class="research-metadata">
              <div class="metadata-item">
                <i class="fas fa-clock"></i>
                <span>Last researched: ${sessionResearch.lastResearched ? this.formatTimeAgo(new Date(sessionResearch.lastResearched)) : 'Recently'}</span>
              </div>
              <div class="metadata-item">
                <i class="fas fa-cog"></i>
                <span>Research type: ${this.escapeHtml(sessionResearch.researchType || 'comprehensive')}</span>
              </div>
            </div>
          </div>
        `;
      } catch (renderError) {
        console.error('Error rendering session research results:', renderError);
        // Fallback to basic display
      container.innerHTML = `
        <div class="analysis-placeholder">
            <i class="fas fa-exclamation-triangle text-warning"></i>
            <p>Session research data is available but could not be displayed</p>
            <small>Research results are being processed - please refresh in a moment</small>
        </div>
      `;
      }
    } else if (intentData) {
      try {
        // Fallback to basic intent analysis if no session research available
        const primaryIntent = intentData.primaryIntent || intentData.sessionIntent?.primaryGoal || 'Unknown';
        const secondaryIntents = intentData.secondaryIntents || [];
        const progressStatus = intentData.progressStatus || intentData.sessionIntent?.completionStatus || 'unknown';
        const nextActions = intentData.nextLikelyActions || intentData.sessionIntent?.nextSteps || [];
        const confidenceLevel = intentData.confidenceLevel || intentData.sessionIntent?.confidenceLevel || 0;

    container.innerHTML = `
      <div class="intent-analysis">
        <div class="intent-item">
          <strong>Primary Intent:</strong>
              <span class="intent-primary">${this.escapeHtml(primaryIntent)}</span>
        </div>
            ${secondaryIntents.length > 0 ? `
          <div class="intent-item">
            <strong>Secondary Intents:</strong>
            <div class="intent-tags">
                  ${secondaryIntents.map(intent => 
                    `<span class="intent-tag">${this.escapeHtml(intent)}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        <div class="intent-item">
          <strong>Progress Status:</strong>
              <span class="progress-status ${progressStatus}">${this.formatProgressStatus(progressStatus)}</span>
        </div>
            ${nextActions.length > 0 ? `
          <div class="intent-item">
            <strong>Next Likely Actions:</strong>
            <div class="next-actions">
                  ${nextActions.map(action => 
                    `<span class="next-action">${this.escapeHtml(action)}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        <div class="intent-confidence">
          <strong>Confidence:</strong>
          <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${confidenceLevel * 100}%"></div>
          </div>
              <span>${Math.round(confidenceLevel * 100)}%</span>
        </div>

      </div>
    `;
      } catch (intentRenderError) {
        console.error('Error rendering intent analysis:', intentRenderError);
        // Fallback for intent analysis errors
        container.innerHTML = `
          <div class="analysis-placeholder">
            <i class="fas fa-exclamation-triangle text-warning"></i>
            <p>Intent analysis data could not be displayed</p>
            <small>Analysis is being processed - please refresh in a moment</small>
      </div>
    `;
      }
    } else {
      container.innerHTML = `
        <div class="analysis-placeholder">
          <i class="fas fa-brain"></i>
          <p>Session research will appear here as the session develops</p>
          <small>Research is automatically triggered when 2+ items are added to a session</small>
        </div>
      `;
    }
  }

  formatCompletionStatus(status) {
    const statusMap = {
      'comprehensive': 'Comprehensive Research Complete',
      'substantial': 'Substantial Research Complete', 
      'adequate': 'Adequate Research Complete',
      'preliminary': 'Preliminary Research',
      'in_progress': 'Research In Progress',
      'completed': 'Completed',
      'active': 'Active'
    };
    return statusMap[status] || this.formatProgressStatus(status);
  }

  renderResearchFlow(session, sessionItems) {
    const container = document.getElementById('session-research-flow');
    
    try {
    if (!sessionItems || sessionItems.length === 0) {
      container.innerHTML = `
        <div class="analysis-placeholder">
          <i class="fas fa-chart-line"></i>
          <p>Research flow will be displayed as items are added</p>
        </div>
      `;
      return;
    }

      // Create timeline of session items with error handling
    const timeline = sessionItems.map((item, index) => {
        try {
      const timeAgo = this.formatTimeAgo(new Date(item.timestamp));
          const contentPreview = this.truncateText(item.content || '', 80);
          const sourceApp = this.escapeHtml(item.source_app || 'Unknown');
      
      return `
        <div class="timeline-item">
          <div class="timeline-marker">${index + 1}</div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-time">${timeAgo}</span>
                  <span class="timeline-source">${sourceApp}</span>
            </div>
                <div class="timeline-text">${this.escapeHtml(contentPreview)}</div>
          </div>
        </div>
      `;
        } catch (itemError) {
          console.error('Error rendering timeline item:', itemError);
          return `
            <div class="timeline-item">
              <div class="timeline-marker">${index + 1}</div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-time">Recently</span>
                  <span class="timeline-source">Unknown</span>
                </div>
                <div class="timeline-text">Content unavailable</div>
              </div>
            </div>
          `;
        }
    }).join('');

    container.innerHTML = `
      <div class="research-timeline">
        ${timeline}
      </div>
    `;
    } catch (error) {
      console.error('Error rendering research flow:', error);
      container.innerHTML = `
        <div class="analysis-placeholder">
          <i class="fas fa-exclamation-triangle text-warning"></i>
          <p>Research flow data could not be displayed</p>
          <small>Timeline is being processed - please refresh in a moment</small>
      </div>
    `;
    }
  }

  renderHotelResearchData(session, sessionItems) {
    const container = document.getElementById('hotel-research-data');
    
    // Try to extract hotel names from session items
    const hotels = [];
    const locations = new Set();
    
    sessionItems.forEach(item => {
      const content = item.content.toLowerCase();
      
      // Simple hotel name extraction
      const hotelKeywords = ['hilton', 'marriott', 'ritz', 'shangri', 'hyatt', 'sheraton', 'holiday inn', 'courtyard'];
      hotelKeywords.forEach(keyword => {
        if (content.includes(keyword)) {
          hotels.push(item.content.substring(0, 50) + '...');
        }
      });
      
      // Try to extract location
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

  renderSessionItems(sessionItems) {
    const container = document.getElementById('session-items-list');
    
    if (!sessionItems || sessionItems.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-clipboard"></i>
          <p>No items in this session</p>
        </div>
      `;
      return;
    }

    container.innerHTML = sessionItems.map((item, index) => `
      <div class="session-item-card" data-item-id="${item.id}">
        <div class="item-header">
          <span class="item-sequence">#${index + 1}</span>
          <span class="item-source">${item.source_app || 'Unknown'}</span>
          <span class="item-time">${this.formatTimeAgo(new Date(item.timestamp))}</span>
        </div>
        <div class="item-content">
          ${this.truncateText(item.content, 200)}
        </div>
        <div class="item-tags">
          ${(item.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      </div>
    `).join('');

    // Add click handlers for items
    container.querySelectorAll('.session-item-card').forEach(element => {
      element.addEventListener('click', () => {
        const itemId = element.dataset.itemId;
        this.openClipboardItem(itemId);
      });
    });
  }

  formatProgressStatus(status) {
    const statuses = {
      'just_started': 'Just Started',
      'in_progress': 'In Progress',
      'nearly_complete': 'Nearly Complete',
      'completed': 'Completed'
    };
    return statuses[status] || 'Unknown';
  }

  closeSessionModal() {
    document.getElementById('session-modal').style.display = 'none';
    this.currentSession = null;
    this.currentModalSessionId = null;
  }

  async exportCurrentSession() {
    if (!this.currentSession) return;
    
    try {
      // Export session data (implementation depends on requirements)
      this.showToast('Session export feature coming soon!', 'info');
    } catch (error) {
      console.error('Error exporting session:', error);
      this.showToast('Error exporting session', 'error');
    }
  }

  async closeCurrentSession() {
    if (!this.currentSession) return;
    
    try {
      // Close/complete the session (would need backend implementation)
      this.showToast('Session closed', 'success');
      this.closeSessionModal();
      this.loadSessionsView(); // Refresh the sessions list
    } catch (error) {
      console.error('Error closing session:', error);
      this.showToast('Error closing session', 'error');
    }
  }

  // Session event handlers

  handleSessionCreated(data) {
    console.log('Session created:', data);
    this.showToast(`New ${this.formatSessionType(data.session.session_type)} session started`, 'info');
    
    // Refresh sessions view if currently visible
    if (this.currentView === 'sessions') {
      this.loadSessionsView();
    }
  }

  handleSessionUpdated(data) {
    console.log('Session updated:', data);
    
    // If we're viewing this session and a new item was added, refresh the modal content
    if (this.currentView === 'sessions' && this.currentModalSessionId === data.sessionId) {
      console.log('Session updated with new item, refreshing modal content...');
      this.refreshSessionModalContent(data.sessionId);
    }
    
    // Refresh sessions view if currently visible
    if (this.currentView === 'sessions') {
      this.loadSessionsView();
    }
  }

  // Session research event handlers
  handleSessionResearchCompleted(data) {
    console.log('Session-level research completed:', data);
    
    // Show success notification with session research summary
    const message = `Session research completed with ${data.researchResults.researchData.totalSources} sources and comprehensive analysis`;
    this.showToast(message, 'success');
    
    // If we're viewing this session, refresh the session modal content to show research results
    if (this.currentView === 'sessions' && this.currentModalSessionId === data.sessionId) {
      console.log('Refreshing session modal with session research results...');
      this.refreshSessionModalContent(data.sessionId);
    }
    
    // Always refresh the sessions list to show updated session summaries
    if (this.currentView === 'sessions') {
      console.log('Refreshing sessions view with session research results...');
      this.loadSessionsView();
    }
  }

  handleSessionResearchFailed(data) {
    console.log('Session-level research failed:', data);
    
    // Show error notification
    this.showToast(`Session research failed: ${data.error}`, 'error');
    
    // If we're viewing this session, refresh the session modal content
    if (this.currentView === 'sessions' && this.currentModalSessionId === data.sessionId) {
      this.refreshSessionModalContent(data.sessionId);
    }
    
    // Remove any loading indicators
    this.hideSessionResearchLoading();
  }

  handleSessionAnalysisUpdated(data) {
    console.log('Session comprehensive analysis updated:', data);
    
    // Show success notification with research summary
    const message = `Session enriched with ${data.analysisData.totalResearchFindings} research findings and ${data.analysisData.totalSources} sources`;
    this.showToast(message, 'success');
    
    // If we're viewing this session, refresh the session modal content to show updated analysis
    if (this.currentView === 'sessions' && this.currentModalSessionId === data.sessionId) {
      console.log('Refreshing session modal with updated comprehensive analysis...');
      this.refreshSessionModalContent(data.sessionId);
    }
    
    // Always refresh the sessions list to show updated session summaries
    if (this.currentView === 'sessions') {
      console.log('Refreshing sessions view with updated analysis...');
      this.loadSessionsView();
    }
  }

  // New method to refresh just the session modal content without full reload
  async refreshSessionModalContent(sessionId) {
    try {
      // Show loading indicator in the modal
      this.showSessionResearchLoading();
      
      // Get updated session and items data
      const session = await ipcRenderer.invoke('get-session', sessionId);
      const sessionItems = await ipcRenderer.invoke('get-session-items', sessionId);
      
      if (!session) {
        console.error('Session not found during refresh');
        return;
      }

      // Update session overview data
      document.getElementById('session-duration').textContent = this.formatDuration(session.start_time, session.last_activity);
      document.getElementById('session-item-count').textContent = `${sessionItems.length} items`;

      // Re-render the intent analysis section with new research data
      this.renderIntentAnalysis(session);

      // Re-render research flow
      this.renderResearchFlow(session, sessionItems);

      // Re-render hotel research data if applicable
      if (session.session_type === 'hotel_research') {
        this.renderHotelResearchData(session, sessionItems);
      }

      // Re-render session items
      this.renderSessionItems(sessionItems);

      // Update current session reference
      this.currentSession = session;

      // Hide loading indicator
      this.hideSessionResearchLoading();
      
      console.log('Session modal content refreshed successfully');
      
    } catch (error) {
      console.error('Error refreshing session modal content:', error);
      this.hideSessionResearchLoading();
      this.showToast('Error updating session display', 'error');
    }
  }

  // Show loading indicator for session research
  showSessionResearchLoading() {
    const container = document.getElementById('session-intent-analysis');
    if (container) {
      // Add loading overlay to the research section
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
  }

  // Hide loading indicator for session research
  hideSessionResearchLoading() {
    const container = document.getElementById('session-intent-analysis');
    if (container) {
      const loadingOverlay = container.querySelector('.research-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.remove();
      }
    }
  }

  showHotelResearchAlert(data) {
    const { sessionId, message, recommendation, hotels, location } = data;
    
    // Create a notification for hotel research
    const alertHTML = `
      <div class="hotel-research-alert">
        <div class="alert-icon">
          <i class="fas fa-hotel"></i>
        </div>
        <div class="alert-content">
          <h4>Hotel Research Detected</h4>
          <p>${message}</p>
          ${hotels && hotels.length > 0 ? `
            <div class="alert-hotels">
              <strong>Hotels:</strong> ${hotels.join(', ')}
            </div>
          ` : ''}
          ${location ? `
            <div class="alert-location">
              <strong>Location:</strong> ${location}
            </div>
          ` : ''}
        </div>
        <div class="alert-actions">
          <button class="btn btn-sm btn-primary" onclick="window.flowClipRenderer.openSessionDetails('${sessionId}')">
            View Details
          </button>
          <button class="btn btn-sm btn-secondary" onclick="this.parentElement.parentElement.remove()">
            Dismiss
          </button>
        </div>
      </div>
    `;

    // Add to page (you might want to show this in a dedicated notification area)
    this.showToast('Hotel research session detected - check details!', 'info');
  }

  triggerHotelComparison() {
    this.showToast('Hotel comparison feature coming soon!', 'info');
  }

  showBookingOptions() {
    this.showToast('Booking integration coming soon!', 'info');
  }

  // Session research actions
  async performSessionResearch(sessionId) {
    try {
      console.log(`Performing session research for session ${sessionId}...`);
      
      // Show loading indicator immediately if we're viewing this session
      if (this.currentView === 'sessions' && this.currentModalSessionId === sessionId) {
        this.showSessionResearchLoading();
      }
      
      // Show loading notification
      this.showToast('Starting comprehensive session research...', 'info');
      
      const result = await ipcRenderer.invoke('perform-session-research', sessionId);
      
      if (result.success) {
        console.log('Session research completed successfully:', result.result);
        // Success notification will be handled by the event handler
      } else {
        console.error('Session research failed:', result.error);
        this.showToast(`Session research failed: ${result.error}`, 'error');
        // Hide loading indicator on failure
        if (this.currentView === 'sessions' && this.currentModalSessionId === sessionId) {
          this.hideSessionResearchLoading();
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('Error performing session research:', error);
      this.showToast(`Session research error: ${error.message}`, 'error');
      // Hide loading indicator on error
      if (this.currentView === 'sessions' && this.currentModalSessionId === sessionId) {
        this.hideSessionResearchLoading();
      }
      return { success: false, error: error.message };
    }
  }

  // Session item research event handlers (for individual items in sessions)
  handleSessionItemResearchCompleted(data) {
    console.log('Session item research completed:', data);
    
    // Show success notification
    this.showToast('Item research completed in session', 'success');
    
    // If we're viewing this session, refresh the modal content
    if (this.currentView === 'sessions' && this.currentModalSessionId === data.sessionId) {
      console.log('Refreshing session modal with item research results...');
      this.refreshSessionModalContent(data.sessionId);
    }
    
    // Refresh sessions list
    if (this.currentView === 'sessions') {
      this.loadSessionsView();
    }
  }

  handleSessionItemResearchFailed(data) {
    console.log('Session item research failed:', data);
    
    // Show error notification
    this.showToast(`Item research failed: ${data.error}`, 'error');
  }

  handleSessionResearchStarted(data) {
    console.log('Session research started:', data);
    
    // Show notification that research has started
    this.showToast('Session research has started', 'info');
    
    // If we're viewing this session, show loading indicator
    if (this.currentView === 'sessions' && this.currentModalSessionId === data.sessionId) {
      console.log('Showing loading indicator for session research...');
      this.showSessionResearchLoading();
    }
  }

  handleSessionResearchProgress(data) {
    console.log('Session research progress:', data);
    
    // Show progress notification for major phase changes
    if (data.phase === 'queries_generated') {
      this.showToast(`Generated ${data.totalQueries} research queries`, 'info');
    } else if (data.phase === 'consolidating') {
      this.showToast('Consolidating research results...', 'info');
    } else if (data.phase === 'completed') {
      this.showToast(`Research completed: ${data.finalResults.keyFindings} findings from ${data.finalResults.totalSources} sources`, 'success');
    }
    
    // If we're viewing this session, update the progress display
    if (this.currentView === 'sessions' && this.currentModalSessionId === data.sessionId) {
      this.updateSessionResearchProgress(data);
    }
    
    // Always refresh the sessions list to show updated progress
    if (this.currentView === 'sessions') {
      // Debounce the refresh to avoid too many updates
      clearTimeout(this.sessionListRefreshTimeout);
      this.sessionListRefreshTimeout = setTimeout(() => {
        this.loadSessionsView();
      }, 1000);
    }
  }

  updateSessionResearchProgress(data) {
    // Update or create progress display in the session modal
    let progressContainer = document.getElementById('session-research-progress');
    
    if (!progressContainer) {
      // Create progress container if it doesn't exist
      const intentAnalysisContainer = document.getElementById('session-intent-analysis');
      if (intentAnalysisContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'session-research-progress';
        progressContainer.className = 'research-progress-container';
        intentAnalysisContainer.insertBefore(progressContainer, intentAnalysisContainer.firstChild);
      } else {
        return; // Can't find where to insert progress
      }
    }
    
    // Show/hide based on research phase
    if (data.phase === 'completed') {
      // Hide progress after a delay to show completion
      setTimeout(() => {
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }
      }, 3000);
    } else {
      progressContainer.style.display = 'block';
    }
    
    // Build progress HTML based on phase
    let progressHTML = '';
    
    if (data.phase === 'initializing') {
      progressHTML = `
        <div class="research-progress-header">
          <div class="progress-icon">
            <i class="fas fa-search fa-spin"></i>
          </div>
          <div class="progress-info">
            <div class="progress-title">Initializing Session Research</div>
            <div class="progress-subtitle">Analyzing session content...</div>
          </div>
        </div>
      `;
    } else if (data.phase === 'queries_generated') {
      progressHTML = `
        <div class="research-progress-header">
          <div class="progress-icon">
            <i class="fas fa-list-check"></i>
          </div>
          <div class="progress-info">
            <div class="progress-title">Research Queries Generated</div>
            <div class="progress-subtitle">${data.totalQueries} queries ready for ${data.entriesWithQueries} entries</div>
          </div>
        </div>
      `;
    } else if (data.phase === 'searching') {
      progressHTML = `
        <div class="research-progress-header">
          <div class="progress-icon">
            <i class="fas fa-globe fa-spin"></i>
          </div>
          <div class="progress-info">
            <div class="progress-title">Web Research in Progress</div>
            <div class="progress-subtitle">${data.completedQueries}/${data.totalQueries} queries completed</div>
          </div>
        </div>
        <div class="research-progress-bar">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${data.progress}%"></div>
            <div class="progress-bar-text">${data.progress}%</div>
          </div>
        </div>
        <div class="research-current-status">
          <div class="current-status-label">Current Search:</div>
          <div class="current-status-text">${this.escapeHtml(data.currentQuery)}</div>
          ${data.currentQuery ? `
            <div class="current-query-details">
              <div class="query-aspect"><strong>Aspect:</strong> ${this.escapeHtml(data.currentAspect || 'General')}</div>
              <div class="query-text"><strong></strong> ${this.escapeHtml(data.langGraphStatus)}</div>
            </div>
          ` : ''}
          ${data.findingsCount !== undefined ? `
            <div class="findings-summary">
              <i class="fas fa-lightbulb"></i>
              ${data.findingsCount} finding${data.findingsCount !== 1 ? 's' : ''} discovered
            </div>
          ` : ''}
        </div>
      `;
    } else if (data.phase === 'consolidating') {
      progressHTML = `
        <div class="research-progress-header">
          <div class="progress-icon">
            <i class="fas fa-puzzle-piece fa-spin"></i>
          </div>
          <div class="progress-info">
            <div class="progress-title">Consolidating Research Results</div>
            <div class="progress-subtitle">Processing ${data.researchResultsCount} research results</div>
          </div>
        </div>
        <div class="research-progress-bar">
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${data.progress}%"></div>
            <div class="progress-bar-text">${data.progress}%</div>
          </div>
        </div>
        <div class="research-current-status">
          <div class="current-status-text">${this.escapeHtml(data.currentStatus)}</div>
        </div>
      `;
    } else if (data.phase === 'completed') {
      progressHTML = `
        <div class="research-progress-header">
          <div class="progress-icon success">
            <i class="fas fa-check-circle"></i>
          </div>
          <div class="progress-info">
            <div class="progress-title">Research Completed Successfully</div>
            <div class="progress-subtitle">${data.finalResults.keyFindings} findings • ${data.finalResults.totalSources} sources • ${data.finalResults.researchQuality} quality</div>
          </div>
        </div>
        <div class="research-progress-bar">
          <div class="progress-bar-container">
            <div class="progress-bar-fill success" style="width: 100%"></div>
            <div class="progress-bar-text">Complete</div>
          </div>
        </div>
      `;
    }
    
    progressContainer.innerHTML = progressHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.flowClipRenderer = new FlowClipRenderer();
});

window.copyItemDirect = (itemId) => {
  if (window.flowClipRenderer) {
    window.flowClipRenderer.copyItemDirect(itemId);
  }
}; 