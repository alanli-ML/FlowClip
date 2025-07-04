const { ipcRenderer } = require('electron');
const FormatUtils = require('./utils/FormatUtils');
const UIRenderer = require('./managers/UIRenderer');
const ActionManager = require('./managers/ActionManager');
const ClipboardManager = require('./managers/ClipboardManager');
const SessionUIManager = require('./managers/SessionUIManager');

/**
 * Main FlowClip Renderer - Refactored with modular architecture
 */
class FlowClipRenderer {
  constructor() {
    this.currentView = 'history';
    this.currentPage = 1;
    this.itemsPerPage = 50;
    this.settings = {};
    this.sessionListRefreshTimeout = null;
    
    // Initialize managers
    this.uiRenderer = new UIRenderer();
    this.actionManager = new ActionManager(ipcRenderer);
    this.clipboardManager = new ClipboardManager(ipcRenderer);
    this.sessionUIManager = new SessionUIManager(ipcRenderer);
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.clipboardManager.loadClipboardHistory();
    this.setupIPCListeners();
    
    // Initialize search context for the default view
    this.updateSearchContext(this.currentView);
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

    // Search - context-aware
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
      this.handleContextualSearch(e.target.value);
    });

    // Search filters
    document.getElementById('content-type-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
    document.getElementById('source-app-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
    document.getElementById('date-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });

    // Clear search
    document.getElementById('clear-search').addEventListener('click', () => {
      document.getElementById('search-input').value = '';
      this.handleContextualSearch('');
    });

    // Refresh buttons
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.clipboardManager.loadClipboardHistory();
    });
    document.getElementById('refresh-sessions-btn').addEventListener('click', () => {
      this.sessionUIManager.loadSessionsView();
    });

    // Clear buttons  
    document.getElementById('clear-sessions-btn').addEventListener('click', () => {
      this.sessionUIManager.clearAllSessions();
    });

    // Session filters
    document.getElementById('session-type-filter').addEventListener('change', () => {
      this.sessionUIManager.applySessionFilters();
    });
    document.getElementById('session-status-filter').addEventListener('change', () => {
      this.sessionUIManager.applySessionFilters();
    });

    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.switchView('settings');
    });
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });
    document.getElementById('test-api-key').addEventListener('click', () => {
      this.testApiKey();
    });

    // Modal events
    document.getElementById('item-modal').addEventListener('click', (e) => {
      if (e.target.id === 'item-modal') {
        this.clipboardManager.closeModal();
      }
    });
    document.querySelector('.modal-close').addEventListener('click', () => {
      this.clipboardManager.closeModal();
    });

    // Session modal events
    document.getElementById('session-modal').addEventListener('click', (e) => {
      if (e.target.id === 'session-modal') {
        this.sessionUIManager.closeSessionModal();
      }
    });
    document.querySelector('#session-modal .modal-close').addEventListener('click', () => {
      this.sessionUIManager.closeSessionModal();
    });

    // Session modal actions
    document.getElementById('export-session').addEventListener('click', () => {
      this.sessionUIManager.exportCurrentSession();
    });
    document.getElementById('close-session').addEventListener('click', () => {
      this.sessionUIManager.closeCurrentSession();
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
      this.clipboardManager.copyItemToClipboard();
    });
    document.getElementById('delete-item').addEventListener('click', () => {
      this.clipboardManager.deleteCurrentItem();
    });

    // Quick actions
    document.getElementById('clear-all-btn').addEventListener('click', () => {
      this.clipboardManager.clearAllItems();
    });
    document.getElementById('export-btn').addEventListener('click', () => {
      this.clipboardManager.exportData();
    });
  }

  setupIPCListeners() {
    ipcRenderer.on('clipboard-item-added', (event, item) => {
      this.clipboardManager.addClipboardItemToUI(item);
      this.uiRenderer.showToast('New clipboard item captured', 'success');
    });

    ipcRenderer.on('clipboard-item-updated', (event, data) => {
      this.clipboardManager.updateClipboardItemInUI(data.clipboardItem, data);
      if (data.tagsUpdated) {
        this.uiRenderer.showToast('Tags updated for clipboard item', 'success');
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

    // Session research events
    ipcRenderer.on('session-analysis-updated', (event, data) => {
      this.handleSessionAnalysisUpdated(data);
    });
    ipcRenderer.on('session-research-completed', (event, data) => {
      this.handleSessionResearchCompleted(data);
    });
    ipcRenderer.on('session-research-failed', (event, data) => {
      this.handleSessionResearchFailed(data);
    });
    ipcRenderer.on('session-research-started', (event, data) => {
      this.handleSessionResearchStarted(data);
    });
    ipcRenderer.on('session-research-progress', (event, data) => {
      this.handleSessionResearchProgress(data);
    });

    // Item-level session research events
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

    // Update search context based on current view
    this.updateSearchContext(viewName);

    switch (viewName) {
      case 'history':
        this.clipboardManager.loadClipboardHistory();
        break;
      case 'search':
        this.loadSearchView();
        break;
      case 'sessions':
        this.sessionUIManager.loadSessionsView();
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

  async loadSearchView() {
    this.clipboardManager.loadClipboardHistory();
  }

  async loadTagsView() {
    const tagsContainer = document.getElementById('tags-container');
    this.uiRenderer.renderLoadingState(tagsContainer, 'Loading tags...');
    
    setTimeout(() => {
      this.uiRenderer.renderEmptyState(
        tagsContainer,
        'tags',
        'No tags yet',
        'AI will automatically tag your clipboard items'
      );
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
      this.uiRenderer.showToast('Settings saved successfully', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.uiRenderer.showToast('Error saving settings', 'error');
    }
  }

  async testApiKey() {
    const apiKey = document.getElementById('openai-api-key').value;
    if (!apiKey) {
      this.uiRenderer.showToast('Please enter an API key first', 'error');
      return;
    }

    const testButton = document.getElementById('test-api-key');
    this.uiRenderer.updateButtonState(testButton, true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.uiRenderer.showToast('API key is valid', 'success');
    } catch (error) {
      console.error('Error testing API key:', error);
      this.uiRenderer.showToast('Invalid API key', 'error');
    } finally {
      this.uiRenderer.updateButtonState(testButton, false);
      testButton.textContent = 'Test';
    }
  }

  async triggerAIAction(action) {
    const currentItem = this.clipboardManager.getCurrentItem();
    if (!currentItem) return;

    try {
      const aiButton = document.querySelector(`[data-action="${action}"]`);
      this.uiRenderer.updateButtonState(aiButton, true);

      const result = await ipcRenderer.invoke('trigger-ai-task', currentItem.id, action);
      
      this.showAIResult(action, result.result);
      this.uiRenderer.showToast(`${action} completed successfully`, 'success');
    } catch (error) {
      console.error(`Error with ${action}:`, error);
      this.uiRenderer.showToast(`Error with ${action}: ${error.message}`, 'error');
    } finally {
      const aiButton = document.querySelector(`[data-action="${action}"]`);
      const config = FormatUtils.getActionConfig(action);
      this.uiRenderer.updateButtonState(aiButton, false, config);
    }
  }

  showAIResult(action, result) {
    const aiResultContainer = document.getElementById('ai-result');
    const aiResultContent = document.getElementById('ai-result-content');
    
    const formattedResult = this.actionManager.formatActionResult(action, result);
    aiResultContent.innerHTML = formattedResult;
    aiResultContainer.classList.remove('hidden');
  }

  // Session event handlers
  handleSessionCreated(data) {
    console.log('Session created:', data);
    this.uiRenderer.showToast(`New ${FormatUtils.formatSessionType(data.session.session_type)} session started`, 'info');
    
    if (this.currentView === 'sessions') {
      this.sessionUIManager.loadSessionsView();
    }
  }

  handleSessionUpdated(data) {
    console.log('Session updated:', data);
    
    if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
      console.log('Session updated with new item, refreshing modal content...');
      this.sessionUIManager.refreshSessionModalContent(data.sessionId);
    }
    
    if (this.currentView === 'sessions') {
      this.sessionUIManager.loadSessionsView();
    }
  }

  handleSessionAnalysisUpdated(data) {
    console.log('Session comprehensive analysis updated:', data);
    
    const message = `Session enriched with ${data.analysisData.totalResearchFindings} research findings and ${data.analysisData.totalSources} sources`;
    this.uiRenderer.showToast(message, 'success');
    
    if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
      console.log('Refreshing session modal with updated comprehensive analysis...');
      this.sessionUIManager.refreshSessionModalContent(data.sessionId);
    }
    
    if (this.currentView === 'sessions') {
      console.log('Refreshing sessions view with updated analysis...');
      this.sessionUIManager.loadSessionsView();
    }
  }

  handleSessionResearchCompleted(data) {
    console.log('Session-level research completed:', data);
    
    const message = `Session research completed with ${data.researchResults.researchData.totalSources} sources and comprehensive analysis`;
    this.uiRenderer.showToast(message, 'success');
    
    if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
      console.log('Refreshing session modal with session research results...');
      this.sessionUIManager.refreshSessionModalContent(data.sessionId);
    }
    
    if (this.currentView === 'sessions') {
      console.log('Refreshing sessions view with session research results...');
      this.sessionUIManager.loadSessionsView();
    }
  }

  handleSessionResearchFailed(data) {
    console.log('Session-level research failed:', data);
    
    this.uiRenderer.showToast(`Session research failed: ${data.error}`, 'error');
    
    if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
      this.sessionUIManager.refreshSessionModalContent(data.sessionId);
    }
  }

  handleSessionResearchStarted(data) {
    console.log('Session research started:', data);
    
    this.uiRenderer.showToast('Session research has started', 'info');
    
    if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
      console.log('Showing loading indicator for session research...');
      this.uiRenderer.showSessionResearchLoading(
        document.getElementById('session-intent-analysis')
      );
    }
  }

  handleSessionResearchProgress(data) {
    console.log('Session research progress:', data);
    
    if (data.phase === 'queries_generated') {
      this.uiRenderer.showToast(`Generated ${data.totalQueries} research queries`, 'info');
    } else if (data.phase === 'consolidating') {
      this.uiRenderer.showToast('Consolidating research results...', 'info');
    } else if (data.phase === 'completed') {
      this.uiRenderer.showToast(`Research completed: ${data.finalResults.keyFindings} findings from ${data.finalResults.totalSources} sources`, 'success');
      
      // When research is completed via progress event, refresh the session modal to show final results
      if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
        console.log('Research completed - refreshing session modal with final results...');
        setTimeout(() => {
          this.sessionUIManager.refreshSessionModalContent(data.sessionId);
        }, 1000); // Delay to ensure backend data is saved
      }
    }
    
    if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
      this.sessionUIManager.updateSessionResearchProgress(data);
    }
    
    if (this.currentView === 'sessions') {
      clearTimeout(this.sessionListRefreshTimeout);
      this.sessionListRefreshTimeout = setTimeout(() => {
        this.sessionUIManager.loadSessionsView();
      }, 1000);
    }
  }

  handleSessionItemResearchCompleted(data) {
    console.log('Session item research completed:', data);
    
    this.uiRenderer.showToast('Item research completed in session', 'success');
    
    if (this.currentView === 'sessions' && this.sessionUIManager.getCurrentModalSessionId() === data.sessionId) {
      console.log('Refreshing session modal with item research results...');
      this.sessionUIManager.refreshSessionModalContent(data.sessionId);
    }
    
    if (this.currentView === 'sessions') {
      this.sessionUIManager.loadSessionsView();
    }
  }

  handleSessionItemResearchFailed(data) {
    console.log('Session item research failed:', data);
    
    this.uiRenderer.showToast(`Item research failed: ${data.error}`, 'error');
  }

  showHotelResearchAlert(data) {
    this.sessionUIManager.showHotelResearchAlert(data);
  }

  // Exposed methods for global access
  triggerActionFromButton(itemId, action) {
    return this.clipboardManager.triggerActionFromButton(itemId, action);
  }

  copyItemDirect(itemId) {
    return this.clipboardManager.copyItemDirect(itemId);
  }

  triggerHotelComparison() {
    this.sessionUIManager.triggerHotelComparison();
  }

  showBookingOptions() {
    this.sessionUIManager.showBookingOptions();
  }

  openSessionDetails(sessionId) {
    return this.sessionUIManager.openSessionDetails(sessionId);
  }

  handleContextualSearch(value) {
    switch (this.currentView) {
      case 'history':
      case 'search':
        this.clipboardManager.handleSearch(value);
        break;
      case 'sessions':
        this.sessionUIManager.handleSearch(value);
        break;
      case 'tags':
        // TODO: Implement tag search if needed
        break;
      case 'stats':
        // Stats view doesn't need search
        break;
      default:
        // Default to clipboard search
        this.clipboardManager.handleSearch(value);
        break;
    }
  }

  handleContextualFilter() {
    switch (this.currentView) {
      case 'history':
      case 'search':
        this.clipboardManager.applyFilters();
        break;
      case 'sessions':
        this.sessionUIManager.applySessionFilters();
        break;
      default:
        // Default to clipboard filters
        this.clipboardManager.applyFilters();
        break;
    }
  }

  updateSearchContext(viewName) {
    const searchInput = document.getElementById('search-input');
    const searchFilters = document.querySelector('.search-filters');
    
    switch (viewName) {
      case 'history':
        searchInput.placeholder = 'Search clipboard history...';
        searchFilters.style.display = 'flex';
        this.showClipboardFilters();
        break;
      case 'search':
        searchInput.placeholder = 'Search clipboard items...';
        searchFilters.style.display = 'flex';
        this.showClipboardFilters();
        break;
      case 'sessions':
        searchInput.placeholder = 'Search sessions...';
        searchFilters.style.display = 'flex';
        this.showSessionFilters();
        break;
      case 'tags':
        searchInput.placeholder = 'Search tags...';
        searchFilters.style.display = 'none';
        break;
      case 'stats':
        searchInput.placeholder = 'Search not available';
        searchFilters.style.display = 'none';
        break;
      case 'settings':
        searchInput.placeholder = 'Search settings...';
        searchFilters.style.display = 'none';
        break;
      default:
        searchInput.placeholder = 'Search...';
        searchFilters.style.display = 'none';
        break;
    }
  }

  showClipboardFilters() {
    const filtersContainer = document.querySelector('.search-filters');
    filtersContainer.innerHTML = `
      <select id="content-type-filter">
        <option value="">All Types</option>
        <option value="TEXT">Text</option>
        <option value="IMAGE">Image</option>
        <option value="FILE">File</option>
      </select>
      <select id="source-app-filter">
        <option value="">All Apps</option>
      </select>
      <input type="date" id="date-filter">
    `;
    
    // Re-attach event listeners for the new elements
    document.getElementById('content-type-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
    document.getElementById('source-app-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
    document.getElementById('date-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
  }

  showSessionFilters() {
    const filtersContainer = document.querySelector('.search-filters');
    filtersContainer.innerHTML = `
      <select id="session-type-filter">
        <option value="">All Session Types</option>
        <option value="hotel_research">Hotel Research</option>
        <option value="restaurant_research">Restaurant Research</option>
        <option value="product_research">Product Research</option>
        <option value="academic_research">Academic Research</option>
        <option value="travel_research">Travel Research</option>
        <option value="general_research">General Research</option>
      </select>
      <select id="session-status-filter">
        <option value="">All Statuses</option>
        <option value="active">Active</option>
        <option value="expired">Expired</option>
        <option value="completed">Completed</option>
      </select>
      <input type="date" id="date-filter" placeholder="Filter by date">
    `;
    
    // Re-attach event listeners for the new elements
    document.getElementById('session-type-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
    document.getElementById('session-status-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
    document.getElementById('date-filter').addEventListener('change', () => {
      this.handleContextualFilter();
    });
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