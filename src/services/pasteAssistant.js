const { BrowserWindow, screen, globalShortcut } = require('electron');
const path = require('path');

class PasteAssistant {
  constructor(database, aiService) {
    this.database = database;
    this.aiService = aiService;
    this.overlayWindow = null;
    this.currentPasteContext = null;
  }

  async init() {
    console.log('PasteAssistant initializing...');
    this.createOverlayWindow();
    // Don't start separate monitoring - we'll be called by main clipboard system
    console.log('PasteAssistant ready for clipboard events');
  }

  createOverlayWindow() {
    console.log('Creating overlay window...');
    
    this.overlayWindow = new BrowserWindow({
      width: 300,
      height: 200,
      frame: false,
      show: false,
      alwaysOnTop: true,
      transparent: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false
      }
    });

    // Load the overlay UI
    const overlayPath = path.join(__dirname, '../renderer/overlay.html');
    console.log('Loading overlay from:', overlayPath);
    
    this.overlayWindow.loadFile(overlayPath).then(() => {
      console.log('Overlay window loaded successfully');
    }).catch(error => {
      console.error('Failed to load overlay window:', error);
    });

    // Prevent overlay from taking focus
    this.overlayWindow.setIgnoreMouseEvents(false);
    
    // Hide overlay when it loses focus or after timeout
    this.overlayWindow.on('blur', () => {
      console.log('Overlay window lost focus, hiding...');
      this.hideOverlay();
    });

