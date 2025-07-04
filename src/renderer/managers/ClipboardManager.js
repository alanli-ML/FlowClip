const FormatUtils = require('../utils/FormatUtils');
const UIRenderer = require('./UIRenderer');
const ActionManager = require('./ActionManager');

/**
 * Manages clipboard operations and rendering
 */
class ClipboardManager {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.uiRenderer = new UIRenderer();
    this.actionManager = new ActionManager(ipcRenderer);
    this.allClipboardItems = [];
    this.filteredItems = [];
    this.searchTimeout = null;
    this.currentClipboardItem = null;
  }

  /**
   * Load clipboard history
   */
  async loadClipboardHistory() {
    try {
      this.uiRenderer.showLoading(true);
      const items = await this.ipcRenderer.invoke('get-clipboard-history', { limit: 50 });
      this.allClipboardItems = items;
      this.filteredItems = items;
      this.renderClipboardItems(items);
      this.uiRenderer.populateSourceAppFilter(items);
    } catch (error) {
      console.error('Error loading clipboard history:', error);
      this.uiRenderer.showToast('Error loading clipboard history', 'error');
    } finally {
      this.uiRenderer.showLoading(false);
    }
  }

  /**
   * Render clipboard items
   */
  renderClipboardItems(items) {
    const container = document.getElementById('clipboard-items');
    container.innerHTML = '';
    
    if (items.length === 0) {
      this.uiRenderer.renderEmptyState(
        container,
        'clipboard',
        'No clipboard items yet',
        'Copy something to get started!'
      );
      return;
    }

    items.forEach(item => {
      const itemHTML = this.uiRenderer.createClipboardItemHTML(item);
      container.insertAdjacentHTML('beforeend', itemHTML);
      
      const itemElement = container.lastElementChild;
      itemElement.addEventListener('click', () => this.openClipboardItem(item.id));

      // Load recommended actions and historical results
      this.loadRecommendedActions(item.id);
      this.displayHistoricalResults(item);
    });
  }

  /**
   * Load recommended actions for an item
   */
  async loadRecommendedActions(itemId) {
    try {
      const actionsContainer = document.querySelector(`.recommended-actions[data-item-id="${itemId}"]`);
      if (!actionsContainer) return;

      const result = await this.actionManager.loadRecommendedActions(itemId);
      
      if (result.error) {
        actionsContainer.innerHTML = '';
        return;
      }

      this.uiRenderer.renderRecommendedActions(
        actionsContainer,
        result.actions,
        result.confidence,
        result.cached
      );

    } catch (error) {
      console.error('Error loading recommended actions:', error);
      const actionsContainer = document.querySelector(`.recommended-actions[data-item-id="${itemId}"]`);
      if (actionsContainer) {
        actionsContainer.innerHTML = '';
      }
    }
  }

  /**
   * Display historical workflow results
   */
  async displayHistoricalResults(item) {
    if (!item.workflowResults) {
      try {
        const fullItem = await this.ipcRenderer.invoke('get-clipboard-item', item.id);
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

  /**
   * Populate historical results
   */
  populateHistoricalResults(itemId, workflowResults) {
    if (!workflowResults || Object.keys(workflowResults).length === 0) {
      return;
    }

    Object.entries(workflowResults).forEach(([workflowType, results]) => {
      if (results && results.length > 0) {
        const mostRecentResult = results[0];
        const convertedResult = this.actionManager.convertWorkflowResultToActionResult(
          workflowType,
          mostRecentResult
        );
        
        if (convertedResult) {
          this.updateClipboardEntryWithHistoricalResult(
            itemId,
            workflowType,
            convertedResult,
            mostRecentResult.executedAt
          );
        }
      }
    });
  }

  /**
   * Update clipboard entry with historical result
   */
  updateClipboardEntryWithHistoricalResult(itemId, action, result, executedAt) {
    const resultsContainer = document.querySelector(`.clipboard-item-action-results[data-item-id="${itemId}"]`);
    if (!resultsContainer) return;

    const resultElement = this.actionManager.createActionResultElement(
      action,
      result,
      true,
      executedAt
    );

    resultsContainer.appendChild(resultElement);
    resultsContainer.style.display = 'block';
  }

  /**
   * Trigger AI action from button
   */
  async triggerActionFromButton(itemId, action) {
    try {
      const button = document.querySelector(`[data-action="${action}"][data-item-id="${itemId}"]`);
      const config = FormatUtils.getActionConfig(action);
      
      if (button) {
        this.uiRenderer.updateButtonState(button, true);
      }

      await this.actionManager.triggerActionFromButton(
        itemId,
        action,
        (action, result) => {
          this.uiRenderer.showToast(`${config.label} completed successfully`, 'success');
          this.updateClipboardEntryWithResult(itemId, action, result);
        },
        (action, error) => {
          this.uiRenderer.showToast(`Error with ${action}: ${error}`, 'error');
          this.updateClipboardEntryWithError(itemId, action, error);
        }
      );

    } catch (error) {
      console.error(`Error with ${action}:`, error);
      this.uiRenderer.showToast(`Error with ${action}: ${error.message}`, 'error');
      this.updateClipboardEntryWithError(itemId, action, error.message);
    } finally {
      const button = document.querySelector(`[data-action="${action}"][data-item-id="${itemId}"]`);
      if (button) {
        const config = FormatUtils.getActionConfig(action);
        this.uiRenderer.updateButtonState(button, false, config);
      }
    }
  }

  /**
   * Update clipboard entry with result
   */
  updateClipboardEntryWithResult(itemId, action, result) {
    const resultsContainer = document.querySelector(`.clipboard-item-action-results[data-item-id="${itemId}"]`);
    if (!resultsContainer) return;

    const resultElement = this.actionManager.createActionResultElement(action, result);
    resultsContainer.appendChild(resultElement);
    resultsContainer.style.display = 'block';

    this.actionManager.addSmoothAnimation(resultElement);
  }

  /**
   * Update clipboard entry with error
   */
  updateClipboardEntryWithError(itemId, action, errorMessage) {
    const resultsContainer = document.querySelector(`.clipboard-item-action-results[data-item-id="${itemId}"]`);
    if (!resultsContainer) return;

    const errorElement = this.actionManager.createActionErrorElement(action, errorMessage);
    resultsContainer.appendChild(errorElement);
    resultsContainer.style.display = 'block';

    this.actionManager.addSmoothAnimation(errorElement);
  }

  /**
   * Handle search input
   */
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
        this.uiRenderer.showLoading(true);
        const results = await this.ipcRenderer.invoke('search-clipboard', query);
        this.filteredItems = results;
        this.renderClipboardItems(results);
      } catch (error) {
        console.error('Error searching:', error);
        this.uiRenderer.showToast('Error searching clipboard', 'error');
      } finally {
        this.uiRenderer.showLoading(false);
      }
    }, 300);
  }

  /**
   * Apply filters
   */
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
      this.uiRenderer.showLoading(true);
      const items = await this.ipcRenderer.invoke('get-clipboard-history', options);
      this.filteredItems = items;
      this.renderClipboardItems(items);
    } catch (error) {
      console.error('Error applying filters:', error);
      this.uiRenderer.showToast('Error applying filters', 'error');
    } finally {
      this.uiRenderer.showLoading(false);
    }
  }

  /**
   * Open clipboard item modal
   */
  async openClipboardItem(itemId) {
    try {
      const item = await this.ipcRenderer.invoke('get-clipboard-item', itemId);
      if (!item) {
        this.uiRenderer.showToast('Clipboard item not found', 'error');
        return;
      }

      this.currentClipboardItem = item;
      this.showItemModal(item);
    } catch (error) {
      console.error('Error opening clipboard item:', error);
      this.uiRenderer.showToast('Error opening clipboard item', 'error');
    }
  }

  /**
   * Show item modal
   */
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

  /**
   * Close modal
   */
  closeModal() {
    document.getElementById('item-modal').classList.remove('active');
    document.getElementById('ai-result').classList.add('hidden');
    this.currentClipboardItem = null;
  }

  /**
   * Copy item to clipboard
   */
  async copyItemToClipboard() {
    if (!this.currentClipboardItem) return;

    try {
      await this.ipcRenderer.invoke('copy-to-clipboard', this.currentClipboardItem.content);
      this.uiRenderer.showToast('Copied to clipboard', 'success');
      this.closeModal();
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      this.uiRenderer.showToast('Error copying to clipboard', 'error');
    }
  }

  /**
   * Delete current item
   */
  async deleteCurrentItem() {
    if (!this.currentClipboardItem) return;

    if (!confirm('Are you sure you want to delete this clipboard item?')) {
      return;
    }

    try {
      await this.ipcRenderer.invoke('delete-clipboard-item', this.currentClipboardItem.id);
      this.uiRenderer.showToast('Clipboard item deleted', 'success');
      this.closeModal();
      this.loadClipboardHistory();
    } catch (error) {
      console.error('Error deleting clipboard item:', error);
      this.uiRenderer.showToast('Error deleting clipboard item', 'error');
    }
  }

  /**
   * Copy item directly by ID
   */
  copyItemDirect(itemId) {
    const item = this.filteredItems.find(i => i.id === itemId);
    if (item) {
      this.ipcRenderer.invoke('copy-to-clipboard', item.content);
      this.uiRenderer.showToast('Copied to clipboard', 'success');
    }
  }

  /**
   * Add clipboard item to UI
   */
  addClipboardItemToUI(item) {
    const clipboardItems = document.getElementById('clipboard-items');
    const emptyState = clipboardItems.querySelector('.empty-state');
    
    const existingItem = clipboardItems.querySelector(`[data-item-id="${item.id}"]`);
    if (existingItem) {
      console.log('Item already exists in UI, skipping duplicate:', item.id);
      return;
    }
    
    if (emptyState) {
      clipboardItems.innerHTML = '';
    }
    
    const itemHTML = this.uiRenderer.createClipboardItemHTML(item);
    clipboardItems.insertAdjacentHTML('afterbegin', itemHTML);
    
    const newItem = clipboardItems.firstElementChild;
    newItem.addEventListener('click', () => this.openClipboardItem(item.id));

    this.loadRecommendedActions(item.id);
  }

  /**
   * Update clipboard item in UI
   */
  updateClipboardItemInUI(updatedItem, updateData) {
    console.log(`🔄 Updating clipboard item ${updatedItem.id} in UI`);
    
    const clipboardItems = document.getElementById('clipboard-items');
    const existingElement = clipboardItems.querySelector(`[data-item-id="${updatedItem.id}"]`);
    
    if (!existingElement) {
      console.log('Item not found in UI, adding as new item');
      this.addClipboardItemToUI(updatedItem);
      return;
    }

    // Update the filteredItems array
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
      
      // Add visual feedback
      tagsContainer.style.transition = 'all 0.3s ease';
      tagsContainer.style.backgroundColor = '#e8f5e8';
      setTimeout(() => {
        tagsContainer.style.backgroundColor = '';
      }, 2000);
      
      console.log(`🏷️ Updated ${tags.length} tags for item ${updatedItem.id}`);
    }

    // Reload actions if needed
    if (updateData.actionsStored) {
      console.log(`🎯 Reloading actions for item ${updatedItem.id}`);
      this.loadRecommendedActions(updatedItem.id);
    }

    // Add unified indicator
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

  /**
   * Filter clipboard items by tag
   */
  filterByTag(tag, items) {
    this.filteredItems = items;
    this.renderClipboardItems(items);
    
    // Update the filter display
    const clearFiltersBtn = document.querySelector('.clear-filters-btn');
    if (clearFiltersBtn) {
      clearFiltersBtn.style.display = 'block';
    }
    
    // Add tag filter indicator
    const historyContainer = document.getElementById('history-container');
    let tagFilterBanner = historyContainer.querySelector('.tag-filter-banner');
    
    if (!tagFilterBanner) {
      tagFilterBanner = document.createElement('div');
      tagFilterBanner.className = 'tag-filter-banner';
      historyContainer.insertBefore(tagFilterBanner, historyContainer.firstChild);
    }
    
    tagFilterBanner.innerHTML = `
      <div class="filter-info">
        <i class="fas fa-filter"></i>
        <span>Showing ${items.length} items tagged with "${tag}"</span>
        <button class="btn btn-sm btn-outline" onclick="window.flowClipRenderer.clearTagFilter()">
          <i class="fas fa-times"></i>
          Clear Filter
        </button>
      </div>
    `;
  }

  /**
   * Clear all clipboard items
   */
  async clearAllItems() {
    if (!confirm('Are you sure you want to clear all clipboard history? This cannot be undone.')) {
      return;
    }

    try {
      const result = await this.ipcRenderer.invoke('clear-all-items');
      
      if (result.success) {
        this.uiRenderer.showToast(`Cleared ${result.deletedCount} clipboard items`, 'success');
        this.loadClipboardHistory();
      } else {
        this.uiRenderer.showToast('Error clearing clipboard items', 'error');
      }
    } catch (error) {
      console.error('Error clearing items:', error);
      this.uiRenderer.showToast('Error clearing clipboard items', 'error');
    }
  }

  /**
   * Export clipboard data
   */
  async exportData() {
    try {
      this.uiRenderer.showToast('Export feature coming soon', 'info');
    } catch (error) {
      console.error('Error exporting data:', error);
      this.uiRenderer.showToast('Error exporting data', 'error');
    }
  }

  /**
   * Get current clipboard item
   */
  getCurrentItem() {
    return this.currentClipboardItem;
  }

  /**
   * Get filtered items
   */
  getFilteredItems() {
    return this.filteredItems;
  }

  /**
   * Get all items
   */
  getAllItems() {
    return this.allClipboardItems;
  }
}

module.exports = ClipboardManager; 