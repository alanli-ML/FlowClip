const { exec } = require('child_process');
const { promisify } = require('util');
const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

class PermissionManager {
  constructor() {
    this.permissions = {
      accessibility: false,
      screenRecording: false,
      automation: false
    };
    this.checkInterval = null;
  }

  async init() {
    await this.checkAllPermissions();
    this.startPermissionMonitoring();
  }

  async checkAllPermissions() {
    this.permissions.accessibility = await this.checkAccessibilityPermission();
    this.permissions.screenRecording = await this.checkScreenRecordingPermission();
    this.permissions.automation = await this.checkAutomationPermission();
    
    return this.permissions;
  }

  async checkAccessibilityPermission() {
    try {
      if (process.platform !== 'darwin') return true;

      // Try to execute a simple AppleScript that requires accessibility
      const script = `tell application "System Events"
        try
          set frontApp to name of first application process whose frontmost is true
          return frontApp
        on error
          return "PERMISSION_DENIED"
        end try
      end tell`;

      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const result = stdout.trim();
      
      return result !== "PERMISSION_DENIED" && result !== "";
    } catch (error) {
      // If error contains specific permission messages
      if (error.message.includes('not allowed assistive access') || 
          error.message.includes("Application isn't running")) {
        return false;
      }
      return false;
    }
  }

  async checkScreenRecordingPermission() {
    try {
      if (process.platform !== 'darwin') return true;

      // Try to capture a test screenshot to trigger permission dialog
      // This will make FlowClip appear in System Preferences > Screen Recording
      const tempDir = path.join(require('os').tmpdir(), 'flowclip-test');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const testScreenshotPath = path.join(tempDir, 'permission-test.png');
      
      try {
        // First try to get the frontmost window for a focused capture test
        const windowTestScript = `tell application "System Events"
          try
            set frontApp to first application process whose frontmost is true
            set frontWindow to front window of frontApp
            set windowId to id of frontWindow
            return windowId
          on error
            return "0"
          end try
        end tell`;
        
        const { stdout: windowId } = await execAsync(`osascript -e '${windowTestScript}'`);
        
        if (windowId.trim() && windowId.trim() !== "0") {
          // Try window-specific capture which will trigger permission dialog
          await execAsync(`screencapture -l ${windowId.trim()} -x "${testScreenshotPath}"`);
        } else {
          // Fallback to screen capture which will also trigger permission dialog
          await execAsync(`screencapture -x -t png "${testScreenshotPath}"`);
        }
        
        // Check if file was created successfully
        const hasPermission = fs.existsSync(testScreenshotPath);
        
        // Clean up test file
        if (hasPermission) {
          try {
            fs.unlinkSync(testScreenshotPath);
          } catch (cleanupError) {
            console.log('Could not clean up test screenshot:', cleanupError.message);
          }
        }
        
        return hasPermission;
      } catch (captureError) {
        console.log('Screen capture test failed:', captureError.message);
        return false;
      }
    } catch (error) {
      console.log('Error checking screen recording permission:', error.message);
      return false;
    }
  }

  async checkAutomationPermission() {
    try {
      if (process.platform !== 'darwin') return true;

      // Test automation permission by trying to control System Events
      const script = `tell application "System Events"
        try
          set processCount to count of processes
          return "GRANTED"
        on error
          return "DENIED"
        end try
      end tell`;

      const { stdout } = await execAsync(`osascript -e '${script}'`);
      return stdout.trim() === "GRANTED";
    } catch (error) {
      return false;
    }
  }

