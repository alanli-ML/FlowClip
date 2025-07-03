const screenshot = require('screenshot-desktop');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ContextCapture {
  constructor() {
    this.screenshotDir = path.join(app.getPath('userData'), 'screenshots');
    this.ensureScreenshotDir();
    this.permissions = {
      accessibility: false,
      screenRecording: false,
      automation: false
    };
    this.isEnabled = true;
    this.debugMode = false;
  }

  ensureScreenshotDir() {
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  setPermissions(permissions) {
    this.permissions = { ...permissions };
    console.log('ContextCapture permissions updated:', this.permissions);
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  setDebugMode(debug) {
    this.debugMode = debug;
  }

  log(message, data = null) {
    if (this.debugMode) {
      console.log(`[ContextCapture] ${message}`, data || '');
    }
  }

  async captureContext() {
    if (!this.isEnabled) {
      this.log('Context capture disabled');
      return this.getEmptyContext();
    }

    const context = {
      activeApp: 'Unknown',
      windowTitle: 'Unknown',
      screenshotPath: null,
      surroundingText: null,
      timestamp: new Date().toISOString(),
      captureMethod: 'limited' // 'full', 'partial', 'limited', 'failed'
    };

    // Capture active window info
    if (this.permissions.accessibility) {
      try {
        const windowInfo = await this.getActiveWindowInfo();
        context.activeApp = windowInfo.app;
        context.windowTitle = windowInfo.title;
        context.captureMethod = 'partial';
        this.log('Window info captured', windowInfo);
      } catch (error) {
        this.log('Failed to capture window info', error.message);
        // Try fallback method
        try {
          const basicInfo = await this.getBasicWindowInfo();
          context.activeApp = basicInfo.app;
          context.captureMethod = 'limited';
          this.log('Basic window info captured', basicInfo);
        } catch (fallbackError) {
          this.log('All window info capture methods failed', fallbackError.message);
        }
      }
    } else {
      this.log('Accessibility permission not granted, skipping window info');
    }

    // Capture screenshot
    if (this.permissions.screenRecording) {
      try {
        context.screenshotPath = await this.captureScreenshot();
        context.captureMethod = context.captureMethod === 'partial' ? 'full' : 'partial';
        this.log('Screenshot captured', context.screenshotPath);
      } catch (error) {
        this.log('Failed to capture screenshot', error.message);
      }
    } else {
      this.log('Screen recording permission not granted, skipping screenshot');
    }

    // Capture surrounding text
    if (this.permissions.automation && this.permissions.accessibility) {
      try {
        context.surroundingText = await this.getSurroundingText(context.activeApp);
        context.captureMethod = 'full';
        this.log('Surrounding text captured', context.surroundingText?.substring(0, 100));
      } catch (error) {
        this.log('Failed to capture surrounding text', error.message);
      }
    } else {
      this.log('Automation/Accessibility permissions not granted, skipping text capture');
    }

    return context;
  }

  getEmptyContext() {
    return {
      activeApp: 'Unknown',
      windowTitle: 'Unknown',
      screenshotPath: null,
      surroundingText: null,
      timestamp: new Date().toISOString(),
      captureMethod: 'disabled'
    };
  }

  async getActiveWindowInfo() {
    if (process.platform !== 'darwin') {
      throw new Error('Platform not supported');
    }

    const script = `tell application "System Events"
      try
        set frontApp to name of first application process whose frontmost is true
        set frontWindow to name of front window of first application process whose frontmost is true
        return frontApp & "|" & frontWindow
      on error errMsg
        try
          set frontApp to name of first application process whose frontmost is true
          return frontApp & "|" & "Unknown Window"
        on error
          return "Unknown|Unknown"
        end try
      end try
    end tell`;

    const { stdout } = await execAsync(`osascript -e '${script}'`);
    const result = stdout.trim();
    
    if (!result || result === 'Unknown|Unknown') {
      throw new Error('Could not determine active window');
    }

    const [app, title] = result.split('|');
    return {
      app: app || 'Unknown',
      title: title || 'Unknown'
    };
  }

  async getBasicWindowInfo() {
    if (process.platform !== 'darwin') {
      throw new Error('Platform not supported');
    }

    // Fallback method using system_profiler or other methods
    try {
      const script = `tell application "System Events"
        try
          set frontApp to name of first application process whose frontmost is true
          return frontApp
        on error
          return "Unknown"
        end try
      end tell`;

      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const app = stdout.trim();
      
      return {
        app: app || 'Unknown',
        title: 'Unknown'
      };
    } catch (error) {
      // Last resort - try to get running apps
      const script2 = `tell application "System Events"
        try
          set runningApps to name of every application process whose background only is false
          return item 1 of runningApps
        on error
          return "Unknown"
        end try
      end tell`;

      const { stdout } = await execAsync(`osascript -e '${script2}'`);
      return {
        app: stdout.trim() || 'Unknown',
        title: 'Unknown'
      };
    }
  }

  async captureScreenshot() {
    try {
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const screenshotDir = path.join(process.cwd(), 'screenshots');
      
      // Ensure screenshots directory exists
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      
      const screenshotPath = path.join(screenshotDir, filename);
      
      this.log('🖼️ Starting intelligent screenshot capture (dialog-aware)...');
      
      // Try window-specific capture methods in order of preference
      if (process.platform === 'darwin') {
        // Method 1: Try enhanced window bounds capture (filters out dialogs)
        try {
          this.log('📐 Attempting enhanced window bounds capture (avoids dialogs)...');
          const windowCapture = await this.captureWindowBounds(screenshotPath);
          if (windowCapture) {
            this.log(`✅ Enhanced window bounds screenshot successful: ${screenshotPath}`);
            return screenshotPath;
          } else {
            this.log('⚠️ Enhanced window bounds capture found no suitable windows');
          }
        } catch (boundsError) {
          this.log('❌ Enhanced window bounds capture failed', boundsError.message);
        }
        
        // Method 2: Try smart frontmost window capture (also filters dialogs)
        try {
          this.log('🎯 Attempting smart frontmost window capture...');
          const frontCapture = await this.captureFrontmostWindow(screenshotPath);
          if (frontCapture) {
            this.log(`✅ Smart frontmost window screenshot successful: ${screenshotPath}`);
            return frontCapture;
          } else {
            this.log('⚠️ Smart frontmost capture found no suitable windows');
          }
        } catch (frontError) {
          this.log('❌ Smart frontmost window capture failed', frontError.message);
        }
        
        // Method 3: Try AppleScript-based window ID capture (legacy method)
        try {
          this.log('🔄 Attempting legacy window ID capture...');
          const windowIdCapture = await this.captureActiveWindowScreenshot(screenshotPath);
          if (windowIdCapture) {
            this.log(`✅ Legacy window ID screenshot successful: ${screenshotPath}`);
            return screenshotPath;
          } else {
            this.log('⚠️ Legacy window ID capture failed');
          }
        } catch (idError) {
          this.log('❌ Legacy window ID capture failed', idError.message);
        }
      }
      
      // Fallback to full screen only if all automatic window methods fail
      this.log('🖥️ All intelligent window capture methods failed, falling back to full screen');
      const img = await screenshot({ filename: screenshotPath });
      this.log(`📷 Full screenshot saved to: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      this.log('💥 Screenshot capture completely failed', error.message);
      throw error;
    }
  }

  async captureWindowBounds(screenshotPath) {
    try {
      this.log('Getting window geometry for bounds capture...');
      
      // Use a simpler, more reliable approach by writing AppleScript to temp file
      const tempDir = os.tmpdir();
      const scriptPath = path.join(tempDir, `flowclip_window_bounds_${Date.now()}.scpt`);
      
      const appleScript = `tell application "System Events"
        try
          set frontApp to first application process whose frontmost is true
		set allWindows to every window of frontApp
		set bestWindow to null
		set maxArea to 0
		
		repeat with currentWindow in allWindows
			try
				if visible of currentWindow is true then
					set windowSize to size of currentWindow
					set w to item 1 of windowSize as integer
					set h to item 2 of windowSize as integer
					set area to w * h
					if w > 300 and h > 200 and area > maxArea then
						set maxArea to area
						set bestWindow to currentWindow
					end if
				end if
			end try
		end repeat
		
		if bestWindow is null then
          if exists front window of frontApp then
				set bestWindow to front window of frontApp
			else
				return "NONE"
			end if
		end if
		
		set windowPos to position of bestWindow
		set windowSize to size of bestWindow
            set x to item 1 of windowPos as integer
            set y to item 2 of windowPos as integer
            set w to item 1 of windowSize as integer
            set h to item 2 of windowSize as integer
            return (x as string) & "," & (y as string) & "," & (w as string) & "," & (h as string)
		
        on error errMsg
          return "ERROR:" & errMsg
        end try
      end tell`;

      // Write script to temp file
      fs.writeFileSync(scriptPath, appleScript);
      
      try {
        const { stdout } = await execAsync(`osascript "${scriptPath}"`);
      const boundsStr = stdout.trim();
      this.log('Window bounds result:', boundsStr);
      
      if (boundsStr && !boundsStr.startsWith('ERROR:') && boundsStr !== 'NONE') {
        const parts = boundsStr.split(',');
        if (parts.length === 4) {
          const [x, y, width, height] = parts.map(Number);
          
          if (width > 50 && height > 50 && !isNaN(x) && !isNaN(y)) { // Ensure reasonable window size
              this.log(`Capturing main content window at bounds: x=${x}, y=${y}, w=${width}, h=${height}`);
            
            // Use screencapture with specific region
            await execAsync(`screencapture -R ${x},${y},${width},${height} -x "${screenshotPath}"`);
            
            if (fs.existsSync(screenshotPath)) {
              const stats = fs.statSync(screenshotPath);
                this.log(`Main content window screenshot created, size: ${stats.size} bytes`);
              return screenshotPath;
            }
          } else {
            this.log('Invalid window dimensions:', { x, y, width, height });
          }
        } else {
          this.log('Invalid bounds format, expected 4 parts:', parts);
        }
      } else {
        this.log('Bounds capture returned error or no window:', boundsStr);
        }
      } finally {
        // Clean up temp file
        try {
          if (fs.existsSync(scriptPath)) {
            fs.unlinkSync(scriptPath);
          }
        } catch (cleanupError) {
          this.log('Could not clean up temp script file:', cleanupError.message);
        }
      }
      
      return null;
    } catch (error) {
      this.log('Window bounds capture error:', error.message);
      return null;
    }
  }

  async captureFrontmostWindow(screenshotPath) {
    try {
      this.log('Attempting smart frontmost window capture...');
      
      // First try to get the best content window using our smart method
      const bestWindow = await this.getBestContentWindow();
      if (bestWindow && bestWindow.width > 300 && bestWindow.height > 200) {
        this.log(`Found best content window: ${bestWindow.title} (${bestWindow.width}x${bestWindow.height})`);
        
        // Use screencapture with specific region for the best window
        await execAsync(`screencapture -R ${bestWindow.x},${bestWindow.y},${bestWindow.width},${bestWindow.height} -x "${screenshotPath}"`);
        
        if (fs.existsSync(screenshotPath)) {
          const stats = fs.statSync(screenshotPath);
          this.log(`Smart content window screenshot created, size: ${stats.size} bytes`);
          return screenshotPath;
        }
      }
      
      // Fallback to standard frontmost capture if smart method fails
      this.log('Smart method failed, falling back to standard frontmost capture...');
      await execAsync(`screencapture -w -x "${screenshotPath}"`);
      
      if (fs.existsSync(screenshotPath)) {
        const stats = fs.statSync(screenshotPath);
        this.log(`Fallback frontmost window screenshot created, size: ${stats.size} bytes`);
        return screenshotPath;
      }
      
      return null;
    } catch (error) {
      this.log('Frontmost window capture error:', error.message);
      return null;
    }
  }

  // New helper method to get the best content window (avoiding dialogs)
  async getBestContentWindow() {
    try {
      if (process.platform !== 'darwin') {
        return null;
      }

      // Use file-based AppleScript approach for better reliability
      const tempDir = os.tmpdir();
      const scriptPath = path.join(tempDir, `flowclip_best_window_${Date.now()}.scpt`);
      
      const appleScript = `tell application "System Events"
	try
		set frontApp to first application process whose frontmost is true
		set allWindows to every window of frontApp
		set bestWindow to null
		set maxArea to 0
		
		repeat with currentWindow in allWindows
			try
				if visible of currentWindow is true then
					set windowSize to size of currentWindow
					set w to item 1 of windowSize as integer
					set h to item 2 of windowSize as integer
					set area to w * h
					if w > 300 and h > 200 and area > maxArea then
						set maxArea to area
						set bestWindow to currentWindow
					end if
				end if
			end try
		end repeat
		
		if bestWindow is not null then
			set windowPos to position of bestWindow
			set windowSize to size of bestWindow
			set windowTitle to name of bestWindow
			set x to item 1 of windowPos as integer
			set y to item 2 of windowPos as integer
			set w to item 1 of windowSize as integer
			set h to item 2 of windowSize as integer
			return (x as string) & "," & (y as string) & "," & (w as string) & "," & (h as string) & "," & windowTitle
		else
			return "NONE"
		end if
	on error
		return "ERROR"
	end try
end tell`;

      // Write script to temp file
      fs.writeFileSync(scriptPath, appleScript);
      
      try {
        const { stdout } = await execAsync(`osascript "${scriptPath}"`);
        const result = stdout.trim();
        
        if (!result || result === 'NONE' || result === 'ERROR') {
          this.log('Could not get best content window:', result);
          return null;
        }

        // Parse the result
        const parts = result.split(',');
        if (parts.length >= 4) {
          const [x, y, width, height] = parts.map(Number);
          const title = parts.slice(4).join(',') || 'Unknown';
          
          if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
            return {
              x,
              y,
              width,
              height,
              title,
              area: width * height
            };
          }
        }

        return null;
      } finally {
        // Clean up temp file
        try {
          if (fs.existsSync(scriptPath)) {
            fs.unlinkSync(scriptPath);
          }
        } catch (cleanupError) {
          this.log('Could not clean up temp script file:', cleanupError.message);
        }
      }
    } catch (error) {
      this.log('Error getting best content window:', error.message);
      return null;
    }
  }

  // Helper method to detect likely dialog/notification windows
  isLikelyDialog(window) {
    // Size-based detection
    if (window.width < 300 || window.height < 200) {
      return true;
    }
    
    // Very small windows are likely dialogs
    if (window.area < 60000) { // Less than ~300x200
      return true;
    }
    
    // Title-based detection
    const title = window.title ? window.title.toLowerCase() : '';
    const dialogKeywords = [
      'alert', 'warning', 'error', 'confirm', 'dialog', 'notification',
      'sharing', 'permission', 'allow', 'access', 'security', 'privacy',
      'microphone', 'camera', 'screen recording', 'location'
    ];
    
    const hasDialogKeyword = dialogKeywords.some(keyword => title.includes(keyword));
    if (hasDialogKeyword) {
      return true;
    }
    
    // Aspect ratio check - very wide or very tall windows might be notifications
    const aspectRatio = window.width / window.height;
    if (aspectRatio > 4 || aspectRatio < 0.25) {
      return true;
    }
    
    return false;
  }

  async captureActiveWindowScreenshot(screenshotPath) {
    if (process.platform !== 'darwin') {
      return null; // Not supported on other platforms yet
    }

    try {
      this.log('Attempting to get window ID via improved AppleScript...');
      
      // Try a different approach to get window ID using CGWindowID
      const windowIdScript = `tell application "System Events"
        try
          set frontApp to first application process whose frontmost is true
          if exists front window of frontApp then
            set frontWindow to front window of frontApp
            -- Try to get subrole or other identifiers
            set windowInfo to properties of frontWindow
            set windowTitle to name of frontWindow
            return "FOUND:" & windowTitle
          else
            return "NOWINDOW"
          end if
        on error errMsg
          return "ERROR:" & errMsg
        end try
      end tell`;

      const { stdout: windowIdOutput } = await execAsync(`osascript -e '${windowIdScript}'`);
      const result = windowIdOutput.trim();
      this.log('Window ID result:', result);
      
      if (result.startsWith('FOUND:')) {
        // Try to use CGWindowListCreateImage or similar approach
        // For now, let's try a different screencapture approach
        this.log('Attempting alternative window capture method...');
        
        // Try using the -o flag with window selection
        await execAsync(`screencapture -o -x "${screenshotPath}"`);
        
        // Verify the file was created
        if (fs.existsSync(screenshotPath)) {
          const stats = fs.statSync(screenshotPath);
          this.log(`Alternative window screenshot created, size: ${stats.size} bytes`);
          return screenshotPath;
        }
      }
      
      return null;
    } catch (error) {
      this.log('Window ID capture error:', error.message);
      return null;
    }
  }

  async getSurroundingText(activeApp) {
    if (process.platform !== 'darwin') {
      throw new Error('Platform not supported');
    }

    // Don't interfere with clipboard by using keystroke commands
    // Instead, try to get text content from specific applications
    
    try {
      if (this.isBrowserApp(activeApp)) {
        return await this.getBrowserText(activeApp);
      } else if (this.isTextEditorApp(activeApp)) {
        return await this.getTextEditorText(activeApp);
      } else {
        // Generic approach - try to get selected text without modifying clipboard
        return await this.getGenericText();
      }
    } catch (error) {
      this.log('All text capture methods failed', error.message);
      return null;
    }
  }

  isBrowserApp(appName) {
    const browsers = ['Safari', 'Google Chrome', 'Chrome', 'Firefox', 'Microsoft Edge', 'Edge'];
    return browsers.some(browser => appName.includes(browser));
  }

  isTextEditorApp(appName) {
    const editors = ['TextEdit', 'Notes', 'Sublime Text', 'Visual Studio Code', 'Code', 'Atom', 'Vim', 'Emacs'];
    return editors.some(editor => appName.includes(editor));
  }

  async getBrowserText(appName) {
    // Use a much simpler approach - disable browser text capture for now
    // The AppleScript syntax issues are complex and we don't want to break the main functionality
    this.log('Browser text capture temporarily disabled due to AppleScript compatibility issues');
    this.log('Falling back to generic context for browser apps');
    return null;
  }

  async getTextEditorText(appName) {
    // For text editors, try to get some context without disrupting the user
    const script = `tell application "System Events"
      tell process "${appName}"
        try
          -- Try to get the document name or window title for context
          set windowTitle to name of front window
          return "Working in: " & windowTitle
        on error
          return "Text editor context"
        end try
      end tell
    end tell`;

    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return stdout.trim() || null;
  }

  async getGenericText() {
    // Generic method that tries to get context without disrupting clipboard
    const script = `tell application "System Events"
      try
        set frontApp to name of first application process whose frontmost is true
        set windowTitle to name of front window of first application process whose frontmost is true
        return "Context: " & frontApp & " - " & windowTitle
      on error
        return "Generic context"
      end try
    end tell`;

    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return stdout.trim() || null;
  }

  // Utility methods for permission management
  getCapabilities() {
    return {
      windowInfo: this.permissions.accessibility,
      screenshots: this.permissions.screenRecording,
      textCapture: this.permissions.automation && this.permissions.accessibility,
      basicInfo: true // Always available
    };
  }

  getPermissionMessages() {
    const messages = [];
    
    if (!this.permissions.accessibility) {
      messages.push('Enable Accessibility permission for window context');
    }
    if (!this.permissions.screenRecording) {
      messages.push('Enable Screen Recording permission for visual context');
    }
    if (!this.permissions.automation) {
      messages.push('Enable Automation permission for text context');
    }

    return messages;
  }

  // Cleanup old screenshots to prevent disk space issues
  async cleanupOldScreenshots(daysOld = 7) {
    try {
      const screenshotDir = path.join(process.cwd(), 'screenshots');
      if (!fs.existsSync(screenshotDir)) return;

      const files = fs.readdirSync(screenshotDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.startsWith('screenshot_') && file.endsWith('.png')) {
          const filePath = path.join(screenshotDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
            this.log(`Cleaned up old screenshot: ${file}`);
          }
        }
      }
    } catch (error) {
      this.log('Error cleaning up screenshots', error.message);
    }
  }

  async getApplicationDetails() {
    try {
      if (process.platform === 'darwin') {
        const script = `
          tell application "System Events"
            try
              set frontApp to first application process whose frontmost is true
              set appName to name of frontApp
              set appPath to POSIX path of (file of frontApp as string)
              set bundleId to bundle identifier of frontApp
              return appName & "|" & appPath & "|" & bundleId
            on error
              return "Unknown|Unknown|Unknown"
            end try
          end tell
        `;

        const { stdout } = await execAsync(`osascript -e '${script}'`);
        const [name, path, bundleId] = stdout.trim().split('|');
        
        return { name, path, bundleId };
      }
      return { name: 'Unknown', path: 'Unknown', bundleId: 'Unknown' };
    } catch (error) {
      console.error('Error getting application details:', error);
      return { name: 'Error', path: 'Error', bundleId: 'Error' };
    }
  }

  async getCursorPosition() {
    try {
      if (process.platform === 'darwin') {
        const script = `
          tell application "System Events"
            try
              set cursorPos to (do shell script "python3 -c 'import Cocoa; print(Cocoa.NSEvent.mouseLocation().x, Cocoa.NSEvent.mouseLocation().y)'")
              return cursorPos
            on error
              return "0 0"
            end try
          end tell
        `;

        const { stdout } = await execAsync(`osascript -e '${script}'`);
        const [x, y] = stdout.trim().split(' ').map(Number);
        return { x, y };
      }
      return { x: 0, y: 0 };
    } catch (error) {
      console.error('Error getting cursor position:', error);
      return { x: 0, y: 0 };
    }
  }

  async captureEnhancedContext() {
    try {
      const context = await this.captureContext();
      
      // Add enhanced information
      const appDetails = await this.getApplicationDetails();
      const windowGeometry = await this.getWindowGeometry();
      const cursorPosition = await this.getCursorPosition();
      
      // Only get browser text if we have a browser app
      let browserText = null;
      if (this.isBrowserApp(context.activeApp)) {
        try {
          browserText = await this.getBrowserText(context.activeApp);
        } catch (error) {
          this.log('Failed to get browser text', error.message);
        }
      }

      return {
        ...context,
        appDetails,
        windowGeometry,
        cursorPosition,
        browserText,
        enhanced: true
      };
    } catch (error) {
      console.error('Error capturing enhanced context:', error);
      return await this.captureContext();
    }
  }

  async getWindowGeometry() {
    try {
      if (process.platform === 'darwin') {
        const script = `
          tell application "System Events"
            try
              set frontApp to first application process whose frontmost is true
              set frontWindow to front window of frontApp
              set windowPosition to position of frontWindow
              set windowSize to size of frontWindow
              return (item 1 of windowPosition) & "," & (item 2 of windowPosition) & "," & (item 1 of windowSize) & "," & (item 2 of windowSize)
            on error
              return "0,0,0,0"
            end try
          end tell
        `;

        const { stdout } = await execAsync(`osascript -e '${script}'`);
        const [x, y, width, height] = stdout.trim().split(',').map(Number);
        
        return { x, y, width, height };
      }
      return { x: 0, y: 0, width: 0, height: 0 };
    } catch (error) {
      console.error('Error getting window geometry:', error);
      return { x: 0, y: 0, width: 0, height: 0 };
    }
  }
}

module.exports = ContextCapture; 