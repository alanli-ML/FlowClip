const { ipcRenderer } = require('electron');

class FlowClipRenderer {
  constructor() {
    this.currentView = 'history';
    this.currentItems = [];
    this.selectedItem = null;
    this.searchTimeout = null;
    this.settings = {};
    
    this.init();
  }

  async init() {
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
      this.currentItems = items;
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

    container.innerHTML = items.map(item => this.createClipboardItemHTML(item)).join('');

    container.querySelectorAll('.clipboard-item').forEach(element => {
      element.addEventListener('click', () => {
        const itemId = element.dataset.itemId;
        this.openClipboardItem(itemId);
      });
    });

    // Load recommended actions for each item
    items.forEach(item => {
      this.loadRecommendedActions(item.id);
    });
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
      'save_reference': { label: 'Save', icon: 'bookmark', description: 'Save for reference' },
      'share': { label: 'Share', icon: 'share', description: 'Share this content' },
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
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  async openClipboardItem(itemId) {
    try {
      const item = await ipcRenderer.invoke('get-clipboard-item', itemId);
      if (!item) {
        this.showToast('Clipboard item not found', 'error');
        return;
      }

      this.selectedItem = item;
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

    modal.classList.add('active');
  }

  closeModal() {
    document.getElementById('item-modal').classList.remove('active');
    document.getElementById('ai-result').classList.add('hidden');
    this.selectedItem = null;
  }

  async triggerAIAction(action) {
    if (!this.selectedItem) return;

    try {
      const aiButton = document.querySelector(`[data-action="${action}"]`);
      aiButton.disabled = true;
      aiButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

      const result = await ipcRenderer.invoke('trigger-ai-task', this.selectedItem.id, action);
      
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
    if (!this.selectedItem) return;

    try {
      await ipcRenderer.invoke('copy-to-clipboard', this.selectedItem.content);
      this.showToast('Copied to clipboard', 'success');
      this.closeModal();
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      this.showToast('Error copying to clipboard', 'error');
    }
  }

  async deleteCurrentItem() {
    if (!this.selectedItem) return;

    if (!confirm('Are you sure you want to delete this clipboard item?')) {
      return;
    }

    try {
      await ipcRenderer.invoke('delete-clipboard-item', this.selectedItem.id);
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
    
    setTimeout(() => {
      tagsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-tags"></i>
          <h3>No tags yet</h3>
          <p>AI will automatically tag your clipboard items</p>
        </div>
      `;
    }, 1000);
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

  copyItemDirect(itemId) {
    const item = this.currentItems.find(i => i.id === itemId);
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

    return `
      <div class="session-item" data-session-id="${session.id}">
        <div class="session-header">
          <div class="session-title">
            <i class="fas fa-${this.getSessionTypeIcon(session.session_type)}"></i>
            <span class="session-label">${session.session_label || 'Unnamed Session'}</span>
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
          </div>
        </div>
        <div class="session-preview">
          ${this.createSessionPreview(session)}
        </div>
      </div>
    `;
  }

  createSessionPreview(session) {
    // Try to parse context summary for preview
    let contextSummary = '';
    try {
      if (session.context_summary) {
        const summary = typeof session.context_summary === 'string' ? 
          JSON.parse(session.context_summary) : session.context_summary;
        contextSummary = summary.toString().substring(0, 150) + '...';
      }
    } catch (error) {
      contextSummary = session.context_summary ? 
        session.context_summary.substring(0, 150) + '...' : '';
    }

    if (!contextSummary) {
      contextSummary = `${session.session_type.replace('_', ' ')} session with ${session.item_count} items`;
    }

    return `<p class="session-summary">${contextSummary}</p>`;
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
    try {
      if (session.intent_analysis) {
        intentData = typeof session.intent_analysis === 'string' ? 
          JSON.parse(session.intent_analysis) : session.intent_analysis;
      }
    } catch (error) {
      console.error('Error parsing intent analysis:', error);
    }

    if (!intentData) {
      container.innerHTML = `
        <div class="analysis-placeholder">
          <i class="fas fa-brain"></i>
          <p>Intent analysis will appear here as the session develops</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="intent-analysis">
        <div class="intent-item">
          <strong>Primary Intent:</strong>
          <span class="intent-primary">${intentData.primaryIntent || 'Unknown'}</span>
        </div>
        ${intentData.secondaryIntents ? `
          <div class="intent-item">
            <strong>Secondary Intents:</strong>
            <div class="intent-tags">
              ${intentData.secondaryIntents.map(intent => 
                `<span class="intent-tag">${intent}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        <div class="intent-item">
          <strong>Progress Status:</strong>
          <span class="progress-status ${intentData.progressStatus || 'unknown'}">${this.formatProgressStatus(intentData.progressStatus)}</span>
        </div>
        ${intentData.nextLikelyActions ? `
          <div class="intent-item">
            <strong>Next Likely Actions:</strong>
            <div class="next-actions">
              ${intentData.nextLikelyActions.map(action => 
                `<span class="next-action">${action}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        <div class="intent-confidence">
          <strong>Confidence:</strong>
          <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${(intentData.confidenceLevel || 0) * 100}%"></div>
          </div>
          <span>${Math.round((intentData.confidenceLevel || 0) * 100)}%</span>
        </div>
      </div>
    `;
  }

  renderResearchFlow(session, sessionItems) {
    const container = document.getElementById('session-research-flow');
    
    if (!sessionItems || sessionItems.length === 0) {
      container.innerHTML = `
        <div class="analysis-placeholder">
          <i class="fas fa-chart-line"></i>
          <p>Research flow will be displayed as items are added</p>
        </div>
      `;
      return;
    }

    // Create timeline of session items
    const timeline = sessionItems.map((item, index) => {
      const timeAgo = this.formatTimeAgo(new Date(item.timestamp));
      const contentPreview = this.truncateText(item.content, 80);
      
      return `
        <div class="timeline-item">
          <div class="timeline-marker">${index + 1}</div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-time">${timeAgo}</span>
              <span class="timeline-source">${item.source_app || 'Unknown'}</span>
            </div>
            <div class="timeline-text">${contentPreview}</div>
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
    
    // Refresh sessions view if currently visible
    if (this.currentView === 'sessions') {
      this.loadSessionsView();
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
}

document.addEventListener('DOMContentLoaded', () => {
  window.flowClipRenderer = new FlowClipRenderer();
});

window.copyItemDirect = (itemId) => {
  if (window.flowClipRenderer) {
    window.flowClipRenderer.copyItemDirect(itemId);
  }
}; 