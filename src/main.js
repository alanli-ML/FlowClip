const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Tray, Menu, screen, nativeImage, shell } = require('electron');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const screenshot = require('screenshot-desktop');
const Database = require('./database/database');
const AIService = require('./services/aiService');
const ContextCapture = require('./services/contextCapture');
const PermissionManager = require('./services/permissionManager');
const WorkflowEngine = require('./services/workflowEngine');
const PasteAssistant = require('./services/pasteAssistant');
const SessionManager = require('./services/sessionManagerRefactored');
const ConsolidatedSessionSummarizer = require('./services/consolidatedSessionSummarizer');
const ExternalApiService = require('./services/externalApiService');
const Store = require('electron-store');

// Initialize store for app settings
const store = new Store();

class FlowClipApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.database = new Database();
    this.aiService = new AIService(this.database);
    this.contextCapture = new ContextCapture();
    this.permissionManager = new PermissionManager();
    this.workflowEngine = new WorkflowEngine(this.database, this.aiService);
    this.pasteAssistant = new PasteAssistant(this.database, this.aiService);
    this.externalApiService = new ExternalApiService();
    this.consolidatedSummarizer = new ConsolidatedSessionSummarizer(this.aiService);
    this.sessionManager = new SessionManager(this.database, this.aiService, this.externalApiService, this.workflowEngine, this.consolidatedSummarizer);
    this.isMonitoring = false;
    this.lastClipboardContent = '';
    this.clipboardCheckInterval = null;
    this.overlayCheckInterval = null;
    this.isFirstRun = store.get('isFirstRun', true);
  }

  async init() {
    await this.database.init();
    await this.permissionManager.init();
    await this.workflowEngine.init();
    await this.sessionManager.init();
    this.setupApp();
    this.setupIPC();
    this.setupWorkflowEvents();
    this.setupSessionEvents();
    
    // Set up permission change listener
    this.permissionManager.onPermissionsChanged = (permissions) => {
      this.handlePermissionsChanged(permissions);
    };
  }

  setupWorkflowEvents() {
    // Listen to workflow events
    this.workflowEngine.on('workflow-started', (event) => {
      console.log('Workflow started:', event.workflowId);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('workflow-started', event);
      }
    });

    this.workflowEngine.on('workflow-completed', async (event) => {
      console.log('🔄 Workflow completed event received:', {
        workflowId: event.workflowId,
        executionId: event.executionId,
        hasResult: !!event.result,
        resultKeys: event.result ? Object.keys(event.result) : []
      });
      
      // Handle content-analysis workflow completion
      if (event.workflowId === 'content-analysis') {
        console.log('✅ Content-analysis workflow detected');
        
        if (event.result && event.result['save-results']) {
          console.log('✅ Save-results found in workflow result');
          const saveResult = event.result['save-results'];
          console.log('📊 Save result details:', {
            saved: saveResult.saved,
            tagsUpdated: saveResult.tagsUpdated,
            actionsStored: saveResult.actionsStored,
            unified: saveResult.unified
          });
          
          try {
            // Find the clipboard item ID from the workflow execution data
            const executionData = this.workflowEngine.getExecution(event.executionId);
            console.log('📋 Execution data:', {
              hasData: !!executionData,
              dataKeys: executionData ? Object.keys(executionData) : [],
              hasClipboardItem: !!(executionData?.data?.clipboardItem),
              clipboardItemId: executionData?.data?.clipboardItem?.id
            });
            
            const clipboardItemId = executionData?.data?.clipboardItem?.id;
            const clipboardItem = executionData?.data?.clipboardItem;
            
            if (clipboardItemId && clipboardItem) {
              console.log(`🔍 Processing clipboard item ${clipboardItemId}`);
              
              // Fetch the updated clipboard item with comprehensive analysis
              const updatedItem = await this.database.getClipboardItem(clipboardItemId);
              console.log('📦 Updated item from database:', {
                found: !!updatedItem,
                hasAnalysisData: !!(updatedItem?.analysis_data),
                analysisDataLength: updatedItem?.analysis_data?.length
              });
              
              if (updatedItem) {
                console.log(`✅ Comprehensive analysis complete for item ${clipboardItemId}`);
                
                // NOW process session membership with comprehensive analysis available
                console.log('🔄 Processing session membership after comprehensive analysis completion...');
                try {
                  await this.sessionManager.processClipboardItem(updatedItem);
                  console.log('✅ Session processing completed successfully');
                } catch (sessionError) {
                  console.error('❌ Session processing failed:', sessionError);
                }
                
                // If tags or actions were updated, refresh the UI
                if (saveResult.tagsUpdated || saveResult.actionsStored) {
                  if (this.mainWindow) {
                    // Safely handle tags count - they could be null, string, or array
                    let tagCount = 0;
                    if (updatedItem.tags) {
                      if (Array.isArray(updatedItem.tags)) {
                        tagCount = updatedItem.tags.length;
                      } else if (typeof updatedItem.tags === 'string') {
                        tagCount = updatedItem.tags.length > 0 ? updatedItem.tags.split(',').length : 0;
                      }
                    }
                    
                    console.log(`🏷️ Refreshing UI for clipboard item ${clipboardItemId} with ${tagCount} tags`);
                    this.mainWindow.webContents.send('clipboard-item-updated', {
                      clipboardItem: updatedItem,
                      tagsUpdated: saveResult.tagsUpdated,
                      actionsStored: saveResult.actionsStored,
                      unified: saveResult.unified
                    });
                  }
                }
              } else {
                console.log(`❌ Could not retrieve updated clipboard item ${clipboardItemId} after analysis`);
              }
            } else {
              console.log('❌ No clipboard item found in workflow execution data');
            }
          } catch (error) {
            console.error('❌ Error processing clipboard item after comprehensive analysis completion:', error);
          }
        } else {
          console.log('❌ No save-results found in workflow result');
        }
      } else {
        console.log(`ℹ️  Workflow ${event.workflowId} completed, but not content-analysis`);
      }

      // Send generic workflow completion to renderer
      if (this.mainWindow) {
        this.mainWindow.webContents.send('workflow-completed', event);
      }
    });

    this.workflowEngine.on('workflow-failed', (event) => {
      console.error('Workflow failed:', event.executionId, event.error);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('workflow-failed', event);
      }
    });

    this.workflowEngine.on('workflow-step-completed', (event) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('workflow-step-completed', event);
      }
    });
  }

  setupSessionEvents() {
    // Listen to session events
    this.sessionManager.on('session-created', (event) => {
      console.log('Session created:', event.session.session_type, event.session.session_label);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-created', event);
      }
    });

    this.sessionManager.on('session-updated', (event) => {
      console.log('Session updated:', event.sessionType, 'items:', event.itemCount);
      
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-updated', event);
      }
    });

    // Session research events
    this.sessionManager.on('session-research-completed', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-research-completed', data);
      }
    });

    this.sessionManager.on('session-research-failed', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-research-failed', data);
      }
    });

    this.sessionManager.on('session-research-started', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-research-started', data);
      }
    });

    // Session research progress events
    this.sessionManager.on('session-research-progress', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-research-progress', data);
      }
    });

    // Session comprehensive analysis events
    this.sessionManager.on('session-analysis-updated', (event) => {
      console.log('Session comprehensive analysis updated:', event.sessionId, 'research findings:', event.analysisData.totalResearchFindings);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-analysis-updated', event);
      }
    });

    this.sessionManager.on('sessions-expired', (event) => {
      console.log('Sessions expired:', event.count);
    });

    // Listen to external automation events
    this.sessionManager.on('automation-triggered', (event) => {
      console.log('External automation triggered:', event.sessionType, 'workflow:', event.workflowId);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('automation-triggered', event);
      }
    });

    this.sessionManager.on('automation-failed', (event) => {
      console.error('External automation failed:', event.sessionType, event.error);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('automation-failed', event);
      }
    });

    // Listen to external API service events
    this.externalApiService.on('workflow-triggered', (event) => {
      console.log('N8N workflow triggered:', event.workflowId, 'for session:', event.sessionType);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('n8n-workflow-triggered', event);
      }
    });

    this.externalApiService.on('workflow-error', (event) => {
      console.error('N8N workflow error:', event.sessionType, event.error);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('n8n-workflow-error', event);
      }
    });
  }

  setupApp() {
    // Handle app ready
    app.whenReady().then(async () => {
      this.createMainWindow();
      this.createTray();
      
      // Show onboarding for first-time users
      if (this.isFirstRun) {
        await this.showOnboarding();
        store.set('isFirstRun', false);
      } else {
        // For returning users, check permissions silently
        await this.checkPermissionsAndStart();
      }
      
      this.registerGlobalShortcuts();
    });

    // Handle window closed on macOS
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle app activation on macOS
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    // Cleanup before quit
    app.on('before-quit', () => {
      this.stopClipboardMonitoring();
      this.pasteAssistant.destroy();
      this.sessionManager.destroy();
      globalShortcut.unregisterAll();
      this.permissionManager.destroy();
    });
  }

  async showOnboarding() {
    // Show welcome and permission setup
    const hasPermissions = await this.permissionManager.showOnboardingFlow();
    
    if (hasPermissions) {
      this.startClipboardMonitoring();
    } else {
      // Start with limited functionality
      this.startClipboardMonitoring();
      this.showPermissionReminder();
    }
  }

  async checkPermissionsAndStart() {
    const permissions = await this.permissionManager.checkAllPermissions();
    
    // Always start clipboard monitoring (works without permissions)
    this.startClipboardMonitoring();
    
    // Initialize paste assistant for smart actions
    await this.pasteAssistant.init();
    
    // Update context capture capabilities
    this.contextCapture.setPermissions(permissions);
    
    // Enable debug mode for better screenshot debugging
    this.contextCapture.setDebugMode(true);
    
    // Update UI with permission status
    if (this.mainWindow) {
      this.mainWindow.webContents.send('permissions-updated', permissions);
    }
  }

  handlePermissionsChanged(permissions) {
    console.log('Permissions changed:', permissions);
    
    // Update context capture capabilities
    this.contextCapture.setPermissions(permissions);
    
    // Notify UI
    if (this.mainWindow) {
      this.mainWindow.webContents.send('permissions-updated', permissions);
    }
    
    // Update tray tooltip with permission status
    this.updateTrayTooltip(permissions);
  }

  updateTrayTooltip(permissions) {
    const features = this.permissionManager.getAvailableFeatures();
    const activeFeatures = Object.entries(features)
      .filter(([key, value]) => value)
      .map(([key]) => key);
    
    this.tray.setToolTip(`FlowClip - ${activeFeatures.length} features active`);
  }

  showPermissionReminder() {
    // Show a non-intrusive reminder about missing permissions
    setTimeout(() => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('show-permission-reminder');
      }
    }, 5000); // Show after 5 seconds
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1000,
      height: 600,
      minWidth: 700,
      minHeight: 400,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      titleBarStyle: 'hiddenInset',
      show: false,
      skipTaskbar: false
    });

    // Load the main UI
    this.mainWindow.loadFile('src/renderer/index.html');

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      console.log('Window ready to show, startMinimized:', store.get('startMinimized', false));
      // Force show window for debugging
      this.mainWindow.show();
      this.mainWindow.focus();
      console.log('Window should now be visible');
    });

    // Handle window close (minimize to tray instead)
    this.mainWindow.on('close', (event) => {
      if (!app.isQuiting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
    });
  }

  createTray() {
    // Create tray icon
    const trayIcon = nativeImage.createFromPath(path.join(__dirname, '../assets/tray-icon.png'));
    this.tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

    this.updateTrayMenu();
    this.updateTrayTooltip(this.permissionManager.getPermissionStatus());

    // Handle double click to show main window
    this.tray.on('double-click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
    });
  }

  updateTrayMenu() {
    const permissions = this.permissionManager.getPermissionStatus();
    const workflowStats = this.workflowEngine.getStats();
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show FlowClip',
        click: () => {
          this.mainWindow.show();
          this.mainWindow.focus();
        }
      },
      {
        label: 'Clipboard History',
        accelerator: 'CmdOrCtrl+Shift+V',
        click: () => {
          this.showClipboardHistory();
        }
      },
      { type: 'separator' },
      {
        label: 'Monitoring',
        type: 'checkbox',
        checked: this.isMonitoring,
        click: () => {
          this.toggleClipboardMonitoring();
        }
      },
      {
        label: 'Workflows',
        submenu: [
          {
            label: `Active: ${workflowStats.runningExecutions}`,
            enabled: false
          },
          {
            label: `Total: ${workflowStats.totalWorkflows}`,
            enabled: false
          },
          { type: 'separator' },
          {
            label: 'View Workflows',
            click: () => {
              this.showWorkflows();
            }
          }
        ]
      },
      {
        label: 'Permissions',
        submenu: [
          {
            label: `Accessibility ${permissions.accessibility ? '✓' : '✗'}`,
            enabled: !permissions.accessibility,
            click: () => {
              this.permissionManager.requestAccessibilityPermission();
            }
          },
          {
            label: `Screen Recording ${permissions.screenRecording ? '✓' : '✗'}`,
            enabled: !permissions.screenRecording,
            click: () => {
              this.permissionManager.requestScreenRecordingPermission();
            }
          },
          {
            label: `Automation ${permissions.automation ? '✓' : '✗'}`,
            enabled: !permissions.automation,
            click: () => {
              this.permissionManager.requestAutomationPermission();
            }
          },
          { type: 'separator' },
          {
            label: 'Permission Guide',
            click: () => {
              this.permissionManager.showPermissionGuide();
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Preferences',
        click: () => {
          this.openPreferences();
        }
      },
      {
        label: 'Quit FlowClip',
        click: () => {
          app.isQuiting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  registerGlobalShortcuts() {
    // Register global shortcut for quick access
    globalShortcut.register('CmdOrCtrl+Shift+V', () => {
      this.showClipboardHistory();
    });

    // Register shortcut to toggle monitoring
    globalShortcut.register('CmdOrCtrl+Shift+M', () => {
      this.toggleClipboardMonitoring();
    });

    // Register shortcut to test overlay (for debugging)
    globalShortcut.register('CmdOrCtrl+Shift+T', async () => {
      console.log('Testing overlay via keyboard shortcut...');
      await this.pasteAssistant.testOverlay();
    });
  }

  startClipboardMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.lastClipboardContent = clipboard.readText();

    // Check clipboard every 500ms
    this.clipboardCheckInterval = setInterval(() => {
      this.checkClipboard();
    }, 500);

    console.log('Clipboard monitoring started');
    this.updateTrayMenu(); // Update tray menu to reflect monitoring status
  }

  stopClipboardMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.clipboardCheckInterval) {
      clearInterval(this.clipboardCheckInterval);
      this.clipboardCheckInterval = null;
    }

    console.log('Clipboard monitoring stopped');
    this.updateTrayMenu(); // Update tray menu to reflect monitoring status
  }

  toggleClipboardMonitoring() {
    if (this.isMonitoring) {
      this.stopClipboardMonitoring();
    } else {
      this.startClipboardMonitoring();
    }
  }

  async checkClipboard() {
    const currentContent = clipboard.readText();
    
    if (currentContent && currentContent !== this.lastClipboardContent) {
      this.lastClipboardContent = currentContent;
      await this.handleClipboardChange(currentContent);
    }
  }

  async handleClipboardChange(content) {
    try {
      console.log('Clipboard changed:', content.substring(0, 100) + '...');

      // Check if this content was previously copied by FlowClip (for paste detection)
      const existingItem = await this.findExistingClipboardItem(content);

      // Capture context (will adapt based on available permissions)
      const context = await this.contextCapture.captureContext();
      
      // Create clipboard item
      const clipboardItem = {
        id: uuidv4(),
        content: content,
        content_type: 'TEXT',
        timestamp: new Date().toISOString(),
        source_app: context.activeApp,
        window_title: context.windowTitle,
        screenshot_path: context.screenshotPath,
        surrounding_text: context.surroundingText,
        capture_method: context.captureMethod,
        tags: []
      };

      // Save to database only if it's new content
      if (!existingItem) {
        await this.database.saveClipboardItem(clipboardItem);

        // Notify renderer to update UI with new clipboard item
        if (this.mainWindow) {
          this.mainWindow.webContents.send('clipboard-item-added', clipboardItem);
        }

        // NOTE: Session processing moved to workflow completion handler
        // This ensures comprehensive analysis is complete before session processing

        // Trigger workflows for new clipboard content
        await this.workflowEngine.triggerWorkflows('clipboard-change', {
          clipboardItem: clipboardItem,
          context: context
        });

        // Note: AI analysis is now handled by the unified workflow engine
        // The comprehensive workflow handles tagging, actions, and analysis in one call
        // Session processing happens AFTER comprehensive analysis completes
      }

      // Notify PasteAssistant of clipboard change (for both new and existing content)
      await this.pasteAssistant.onClipboardChange(content, existingItem || clipboardItem);

      // Update tray menu periodically
      this.updateTrayMenu();

    } catch (error) {
      console.error('Clipboard handling error:', error);
    }
  }

  async findExistingClipboardItem(content) {
    try {
      const items = await this.database.getClipboardHistory({ limit: 1 });
      
      // Only check against the most recent item (items[0])
      if (!items || items.length === 0) {
        return null;
      }
      
      const mostRecentItem = items[0];
      
      // First try exact match with most recent item
      if (mostRecentItem.content === content) {
        return mostRecentItem;
      }
      
      // Try normalized match (trim whitespace and normalize newlines) with most recent item
        const normalizedContent = content.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const recentItemContent = mostRecentItem.content.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      if (recentItemContent === normalizedContent) {
        return mostRecentItem;
      }
      
      return null;
    } catch (error) {
      console.error('Error finding existing clipboard item:', error);
      return null;
    }
  }

  showClipboardHistory() {
    if (!this.mainWindow) {
      this.createMainWindow();
    }
    
    this.mainWindow.show();
    this.mainWindow.focus();
    this.mainWindow.webContents.send('show-clipboard-history');
  }

  showWorkflows() {
    if (!this.mainWindow) {
      this.createMainWindow();
    }
    
    this.mainWindow.show();
    this.mainWindow.focus();
    this.mainWindow.webContents.send('show-workflows');
  }

  openPreferences() {
    if (!this.mainWindow) {
      this.createMainWindow();
    }
    
    this.mainWindow.show();
    this.mainWindow.focus();
    this.mainWindow.webContents.send('show-preferences');
  }

  determineContentType(content) {
    if (!content) return 'text';
    
    // URL detection
    if (content.match(/^https?:\/\//)) return 'url';
    
    // Email detection
    if (content.match(/\S+@\S+\.\S+/)) return 'email';
    
    // Code detection (simple heuristics)
    if (content.includes('function') || content.includes('class') || content.includes('import')) return 'code';
    
    // JSON detection
    if (content.trim().startsWith('{') && content.trim().endsWith('}')) return 'data';
    
    // Phone detection
    if (content.match(/^\+?[\d\s\-\(\)]+$/) && content.replace(/\D/g, '').length >= 10) return 'phone';
    
    // Default
    return 'text';
  }

  getFallbackActions(contentType) {
    const fallbackActions = {
      'url': [
        { action: 'research', priority: 'high', reason: 'Explore this link for more information', confidence: 0.8 },
        { action: 'cite', priority: 'medium', reason: 'Add proper citation for this URL', confidence: 0.7 }
      ],
      'email': [
        { action: 'respond', priority: 'high', reason: 'Draft a response to this email', confidence: 0.8 },
        { action: 'schedule', priority: 'medium', reason: 'Schedule follow-up or meeting', confidence: 0.6 }
      ],
      'code': [
        { action: 'explain', priority: 'high', reason: 'Explain how this code works', confidence: 0.8 },
        { action: 'create_task', priority: 'medium', reason: 'Create task to review this code', confidence: 0.7 }
      ],
      'phone': [
        { action: 'create_task', priority: 'high', reason: 'Create task to contact this person', confidence: 0.8 },
        { action: 'schedule', priority: 'medium', reason: 'Schedule a call', confidence: 0.6 }
      ],
      'data': [
        { action: 'explain', priority: 'high', reason: 'Explain the data structure', confidence: 0.7 },
        { action: 'research', priority: 'medium', reason: 'Research related data patterns', confidence: 0.6 }
      ],
      'text': [
        { action: 'summarize', priority: 'medium', reason: 'Create a summary of this text', confidence: 0.6 },
        { action: 'explain', priority: 'medium', reason: 'Get explanation of this content', confidence: 0.7 }
      ]
    };

    return fallbackActions[contentType] || fallbackActions['text'];
  }

  setupIPC() {
    // Get clipboard history
    ipcMain.handle('get-clipboard-history', async (event, options = {}) => {
      const items = await this.database.getClipboardHistory(options);
      
      // Parse and include workflow results for each item
      return items.map(item => {
        let workflowResults = null;
        if (item.analysis_data) {
          try {
            const analysisData = JSON.parse(item.analysis_data);
            workflowResults = analysisData.workflowResults || null;
          } catch (error) {
            console.error('Error parsing analysis_data for item', item.id, ':', error);
          }
        }
        
        return {
          ...item,
          workflowResults: workflowResults
        };
      });
    });

    // Get single clipboard item
    ipcMain.handle('get-clipboard-item', async (event, id) => {
      const item = await this.database.getClipboardItem(id);
      if (!item) {
        return null;
      }

      // Parse and include workflow results if available
      let workflowResults = null;
      if (item.analysis_data) {
        try {
          const analysisData = JSON.parse(item.analysis_data);
          workflowResults = analysisData.workflowResults || null;
        } catch (error) {
          console.error('Error parsing analysis_data for workflow results:', error);
        }
      }

      // Return item with parsed workflow results
      return {
        ...item,
        workflowResults: workflowResults
      };
    });

    // Get recommended actions for clipboard item
    ipcMain.handle('get-recommended-actions', async (event, clipboardItemId) => {
      try {
        // Get the clipboard item
        const clipboardItem = await this.database.getClipboardItem(clipboardItemId);
        if (!clipboardItem) {
          return { error: 'Clipboard item not found' };
        }

        // Check if we already have action recommendations from workflows
        const aiTasks = await this.database.getAITasksForClipboardItem(clipboardItemId);
        
        // First check for workflow_actions (new format)
        let actionTask = aiTasks.find(task => task.task_type === 'workflow_actions');
        
        if (actionTask && actionTask.status === 'completed' && actionTask.task_data) {
          try {
            let taskData = actionTask.task_data;
            if (typeof taskData === 'string') {
              taskData = JSON.parse(taskData);
            }
            
            if (taskData.actions && Array.isArray(taskData.actions)) {
              console.log(`Found ${taskData.actions.length} cached actions from workflow`);
              return {
                recommendedActions: taskData.actions,
                confidence: 0.8,
                cached: true
              };
            }
          } catch (parseError) {
            console.error('Error parsing workflow actions:', parseError);
          }
        }
        
        // Fall back to old format
        actionTask = aiTasks.find(task => task.task_type === 'langgraph_action_recommendation');
        
        if (actionTask && actionTask.status === 'completed' && actionTask.result) {
          try {
            const result = JSON.parse(actionTask.result);
            return {
              recommendedActions: result.recommendedActions || [],
              confidence: result.confidence || 0.7,
              cached: true
            };
          } catch (parseError) {
            console.error('Error parsing action recommendation result:', parseError);
          }
        }

        // If no cached recommendations, check if AI service is running workflows
        // The workflow engine should have already generated actions when clipboard was captured
        // So if we're here, it means either:
        // 1. Workflows are disabled
        // 2. This is an old clipboard item before workflow implementation
        // 3. The workflow failed
        
        // For old items, we can trigger a one-time comprehensive analysis
        if (this.aiService.isConfigured() && this.aiService.langGraphClient) {
          console.log('No cached actions found, running unified comprehensive analysis...');
          const workflowData = {
            content: clipboardItem.content,
            context: {
              sourceApp: clipboardItem.source_app,
              windowTitle: clipboardItem.window_title,
              screenshotPath: clipboardItem.screenshot_path,
              surroundingText: clipboardItem.surrounding_text,
              timestamp: clipboardItem.timestamp
            }
          };

          const result = await this.aiService.langGraphClient.executeWorkflow('comprehensive_content_analysis', workflowData);
          
          // Save the result for future use in new format
          const { v4: uuidv4 } = require('uuid');
          await this.database.saveAITask({
            id: uuidv4(),
            clipboard_item_id: clipboardItemId,
            task_type: 'workflow_actions',
            task_data: JSON.stringify({ 
              workflow: 'comprehensive_content_analysis',
              actions: result.recommendedActions || []
            }),
            status: 'completed',
            result: JSON.stringify(result),
            error: null
          });

          return {
            recommendedActions: result.recommendedActions || [],
            confidence: result.actionConfidence || 0.7,
            cached: false
          };
        }

        // Fallback recommendations if AI is not configured
        const contentType = this.determineContentType(clipboardItem.content);
        return {
          recommendedActions: this.getFallbackActions(contentType),
          confidence: 0.5,
          cached: false,
          fallback: true
        };

      } catch (error) {
        console.error('Error getting recommended actions:', error);
        return { error: error.message };
      }
    });

    // Search clipboard items
    ipcMain.handle('search-clipboard', async (event, query) => {
      return await this.database.searchClipboardItems(query);
    });

    // Trigger AI task (legacy)
    ipcMain.handle('trigger-ai-task', async (event, clipboardItemId, taskType) => {
      return await this.aiService.triggerTask(clipboardItemId, taskType);
    });

    // Get AI task result
    ipcMain.handle('get-ai-task', async (event, taskId) => {
      return await this.database.getAITask(taskId);
    });

    // Add tags to clipboard item
    ipcMain.handle('add-tags', async (event, clipboardItemId, tags) => {
      return await this.database.addTags(clipboardItemId, tags);
    });

    // Get all tags with usage counts
    ipcMain.handle('get-all-tags', async () => {
      return await this.database.getAllTags();
    });

    // Get items by tag
    ipcMain.handle('get-items-by-tag', async (event, tag) => {
      return await this.database.getItemsByTag(tag);
    });

    // Delete clipboard item
    ipcMain.handle('delete-clipboard-item', async (event, id) => {
      return await this.database.deleteClipboardItem(id);
    });

    // Clear all clipboard items
    ipcMain.handle('clear-all-items', async () => {
      return await this.database.clearAllItems();
    });

    // Copy content back to clipboard
    ipcMain.handle('copy-to-clipboard', async (event, content) => {
      clipboard.writeText(content);
      return true;
    });

    // Get app settings
    ipcMain.handle('get-settings', async () => {
      return store.store;
    });

    // Update app settings
    ipcMain.handle('update-settings', async (event, settings) => {
      for (const [key, value] of Object.entries(settings)) {
        store.set(key, value);
      }
      
      // Reinitialize AIService if OpenAI API key was updated
      if (settings.openaiApiKey) {
        console.log('OpenAI API key updated, reinitializing AI services...');
        this.aiService.setApiKey(settings.openaiApiKey);
        console.log('AI services reinitialized successfully');
      }
      
      return true;
    });

    // Get application statistics
    ipcMain.handle('get-stats', async () => {
      const dbStats = await this.database.getStats();
      const workflowStats = this.workflowEngine.getStats();
      const permissionStats = {
        permissions: this.permissionManager.getPermissionStatus(),
        features: this.permissionManager.getAvailableFeatures()
      };
      
      return {
        ...dbStats,
        workflows: workflowStats,
        permissions: permissionStats
      };
    });

    // Session management IPC handlers
    ipcMain.handle('get-active-sessions', async () => {
      return await this.sessionManager.getActiveSessions();
    });

    ipcMain.handle('get-session', async (event, sessionId) => {
      return await this.sessionManager.getSession(sessionId);
    });

    ipcMain.handle('get-session-items', async (event, sessionId) => {
      return await this.sessionManager.getSessionItems(sessionId);
    });

    ipcMain.handle('get-sessions-by-type', async (event, sessionType) => {
      return await this.sessionManager.getSessionsByType(sessionType);
    });

    // Search sessions
    ipcMain.handle('search-sessions', async (event, query) => {
      return await this.sessionManager.searchSessions(query);
    });

    // Clear all sessions
    ipcMain.handle('clear-all-sessions', async () => {
      return await this.sessionManager.clearAllSessions();
    });

    // Session research action
    ipcMain.handle('perform-session-research', async (event, sessionId) => {
      try {
        console.log(`Main: Performing session research for session ${sessionId}`);
        const result = await this.sessionManager.performSessionResearch(sessionId);
        return { success: true, result };
      } catch (error) {
        console.error('Main: Session research failed:', error);
        return { success: false, error: error.message };
      }
    });

    // Permission management IPC handlers
    ipcMain.handle('get-permissions', async () => {
      return this.permissionManager.getPermissionStatus();
    });

    ipcMain.handle('request-permission', async (event, permissionType) => {
      switch (permissionType) {
        case 'accessibility':
          return await this.permissionManager.requestAccessibilityPermission();
        case 'screenRecording':
          return await this.permissionManager.requestScreenRecordingPermission();
        case 'automation':
          return await this.permissionManager.requestAutomationPermission();
        default:
          return false;
      }
    });

    ipcMain.handle('show-permission-guide', async () => {
      return await this.permissionManager.showPermissionGuide();
    });

    ipcMain.handle('get-available-features', async () => {
      return this.permissionManager.getAvailableFeatures();
    });

    // Workflow management IPC handlers
    ipcMain.handle('get-workflows', async () => {
      return this.workflowEngine.getAllWorkflows();
    });

    ipcMain.handle('get-workflow', async (event, workflowId) => {
      return this.workflowEngine.getWorkflow(workflowId);
    });

    ipcMain.handle('run-workflow', async (event, workflowId, data, options) => {
      return await this.workflowEngine.runWorkflow(workflowId, data, options);
    });

    ipcMain.handle('get-workflow-executions', async () => {
      return this.workflowEngine.getAllExecutions();
    });

    ipcMain.handle('get-workflow-execution', async (event, executionId) => {
      return this.workflowEngine.getExecution(executionId);
    });

    ipcMain.handle('cancel-workflow-execution', async (event, executionId) => {
      return this.workflowEngine.cancelExecution(executionId);
    });

    ipcMain.handle('get-workflow-stats', async () => {
      return this.workflowEngine.getStats();
    });

    // Paste Assistant IPC handlers
    ipcMain.on('execute-paste-action', async (event, action) => {
      try {
        await this.pasteAssistant.executeAction(action);
      } catch (error) {
        console.error('Error executing paste action:', error);
      }
    });

    ipcMain.on('close-overlay', (event) => {
      this.pasteAssistant.hideOverlay();
    });

    // Test overlay functionality
    ipcMain.handle('test-overlay', async () => {
      await this.pasteAssistant.testOverlay();
      return true;
    });

    // Open external URL in default browser
    ipcMain.handle('open-external', async (event, url) => {
      try {
        console.log(`Opening external URL: ${url}`);
        await shell.openExternal(url);
        return { success: true };
      } catch (error) {
        console.error('Error opening external URL:', error);
        return { success: false, error: error.message };
      }
    });
  }
}

// Initialize and start the app
const flowClip = new FlowClipApp();
flowClip.init().catch(console.error); 