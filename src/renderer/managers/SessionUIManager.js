const FormatUtils = require('../utils/FormatUtils');
const UIRenderer = require('./UIRenderer');

/**
 * Manages session UI operations and rendering
 */
class SessionUIManager {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.uiRenderer = new UIRenderer();
    this.currentSessions = [];
    this.currentSession = null;
    this.currentModalSessionId = null;
    this.sessionListRefreshTimeout = null;
    this.searchTimeout = null;
  }

  /**
   * Load sessions view
   */
  async loadSessionsView() {
    try {
      this.uiRenderer.showLoading(true);
      const sessions = await this.ipcRenderer.invoke('get-active-sessions');
      this.currentSessions = sessions || [];
      this.renderSessions(sessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
      this.uiRenderer.showToast('Error loading sessions', 'error');
    } finally {
      this.uiRenderer.showLoading(false);
    }
  }

  /**
   * Render sessions
   */
  renderSessions(sessions) {
    const container = document.getElementById('sessions-list');
    
    if (!sessions || sessions.length === 0) {
      this.uiRenderer.renderEmptyState(
        container,
        'layer-group',
        'No active sessions',
        'Sessions will appear here as you copy related content.'
      );
      return;
    }

    container.innerHTML = sessions.map(session => {
      const sessionInfo = this.generateSessionTitleAndPreview(session);
      return this.uiRenderer.createSessionHTML(session, sessionInfo);
    }).join('');

    // Add click event listeners
    container.querySelectorAll('.session-item').forEach(element => {
      element.addEventListener('click', () => {
        const sessionId = element.dataset.sessionId;
        this.openSessionDetails(sessionId);
      });
    });
  }

  /**
   * Generate session title and preview
   */
  generateSessionTitleAndPreview(session) {
    let title = session.session_label || `${FormatUtils.formatSessionType(session.session_type)} Session`;
    let preview = `${session.session_type.replace('_', ' ')} session with ${session.item_count} items`;
    let metrics = null;

    try {
      if (session.context_summary) {
        const contextSummary = FormatUtils.safeJsonParse(session.context_summary);
        
        if (contextSummary?.sessionResearch) {
          const research = contextSummary.sessionResearch;
          
          if (research.researchObjective) {
            title = research.researchObjective;
          } else if (research.comprehensiveSummary) {
            title = FormatUtils.generateConciseSessionTitle(session.session_type, research);
          }
          
          if (research.comprehensiveSummary) {
            preview = FormatUtils.truncateText(research.comprehensiveSummary, 150);
          } else if (research.keyFindings && research.keyFindings.length > 0) {
            preview = `Key findings: ${research.keyFindings.slice(0, 2).join(', ')}`;
          }
          
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
        else if (contextSummary?.comprehensiveAnalysis) {
          const analysis = contextSummary.comprehensiveAnalysis;
          if (analysis.sessionSummary) {
            preview = analysis.sessionSummary;
          }
          
          if (analysis.totalSources || analysis.totalItems) {
            const items = analysis.totalItems || session.item_count;
            const sources = analysis.totalSources || 0;
            metrics = `${items} items`;
            if (sources > 0) metrics += `, ${sources} sources`;
          }
        }
        else if (contextSummary?.sessionSummary) {
          preview = contextSummary.sessionSummary;
        }
      }
      
      if (session.intent_analysis && !metrics) {
        const intentData = FormatUtils.safeJsonParse(session.intent_analysis);
        
        if (intentData?.sessionIntent) {
          const intent = intentData.sessionIntent;
          if (intent.primaryGoal && !title.includes(intent.primaryGoal.substring(0, 20))) {
            title = intent.primaryGoal;
          }
          
          if (intent.completionStatus) {
            metrics = FormatUtils.formatCompletionStatus(intent.completionStatus);
          }
        } else if (intentData?.primaryIntent) {
          if (!title.includes(intentData.primaryIntent.substring(0, 20))) {
            title = intentData.primaryIntent;
          }
        }
      }
      
    } catch (error) {
      console.error('Error parsing session data for title/preview:', error);
      title = session.session_label || `${FormatUtils.formatSessionType(session.session_type)} Session`;
      preview = `${session.session_type.replace('_', ' ')} session with ${session.item_count} items`;
      metrics = null;
    }
    
    return {
      title: FormatUtils.escapeHtml(title),
      preview: FormatUtils.escapeHtml(preview),
      metrics: metrics ? FormatUtils.escapeHtml(metrics) : null
    };
  }

  /**
   * Apply session filters
   */
  async applySessionFilters() {
    try {
      const typeFilter = document.getElementById('session-type-filter').value;
      const statusFilter = document.getElementById('session-status-filter').value;

      const filters = {};
      if (typeFilter) filters.sessionType = typeFilter;
      if (statusFilter) filters.status = statusFilter;

      const sessions = await this.ipcRenderer.invoke('get-active-sessions', filters);
      this.renderSessions(sessions);
    } catch (error) {
      console.error('Error applying session filters:', error);
      this.uiRenderer.showToast('Error applying filters', 'error');
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions() {
    const confirmed = confirm('Are you sure you want to clear all sessions? This action cannot be undone.');
    
    if (!confirmed) {
      return;
    }

    try {
      await this.ipcRenderer.invoke('clear-all-sessions');
      this.uiRenderer.showToast('All sessions cleared successfully', 'success');
      this.loadSessionsView();
    } catch (error) {
      console.error('Error clearing sessions:', error);
      this.uiRenderer.showToast('Error clearing sessions: ' + error.message, 'error');
    }
  }

  /**
   * Open session details
   */
  async openSessionDetails(sessionId) {
    try {
      const session = await this.ipcRenderer.invoke('get-session', sessionId);
      const sessionItems = await this.ipcRenderer.invoke('get-session-items', sessionId);
      
      if (!session) {
        this.uiRenderer.showToast('Session not found', 'error');
        return;
      }

      this.currentModalSessionId = sessionId;
      this.showSessionModal(session, sessionItems);
    } catch (error) {
      console.error('Error loading session details:', error);
      this.uiRenderer.showToast('Error loading session details', 'error');
    }
  }

  /**
   * Show session modal
   */
  showSessionModal(session, sessionItems) {
    const modal = document.getElementById('session-modal');
    const modalTitle = document.getElementById('session-modal-title');
    
    modalTitle.textContent = session.session_label || 'Session Details';
    
    // Fill in session overview
    document.getElementById('session-type').textContent = FormatUtils.formatSessionType(session.session_type);
    document.getElementById('session-type').className = `session-type-badge ${session.session_type}`;
    document.getElementById('session-status').textContent = session.status;
    document.getElementById('session-status').className = `status-badge ${session.status}`;
    document.getElementById('session-duration').textContent = FormatUtils.formatDuration(session.start_time, session.last_activity);
    document.getElementById('session-item-count').textContent = `${sessionItems.length} items`;

    // Show intent analysis
    this.renderIntentAnalysis(session);

    // Show research flow
    this.renderResearchFlow(session, sessionItems);

    // Show hotel research specific data if applicable
    if (session.session_type === 'hotel_research') {
      this.uiRenderer.renderHotelResearchData(
        document.getElementById('hotel-research-data'),
        session,
        sessionItems
      );
      document.getElementById('hotel-research-section').style.display = 'block';
    } else {
      document.getElementById('hotel-research-section').style.display = 'none';
    }

    // Show session items
    this.uiRenderer.renderSessionItems(
      document.getElementById('session-items-list'),
      sessionItems
    );

    // Store current session for actions
    this.currentSession = session;

    modal.style.display = 'block';
  }

  /**
   * Render intent analysis
   */
  renderIntentAnalysis(session) {
    const container = document.getElementById('session-intent-analysis');
    
    let intentData = null;
    let sessionResearch = null;
    
    try {
      if (session.intent_analysis) {
        intentData = FormatUtils.safeJsonParse(session.intent_analysis);
      }
      
      if (session.context_summary) {
        const contextSummary = FormatUtils.safeJsonParse(session.context_summary);
        sessionResearch = contextSummary?.sessionResearch;
      }
    } catch (error) {
      console.error('Error parsing session analysis data:', error);
      intentData = null;
      sessionResearch = null;
    }

    if (sessionResearch && sessionResearch.researchCompleted) {
      this.renderSessionResearchResults(container, sessionResearch, intentData);
    } else if (intentData) {
      this.renderIntentAnalysisResults(container, intentData);
    } else {
      this.renderAnalysisPlaceholder(container);
    }
  }

  /**
   * Render session research results
   */
  renderSessionResearchResults(container, sessionResearch, intentData) {
    try {
      const researchData = sessionResearch.researchData || {};
      const keyFindings = sessionResearch.keyFindings || [];
      const sources = researchData.sources || [];
      const confidence = researchData.confidence || 0;
      const totalSources = researchData.totalSources || sources.length || 0;
      const searchQueries = researchData.searchQueries || [];
      
      container.innerHTML = `
        <div class="session-research-results">
          <div class="research-confidence-banner">
            <div class="confidence-score">
              <div class="confidence-circle">
                <div class="confidence-percentage">${Math.round(confidence * 100)}%</div>
                <div class="confidence-label">Research Confidence</div>
              </div>
              <div class="confidence-details">
                <div class="confidence-metric">
                  <strong>${totalSources}</strong> Sources
                </div>
                <div class="confidence-metric">
                  <strong>${keyFindings.length}</strong> Key Findings
                </div>
                <div class="confidence-metric">
                  <strong>${searchQueries.length}</strong> Research Queries
                </div>
              </div>
            </div>
          </div>

          <div class="research-intent-section">
            <h5><i class="fas fa-bullseye"></i> Research Intent & Objective</h5>
            <div class="intent-primary">${(intentData?.sessionIntent?.primaryGoal) || sessionResearch.researchObjective || 'General research session'}</div>
            ${(intentData?.sessionIntent?.completionStatus) ? `
              <div class="completion-status">
                <span class="status-badge ${intentData.sessionIntent.completionStatus}">${FormatUtils.formatCompletionStatus(intentData.sessionIntent.completionStatus)}</span>
              </div>
            ` : ''}
          </div>

          <div class="research-summary-section">
            <h5><i class="fas fa-file-alt"></i> Research Summary</h5>
            <div class="research-summary-content">
              ${sessionResearch.comprehensiveSummary || 'No comprehensive summary available'}
            </div>
          </div>

          ${keyFindings.length > 0 ? `
            <div class="research-findings-section">
              <h5><i class="fas fa-lightbulb"></i> Key Findings</h5>
              <ul class="key-findings-list">
                ${keyFindings.map(finding => `<li>${FormatUtils.escapeHtml(finding)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          ${sources.length > 0 ? `
            <div class="research-sources-section">
              <h5><i class="fas fa-link"></i> Research Sources (${totalSources})</h5>
              <div class="sources-grid">
                ${sources.slice(0, 6).map(source => `
                  <div class="source-card">
                    <div class="source-title">${FormatUtils.escapeHtml(source.title || source.source || 'Source')}</div>
                    ${source.url ? `<div class="source-url"><a href="${FormatUtils.escapeHtml(source.url)}" target="_blank">${FormatUtils.truncateText(source.url, 40)}</a></div>` : ''}
                    ${source.snippet ? `<div class="source-snippet">${FormatUtils.escapeHtml(FormatUtils.truncateText(source.snippet, 80))}</div>` : ''}
                  </div>
                `).join('')}
                ${sources.length > 6 ? `
                  <div class="source-card source-more">
                    <i class="fas fa-plus"></i>
                    <span>+${sources.length - 6} more sources</span>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          ${sessionResearch.sessionInsights ? `
            <div class="research-insights-section">
              <h5><i class="fas fa-chart-pie"></i> Session Insights</h5>
              <div class="insights-grid">
                <div class="insight-card">
                  <div class="insight-label">Information Coverage</div>
                  <div class="insight-value">${FormatUtils.escapeHtml(sessionResearch.sessionInsights.informationCoverage || 'Unknown')}</div>
                </div>
                <div class="insight-card">
                  <div class="insight-label">Research Depth</div>
                  <div class="insight-value">${FormatUtils.escapeHtml(sessionResearch.sessionInsights.researchDepth || 'Unknown')}</div>
                </div>
                <div class="insight-card">
                  <div class="insight-label">Thematic Coherence</div>
                  <div class="insight-value">${FormatUtils.escapeHtml(sessionResearch.sessionInsights.thematicCoherence || 'Unknown')}</div>
                </div>
              </div>
            </div>
          ` : ''}

          ${(intentData?.sessionIntent?.nextSteps && Array.isArray(intentData.sessionIntent.nextSteps) && intentData.sessionIntent.nextSteps.length > 0) ? `
            <div class="research-next-steps">
              <h5><i class="fas fa-arrow-right"></i> Recommended Next Steps</h5>
              <div class="next-steps-list">
                ${intentData.sessionIntent.nextSteps.map(step => `
                  <div class="next-step-item">
                    <i class="fas fa-chevron-right"></i>
                    <span>${FormatUtils.escapeHtml(step)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="research-metadata">
            <div class="metadata-item">
              <i class="fas fa-clock"></i>
              <span>Last researched: ${sessionResearch.lastResearched ? FormatUtils.formatTimeAgo(new Date(sessionResearch.lastResearched)) : 'Recently'}</span>
            </div>
            <div class="metadata-item">
              <i class="fas fa-cog"></i>
              <span>Research type: ${FormatUtils.escapeHtml(sessionResearch.researchType || 'comprehensive')}</span>
            </div>
          </div>
        </div>
      `;
    } catch (renderError) {
      console.error('Error rendering session research results:', renderError);
      this.uiRenderer.renderErrorState(container, 'Session research data could not be displayed');
    }
  }

  /**
   * Render intent analysis results
   */
  renderIntentAnalysisResults(container, intentData) {
    try {
      const primaryIntent = intentData.primaryIntent || intentData.sessionIntent?.primaryGoal || 'Unknown';
      const secondaryIntents = intentData.secondaryIntents || [];
      const progressStatus = intentData.progressStatus || intentData.sessionIntent?.completionStatus || 'unknown';
      const nextActions = intentData.nextLikelyActions || intentData.sessionIntent?.nextSteps || [];
      const confidenceLevel = intentData.confidenceLevel || intentData.sessionIntent?.confidenceLevel || 0;

      container.innerHTML = `
        <div class="intent-analysis">
          <div class="intent-item">
            <strong>Primary Intent:</strong>
            <span class="intent-primary">${FormatUtils.escapeHtml(primaryIntent)}</span>
          </div>
          ${secondaryIntents.length > 0 ? `
            <div class="intent-item">
              <strong>Secondary Intents:</strong>
              <div class="intent-tags">
                ${secondaryIntents.map(intent => 
                  `<span class="intent-tag">${FormatUtils.escapeHtml(intent)}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}
          <div class="intent-item">
            <strong>Progress Status:</strong>
            <span class="progress-status ${progressStatus}">${FormatUtils.formatProgressStatus(progressStatus)}</span>
          </div>
          ${nextActions.length > 0 ? `
            <div class="intent-item">
              <strong>Next Likely Actions:</strong>
              <div class="next-actions">
                ${nextActions.map(action => 
                  `<span class="next-action">${FormatUtils.escapeHtml(action)}</span>`
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
      this.uiRenderer.renderErrorState(container, 'Intent analysis data could not be displayed');
    }
  }

  /**
   * Render analysis placeholder
   */
  renderAnalysisPlaceholder(container) {
    container.innerHTML = `
      <div class="analysis-placeholder">
        <i class="fas fa-brain"></i>
        <p>Session research will appear here as the session develops</p>
        <small>Research is automatically triggered when 2+ items are added to a session</small>
      </div>
    `;
  }

  /**
   * Render research flow
   */
  renderResearchFlow(session, sessionItems) {
    const container = document.getElementById('session-research-flow');
    
    try {
      this.uiRenderer.renderResearchTimeline(container, sessionItems);
    } catch (error) {
      console.error('Error rendering research flow:', error);
      this.uiRenderer.renderErrorState(container, 'Research flow data could not be displayed');
    }
  }

  /**
   * Close session modal
   */
  closeSessionModal() {
    document.getElementById('session-modal').style.display = 'none';
    this.currentSession = null;
    this.currentModalSessionId = null;
  }

  /**
   * Export current session
   */
  async exportCurrentSession() {
    if (!this.currentSession) return;
    
    try {
      this.uiRenderer.showToast('Session export feature coming soon!', 'info');
    } catch (error) {
      console.error('Error exporting session:', error);
      this.uiRenderer.showToast('Error exporting session', 'error');
    }
  }

  /**
   * Close current session
   */
  async closeCurrentSession() {
    if (!this.currentSession) return;
    
    try {
      this.uiRenderer.showToast('Session closed', 'success');
      this.closeSessionModal();
      this.loadSessionsView();
    } catch (error) {
      console.error('Error closing session:', error);
      this.uiRenderer.showToast('Error closing session', 'error');
    }
  }

  /**
   * Refresh session modal content
   */
  async refreshSessionModalContent(sessionId) {
    try {
      this.uiRenderer.showSessionResearchLoading(
        document.getElementById('session-intent-analysis')
      );
      
      const session = await this.ipcRenderer.invoke('get-session', sessionId);
      const sessionItems = await this.ipcRenderer.invoke('get-session-items', sessionId);
      
      if (!session) {
        console.error('Session not found during refresh');
        return;
      }

      // Update session overview data
      document.getElementById('session-duration').textContent = FormatUtils.formatDuration(session.start_time, session.last_activity);
      document.getElementById('session-item-count').textContent = `${sessionItems.length} items`;

      // Re-render sections
      this.renderIntentAnalysis(session);
      this.renderResearchFlow(session, sessionItems);

      if (session.session_type === 'hotel_research') {
        this.uiRenderer.renderHotelResearchData(
          document.getElementById('hotel-research-data'),
          session,
          sessionItems
        );
      }

      this.uiRenderer.renderSessionItems(
        document.getElementById('session-items-list'),
        sessionItems
      );

      this.currentSession = session;

      this.uiRenderer.hideSessionResearchLoading(
        document.getElementById('session-intent-analysis')
      );
      
      console.log('Session modal content refreshed successfully');
      
    } catch (error) {
      console.error('Error refreshing session modal content:', error);
      this.uiRenderer.hideSessionResearchLoading(
        document.getElementById('session-intent-analysis')
      );
      this.uiRenderer.showToast('Error updating session display', 'error');
    }
  }

  /**
   * Update session research progress
   */
  updateSessionResearchProgress(data) {
    let progressContainer = document.getElementById('session-research-progress');
    
    if (!progressContainer) {
      const intentAnalysisContainer = document.getElementById('session-intent-analysis');
      if (intentAnalysisContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'session-research-progress';
        progressContainer.className = 'research-progress-container';
        intentAnalysisContainer.insertBefore(progressContainer, intentAnalysisContainer.firstChild);
      } else {
        return;
      }
    }
    
    if (data.phase === 'completed') {
      setTimeout(() => {
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }
      }, 3000);
    } else {
      progressContainer.style.display = 'block';
    }
    
    let progressHTML = this.generateProgressHTML(data);
    progressContainer.innerHTML = progressHTML;
  }

  /**
   * Generate progress HTML based on phase
   */
  generateProgressHTML(data) {
    switch (data.phase) {
      case 'initializing':
        return `
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
      
      case 'queries_generated':
        return `
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
      
      case 'searching':
        return `
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
            <div class="current-status-text">${FormatUtils.escapeHtml(data.currentQuery)}</div>
            ${data.currentQuery ? `
              <div class="current-query-details">
                <div class="query-aspect"><strong>Aspect:</strong> ${FormatUtils.escapeHtml(data.currentAspect || 'General')}</div>
                <div class="query-text"><strong></strong> ${FormatUtils.escapeHtml(data.langGraphStatus)}</div>
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
      
      case 'consolidating':
        return `
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
            <div class="current-status-text">${FormatUtils.escapeHtml(data.currentStatus)}</div>
          </div>
        `;
      
      case 'completed':
        return `
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
      
      default:
        return '';
    }
  }

  getCurrentSession() {
    return this.currentSession;
  }

  getCurrentModalSessionId() {
    return this.currentModalSessionId;
  }

  getCurrentSessions() {
    return this.currentSessions;
  }

  /**
   * Trigger hotel comparison
   */
  triggerHotelComparison() {
    this.uiRenderer.showToast('Hotel comparison feature coming soon!', 'info');
  }

  /**
   * Show booking options
   */
  showBookingOptions() {
    this.uiRenderer.showToast('Booking integration coming soon!', 'info');
  }

  /**
   * Show hotel research alert
   */
  showHotelResearchAlert(data) {
    const { sessionId, message, recommendation, hotels, location } = data;
    
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

    this.uiRenderer.showToast('Hotel research session detected - check details!', 'info');
  }

  /**
   * Perform session research
   */
  async performSessionResearch(sessionId) {
    try {
      console.log(`Performing session research for session ${sessionId}...`);
      
      if (this.currentModalSessionId === sessionId) {
        this.uiRenderer.showSessionResearchLoading(
          document.getElementById('session-intent-analysis')
        );
      }
      
      this.uiRenderer.showToast('Starting comprehensive session research...', 'info');
      
      const result = await this.ipcRenderer.invoke('perform-session-research', sessionId);
      
      if (result.success) {
        console.log('Session research completed successfully:', result.result);
      } else {
        console.error('Session research failed:', result.error);
        this.uiRenderer.showToast(`Session research failed: ${result.error}`, 'error');
        if (this.currentModalSessionId === sessionId) {
          this.uiRenderer.hideSessionResearchLoading(
            document.getElementById('session-intent-analysis')
          );
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('Error performing session research:', error);
      this.uiRenderer.showToast(`Session research error: ${error.message}`, 'error');
      if (this.currentModalSessionId === sessionId) {
        this.uiRenderer.hideSessionResearchLoading(
          document.getElementById('session-intent-analysis')
        );
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle search input for sessions
   */
  handleSearch(query) {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(async () => {
      if (!query.trim()) {
        this.loadSessionsView();
        return;
      }

      try {
        this.uiRenderer.showLoading(true);
        const results = await this.ipcRenderer.invoke('search-sessions', query);
        this.currentSessions = results || [];
        this.renderSessions(results);
      } catch (error) {
        console.error('Error searching sessions:', error);
        this.uiRenderer.showToast('Error searching sessions', 'error');
      } finally {
        this.uiRenderer.showLoading(false);
      }
    }, 300);
  }
}

module.exports = SessionUIManager; 