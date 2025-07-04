const FormatUtils = require('../utils/FormatUtils');

/**
 * Manages AI actions and result formatting
 */
class ActionManager {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
  }

  /**
   * Trigger AI action for a clipboard item
   */
  async triggerActionFromButton(itemId, action, onSuccess, onError) {
    try {
      const result = await this.ipcRenderer.invoke('trigger-ai-task', itemId, action);
      
      if (onSuccess) {
        onSuccess(action, result.result);
      }
      
      return result.result;
    } catch (error) {
      if (onError) {
        onError(action, error.message);
      }
      throw error;
    }
  }

  /**
   * Load recommended actions for a clipboard item
   */
  async loadRecommendedActions(itemId) {
    try {
      const result = await this.ipcRenderer.invoke('get-recommended-actions', itemId);
      
      if (result.error) {
        return { actions: [], error: result.error };
      }

      const { recommendedActions, confidence, cached } = result;
      
      if (!recommendedActions || recommendedActions.length === 0) {
        return { actions: [], confidence: 0 };
      }

      // Show top 2-3 actions to avoid clutter
      const topActions = recommendedActions
        .sort((a, b) => FormatUtils.getActionPriorityValue(b.priority) - FormatUtils.getActionPriorityValue(a.priority))
        .slice(0, 3);

      return { actions: topActions, confidence, cached };
    } catch (error) {
      console.error('Error loading recommended actions:', error);
      return { actions: [], error: error.message };
    }
  }

  /**
   * Format action result for display
   */
  formatActionResult(action, result) {
    if (!result) return '<em>No result</em>';

    // Handle different action types with custom formatting
    switch (action) {
      case 'summarize':
        return this.formatSummarizeResult(result);
      case 'research':
        return this.formatResearchResult(result);
      case 'fact_check':
        return this.formatFactCheckResult(result);
      case 'create_task':
        return this.formatCreateTaskResult(result);
      case 'translate':
        return this.formatTranslateResult(result);
      case 'explain':
        return this.formatExplainResult(result);
      default:
        return this.formatGenericResult(result);
    }
  }

  /**
   * Format summarize result
   */
  formatSummarizeResult(result) {
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
    return `<p>${result}</p>`;
  }

  /**
   * Format research result
   */
  formatResearchResult(result) {
    if (typeof result === 'object') {
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
        return `<div class="research-result">${Array.isArray(result) ? result.join(', ') : result}</div>`;
      }
    }
    return `<p>${result}</p>`;
  }

  /**
   * Format fact check result
   */
  formatFactCheckResult(result) {
    if (typeof result === 'object' && result.fact_check_analysis) {
      return `
        <div class="fact-check-result">
          <p><strong>Fact Check Analysis:</strong></p>
          <p>${result.fact_check_analysis}</p>
          ${result.confidence_level ? `<small class="confidence">Confidence: ${result.confidence_level}</small>` : ''}
        </div>
      `;
    }
    return `<p>${result}</p>`;
  }

  /**
   * Format create task result
   */
  formatCreateTaskResult(result) {
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
    return `<p>${result}</p>`;
  }

  /**
   * Format translate result
   */
  formatTranslateResult(result) {
    if (typeof result === 'object' && result.translated_text) {
      return `
        <div class="translate-result">
          <p><strong>Translation (${result.target_language}):</strong></p>
          <p>${result.translated_text}</p>
        </div>
      `;
    }
    return `<p>${result}</p>`;
  }

  /**
   * Format explain result
   */
  formatExplainResult(result) {
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
    return `<p>${result}</p>`;
  }

  /**
   * Format generic result
   */
  formatGenericResult(result) {
    if (typeof result === 'object') {
      return `<pre class="generic-result">${JSON.stringify(result, null, 2)}</pre>`;
    }
    return `<p>${result}</p>`;
  }

  /**
   * Convert workflow result to action result format
   */
  convertWorkflowResultToActionResult(workflowType, workflowResult) {
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
        return workflowResult;
    }
  }

  /**
   * Create action result HTML element
   */
  createActionResultElement(action, result, isHistorical = false, executedAt = null) {
    const config = FormatUtils.getActionConfig(action);
    const formattedResult = this.formatActionResult(action, result);
    
    const resultElement = document.createElement('div');
    resultElement.className = isHistorical ? 'action-result historical-result' : 'action-result';
    
    const timeIndicator = isHistorical && executedAt 
      ? `<span class="historical-indicator" title="Executed ${FormatUtils.formatTimeAgo(new Date(executedAt))}">
           <i class="fas fa-history"></i> ${FormatUtils.formatTimeAgo(new Date(executedAt))}
         </span>`
      : '';
    
    // Set initial collapsed state - collapsed for historical, expanded for new
    const isCollapsed = isHistorical;
    const toggleIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
    const contentClass = isCollapsed ? 'collapsed' : 'expanded';
    
    resultElement.innerHTML = `
      <div class="action-result-header">
        <button class="action-result-toggle" data-action="toggle-result">
          <i class="fas ${toggleIcon}"></i>
        </button>
        <i class="fas fa-${config.icon}"></i>
        <span class="action-result-title">${config.label} Result</span>
        ${timeIndicator}
        <button class="btn btn-xs action-result-close" data-action="close-result">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="action-result-content ${contentClass}">
        ${formattedResult}
      </div>
    `;

    // Add event listeners
    this.addResultEventListeners(resultElement);

    return resultElement;
  }

  /**
   * Add event listeners to action result element
   */
  addResultEventListeners(resultElement) {
    const toggleButton = resultElement.querySelector('.action-result-toggle');
    const closeButton = resultElement.querySelector('.action-result-close');
    const content = resultElement.querySelector('.action-result-content');
    const header = resultElement.querySelector('.action-result-header');
    
    // Prevent the entire action result from bubbling up to clipboard item
    resultElement.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Prevent header clicks from bubbling up
    if (header) {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    
    if (toggleButton) {
      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleResultContent(content, toggleButton);
      });
    }
    
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        resultElement.remove();
      });
    }
    
    // Also prevent content clicks from bubbling up
    if (content) {
      content.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }

  /**
   * Toggle result content visibility
   */
  toggleResultContent(content, toggleButton) {
    const isCollapsed = content.classList.contains('collapsed');
    const icon = toggleButton.querySelector('i');
    
    if (isCollapsed) {
      content.classList.remove('collapsed');
      content.classList.add('expanded');
      icon.classList.remove('fa-chevron-down');
      icon.classList.add('fa-chevron-up');
    } else {
      content.classList.remove('expanded');
      content.classList.add('collapsed');
      icon.classList.remove('fa-chevron-up');
      icon.classList.add('fa-chevron-down');
    }
  }

  /**
   * Create action error element
   */
  createActionErrorElement(action, errorMessage) {
    const config = FormatUtils.getActionConfig(action);
    
    const errorElement = document.createElement('div');
    errorElement.className = 'action-result action-error';
    errorElement.innerHTML = `
      <div class="action-result-header">
        <button class="action-result-toggle" data-action="toggle-result">
          <i class="fas fa-chevron-up"></i>
        </button>
        <i class="fas fa-exclamation-triangle"></i>
        <span class="action-result-title">${config.label} Error</span>
        <button class="btn btn-xs action-result-close" data-action="close-result">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="action-result-content expanded">
        ${errorMessage}
      </div>
    `;

    // Add event listeners
    this.addResultEventListeners(errorElement);

    return errorElement;
  }

  /**
   * Add smooth animation to element
   */
  addSmoothAnimation(element) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      element.style.transition = 'all 0.3s ease';
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    }, 10);
  }
}

module.exports = ActionManager; 