    // Debug overlay window events
    this.overlayWindow.on('closed', () => {
      console.log('Overlay window closed');
    });
  }

  // No longer needed - integrated with main clipboard monitoring

  async handlePasteDetected(clipboardItem) {
    console.log('Paste detected for item:', clipboardItem.id);

    try {
      // Get smart actions for this content
      const actions = await this.getSmartActions(clipboardItem);
      
      if (actions && actions.length > 0) {
        // Show overlay with smart actions
        await this.showSmartActionOverlay(clipboardItem, actions);
      }
    } catch (error) {
      console.error('Error handling paste detection:', error);
    }
  }

  async getSmartActions(clipboardItem) {
    try {
      // Check if we have cached action recommendations
      const aiTasks = await this.database.getAITasksForClipboardItem(clipboardItem.id);
      const actionTask = aiTasks.find(task => task.task_type === 'langgraph_action_recommendation');
      
      if (actionTask && actionTask.status === 'completed' && actionTask.result) {
        const result = JSON.parse(actionTask.result);
        return result.recommendedActions || [];
      }

      // If no cached recommendations and AI is configured, generate them
      if (this.aiService.isConfigured() && this.aiService.langGraphClient) {
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

        const result = await this.aiService.langGraphClient.executeWorkflow('action_recommendation', workflowData);
        return result.recommendedActions || [];
      }

      return [];
    } catch (error) {
      console.error('Error getting smart actions:', error);
      return [];
    }
  }

  async showSmartActionOverlay(clipboardItem, actions) {
    console.log('Showing smart action overlay for item:', clipboardItem.id);
    console.log('Actions to show:', actions.map(a => a.action));

    if (!this.overlayWindow) {
      console.error('Overlay window not initialized');
      return;
    }

    const cursorPos = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPos);
    
    console.log('Cursor position:', cursorPos);
    console.log('Display bounds:', display.bounds);
    
    // Position overlay near cursor but ensure it's visible
    const overlayX = Math.min(cursorPos.x + 20, display.bounds.x + display.bounds.width - 300);
    const overlayY = Math.min(cursorPos.y + 20, display.bounds.y + display.bounds.height - 200);

    console.log('Setting overlay position to:', { x: overlayX, y: overlayY });
    this.overlayWindow.setPosition(overlayX, overlayY);
    
    // Store current paste context
    this.currentPasteContext = {
      clipboardItem,
      actions,
      position: cursorPos
    };

    // Wait for overlay to be ready before sending data
    await new Promise(resolve => {
      if (this.overlayWindow.webContents.isLoading()) {
        this.overlayWindow.webContents.once('did-finish-load', resolve);
      } else {
        resolve();
      }
    });

    console.log('Sending smart actions data to overlay...');
    
    // Send data to overlay window
    this.overlayWindow.webContents.send('show-smart-actions', {
      clipboardItem,
      actions: actions.slice(0, 3), // Show top 3 actions
      position: cursorPos
    });

    console.log('Showing overlay window...');
    this.overlayWindow.show();
    this.overlayWindow.focus();

    // Auto-hide after 10 seconds
    setTimeout(() => {
      console.log('Auto-hiding overlay after timeout');
      this.hideOverlay();
    }, 10000);
  }

  hideOverlay() {
    console.log('Hiding overlay...');
    if (this.overlayWindow && this.overlayWindow.isVisible()) {
      console.log('Overlay window is visible, hiding it');
      this.overlayWindow.hide();
      this.currentPasteContext = null;
    } else {
      console.log('Overlay window is not visible or does not exist');
    }
  }

  async executeAction(action) {
    if (!this.currentPasteContext) return;

    const { clipboardItem } = this.currentPasteContext;
    
    try {
      console.log(`Executing paste action: ${action}`);
      
      // Execute the AI task
      const result = await this.aiService.triggerTask(clipboardItem.id, action);
      
      if (result && result.result) {
        // Replace clipboard content with result
        await this.replaceClipboardWithResult(action, result.result);
        
        // Optionally paste the new content automatically
        await this.pasteReplacementText();
      }

      this.hideOverlay();
    } catch (error) {
      console.error('Error executing paste action:', error);
      this.hideOverlay();
    }
  }

  async replaceClipboardWithResult(action, result) {
    const { clipboard } = require('electron');
    
    let replacementText = '';
    
    // Format result based on action type
    switch (action) {
      case 'summarize':
        replacementText = typeof result === 'object' ? result.summary : result;
        break;
      case 'translate':
        replacementText = typeof result === 'object' ? result.translated_text : result;
        break;
      case 'explain':
        replacementText = typeof result === 'object' ? result.explanation : result;
        break;
      case 'research':
        if (typeof result === 'object' && result.research_suggestions) {
          replacementText = `Research Insights:\n${result.research_suggestions}`;
        } else {
          replacementText = result;
        }
        break;
      case 'fact_check':
        if (typeof result === 'object' && result.fact_check_analysis) {
          replacementText = `Fact Check:\n${result.fact_check_analysis}`;
        } else {
          replacementText = result;
        }
        break;
      default:
        replacementText = typeof result === 'object' ? JSON.stringify(result, null, 2) : result;
    }

    // Update clipboard with processed content
    clipboard.writeText(replacementText);
    console.log('Clipboard updated with processed content');
  }

  async pasteReplacementText() {
    // Use accessibility APIs or keyboard automation to paste
    // This is a simplified approach - in production you'd want more sophisticated text replacement
    try {
      const { exec } = require('child_process');
      
      // Use AppleScript to simulate paste on macOS
      const script = `
        tell application "System Events"
          keystroke "v" using command down
        end tell
      `;
      
      exec(`osascript -e '${script}'`, (error) => {
        if (error) {
          console.error('Error auto-pasting:', error);
        } else {
          console.log('Auto-paste successful');
        }
      });
    } catch (error) {
      console.error('Error in auto-paste:', error);
    }
  }

  // Called by main clipboard monitoring when content changes
  async onClipboardChange(content, clipboardItem) {
    console.log('PasteAssistant: Received clipboard change notification');
    console.log('Content preview:', content.substring(0, 100) + '...');
    
    if (clipboardItem) {
      console.log('✅ FlowClip content detected! Item ID:', clipboardItem.id);
      
      // DISABLED: Auto-showing smart action overlay on paste
      // Users can manually access smart actions through keyboard shortcuts or UI
      // setTimeout(async () => {
      //   await this.handlePasteDetected(clipboardItem);
      // }, 1000);
      
      console.log('Smart actions available - use keyboard shortcuts or UI to access');
    } else {
      console.log('❌ Content not from FlowClip, ignoring');
    }
  }

  // Manual test method to trigger overlay
  async testOverlay() {
    console.log('PasteAssistant: Testing overlay manually...');
    
    // Get the most recent clipboard item
    const items = await this.database.getClipboardHistory({ limit: 1 });
    if (items.length > 0) {
      const testItem = items[0];
      console.log('PasteAssistant: Using test item:', testItem.id);
      
      // Generate test actions
      const testActions = [
        { action: 'research', priority: 'high', reason: 'Test research action', confidence: 0.9 },
        { action: 'summarize', priority: 'medium', reason: 'Test summarize action', confidence: 0.8 }
      ];
      
      await this.showSmartActionOverlay(testItem, testActions);
    } else {
      console.log('PasteAssistant: No clipboard items found for testing');
    }
  }

  destroy() {
    console.log('PasteAssistant: Destroying...');
    if (this.overlayWindow) {
      this.overlayWindow.close();
      this.overlayWindow = null;
    }
  }
}

module.exports = PasteAssistant; 