  async requestAccessibilityPermission() {
    if (process.platform !== 'darwin') return true;

    const response = await dialog.showMessageBox(null, {
      type: 'info',
      title: 'Accessibility Permission Required',
      message: 'FlowClip needs Accessibility permission to capture context from other applications.',
      detail: 'This permission allows FlowClip to:\n• Detect which app you\'re copying from\n• Capture window titles for context\n• Provide rich clipboard history\n\nYour privacy is protected - all data stays on your device.',
      buttons: ['Open System Preferences', 'Skip for Now', 'Learn More'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      // Open System Preferences to Privacy & Security > Accessibility
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      
      // Show follow-up dialog with instructions
      await dialog.showMessageBox(null, {
        type: 'info',
        title: 'Grant Accessibility Permission',
        message: 'Please follow these steps:',
        detail: '1. Find "Electron" or "FlowClip" in the list\n2. Check the box next to the application\n3. If not listed, click the "+" button and add it\n4. You may need to restart FlowClip\n\nClick OK when you\'ve granted permission.',
        buttons: ['OK']
      });

      // Recheck permission after user interaction
      return await this.checkAccessibilityPermission();
    } else if (response.response === 2) {
      // Learn More
      await shell.openExternal('https://github.com/your-repo/flowclip#permissions');
      return await this.requestAccessibilityPermission(); // Show dialog again
    }

    return false;
  }

  async requestScreenRecordingPermission() {
    if (process.platform !== 'darwin') return true;

    // First, trigger the permission check to make FlowClip appear in System Preferences
    console.log('Triggering screen recording permission check...');
    await this.checkScreenRecordingPermission();

    const response = await dialog.showMessageBox(null, {
      type: 'info',
      title: 'Screen Recording Permission Required',
      message: 'FlowClip can capture screenshots to provide visual context for your clipboard items.',
      detail: 'This permission is optional but recommended for:\n• Visual context of copied content\n• Better understanding of clipboard usage\n• Enhanced AI analysis capabilities\n\nYou can always disable this in Settings.',
      buttons: ['Open System Preferences', 'Skip Screenshots', 'Learn More'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      
      await dialog.showMessageBox(null, {
        type: 'info',
        title: 'Grant Screen Recording Permission',
        message: 'Please follow these steps:',
        detail: '1. Look for "Electron" or "FlowClip" in the Screen Recording list\n2. Check the box next to the application\n3. If not listed, the app may need to restart to appear\n4. Restart FlowClip for changes to take effect\n\nClick OK when you\'ve granted permission.',
        buttons: ['OK']
      });

      return await this.checkScreenRecordingPermission();
    } else if (response.response === 2) {
      await shell.openExternal('https://github.com/your-repo/flowclip#permissions');
      return await this.requestScreenRecordingPermission();
    }

    return false;
  }

  async requestAutomationPermission() {
    if (process.platform !== 'darwin') return true;

    const response = await dialog.showMessageBox(null, {
      type: 'info',
      title: 'Automation Permission Required',
      message: 'FlowClip needs Automation permission to interact with other applications for context capture.',
      detail: 'This permission allows FlowClip to:\n• Communicate with browsers and text editors\n• Extract contextual information\n• Provide intelligent clipboard analysis\n\nAll processing happens locally on your device.',
      buttons: ['Open System Preferences', 'Skip Context Features', 'Learn More'],
      defaultId: 0,
      cancelId: 1
    });

    if (response.response === 0) {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation');
      
      await dialog.showMessageBox(null, {
        type: 'info',
        title: 'Grant Automation Permission',
        message: 'Please follow these steps:',
        detail: '1. Find "Electron" or "FlowClip" in the list\n2. Check the boxes for apps you want FlowClip to interact with\n3. Common apps: Safari, Chrome, TextEdit, VS Code\n4. You can always modify these later\n\nClick OK when you\'ve configured permissions.',
        buttons: ['OK']
      });

      return await this.checkAutomationPermission();
    } else if (response.response === 2) {
      await shell.openExternal('https://github.com/your-repo/flowclip#permissions');
      return await this.requestAutomationPermission();
    }

    return false;
  }

  async showPermissionGuide() {
    const permissions = await this.checkAllPermissions();
    const missingPermissions = [];

    if (!permissions.accessibility) missingPermissions.push('Accessibility');
    if (!permissions.screenRecording) missingPermissions.push('Screen Recording');
    if (!permissions.automation) missingPermissions.push('Automation');

    if (missingPermissions.length === 0) {
      await dialog.showMessageBox(null, {
        type: 'info',
        title: 'All Permissions Granted',
        message: 'FlowClip has all the necessary permissions!',
        detail: 'Your clipboard manager is ready to provide intelligent, context-aware clipboard management.',
        buttons: ['Great!']
      });
      return true;
    }

    const response = await dialog.showMessageBox(null, {
      type: 'warning',
      title: 'Permissions Required',
      message: 'FlowClip needs additional permissions to work properly.',
      detail: `Missing permissions:\n${missingPermissions.map(p => `• ${p}`).join('\n')}\n\nWithout these permissions, FlowClip will have limited functionality.`,
      buttons: ['Grant Permissions', 'Continue Anyway', 'Quit'],
      defaultId: 0,
      cancelId: 2
    });

    if (response.response === 0) {
      // Guide through granting permissions
      if (!permissions.accessibility) {
        await this.requestAccessibilityPermission();
      }
      if (!permissions.screenRecording) {
        await this.requestScreenRecordingPermission();
      }
      if (!permissions.automation) {
        await this.requestAutomationPermission();
      }
      return await this.checkAllPermissions();
    } else if (response.response === 2) {
      app.quit();
      return false;
    }

    return false;
  }

  startPermissionMonitoring() {
    // Check permissions every 30 seconds
    this.checkInterval = setInterval(async () => {
      const oldPermissions = { ...this.permissions };
      await this.checkAllPermissions();
      
      // Notify if permissions changed
      if (JSON.stringify(oldPermissions) !== JSON.stringify(this.permissions)) {
        console.log('Permissions updated:', this.permissions);
        // Emit event for other components to react
        if (this.onPermissionsChanged) {
          this.onPermissionsChanged(this.permissions);
        }
      }
    }, 30000);
  }

  stopPermissionMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getPermissionStatus() {
    return { ...this.permissions };
  }

  hasAllPermissions() {
    return this.permissions.accessibility && 
           this.permissions.screenRecording && 
           this.permissions.automation;
  }

  hasMinimalPermissions() {
    // At minimum, need accessibility for basic context capture
    return this.permissions.accessibility;
  }

  async ensurePermissions(required = ['accessibility']) {
    const permissions = await this.checkAllPermissions();
    const missing = [];

    for (const permission of required) {
      if (!permissions[permission]) {
        missing.push(permission);
      }
    }

    if (missing.length === 0) return true;

    // Request missing permissions
    for (const permission of missing) {
      switch (permission) {
        case 'accessibility':
          await this.requestAccessibilityPermission();
          break;
        case 'screenRecording':
          await this.requestScreenRecordingPermission();
          break;
        case 'automation':
          await this.requestAutomationPermission();
          break;
      }
    }

    // Recheck after requests
    return await this.checkAllPermissions();
  }

  async showOnboardingFlow() {
    const response = await dialog.showMessageBox(null, {
      type: 'info',
      title: 'Welcome to FlowClip',
      message: 'Let\'s set up your intelligent clipboard manager!',
      detail: 'FlowClip captures your clipboard with context to provide AI-powered insights and suggestions.\n\nTo get started, we need to set up some macOS permissions.',
      buttons: ['Set Up Permissions', 'Learn More', 'Skip Setup'],
      defaultId: 0
    });

    if (response.response === 0) {
      return await this.showPermissionGuide();
    } else if (response.response === 1) {
      await shell.openExternal('https://github.com/your-repo/flowclip#getting-started');
      return await this.showOnboardingFlow();
    }

    return false;
  }

  // Graceful degradation helpers
  getAvailableFeatures() {
    const features = {
      basicClipboard: true, // Always available
      contextCapture: this.permissions.accessibility,
      screenshots: this.permissions.screenRecording,
      appIntegration: this.permissions.automation,
      aiAnalysis: true // Depends on API key, not permissions
    };

    return features;
  }

  getFeatureMessage(feature) {
    const messages = {
      contextCapture: 'Enable Accessibility permission to capture context from other applications',
      screenshots: 'Enable Screen Recording permission to capture visual context',
      appIntegration: 'Enable Automation permission for enhanced app integration'
    };

    return messages[feature] || 'Feature requires additional permissions';
  }

  destroy() {
    this.stopPermissionMonitoring();
  }
}

module.exports = PermissionManager; 