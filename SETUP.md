# FlowClip Quick Setup Guide

## Prerequisites

1. **Node.js 16+** - Download from [nodejs.org](https://nodejs.org/)
2. **macOS 10.14+** - Required for system integration features
3. **Xcode Command Line Tools** - Run `xcode-select --install`

## Installation Steps

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd FlowClip
   npm install
   ```

2. **Create Icon Asset**
   - Download a 16x16 PNG clipboard icon
   - Replace `assets/tray-icon.png` with your icon

3. **Start the Application**
   ```bash
   npm start
   ```

## Troubleshooting

### Common Issues

#### 1. Native Dependencies Build Errors
If you see errors with `robotjs`, `better-sqlite3`, or `keytar`:

```bash
# Rebuild native dependencies
npm run postinstall

# Or manually rebuild
./node_modules/.bin/electron-rebuild
```

#### 2. Permission Denied Errors
Grant the following permissions when prompted:
- **Accessibility**: System Preferences > Security & Privacy > Privacy > Accessibility
- **Screen Recording**: System Preferences > Security & Privacy > Privacy > Screen Recording

#### 3. App Won't Start
```bash
# Check for errors
npm start 2>&1 | tee debug.log

# Try development mode
npm run dev
```

#### 4. Missing Dependencies
```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install
```

## Verifying Installation

After starting the app, you should see:
1. FlowClip icon in the system tray
2. Main window opens (or press Cmd+Shift+V)
3. "Monitoring" status shows as active

## Next Steps

1. **Configure AI Features**
   - Go to Settings
   - Add OpenAI API key
   - Test the connection

2. **Test Clipboard Capture**
   - Copy some text (Cmd+C)
   - Open FlowClip (Cmd+Shift+V)
   - Verify the item appears in history

3. **Customize Settings**
   - Adjust privacy settings
   - Configure data retention
   - Set startup preferences

## Development Mode

For development and debugging:

```bash
# Start with hot reload
npm run dev

# Open DevTools
npm run dev -- --dev-tools

# View logs
npm start 2>&1 | grep -E "(error|warn|info)"
```

## System Requirements Verification

Run this to check your system:

```bash
# Check Node version
node --version  # Should be 16+

# Check npm version  
npm --version

# Check macOS version
sw_vers -productVersion  # Should be 10.14+

# Check Xcode tools
xcode-select --version
```

## Alternative Installation (if issues persist)

1. **Use Node Version Manager**
   ```bash
   # Install nvm
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   
   # Install and use Node 18
   nvm install 18
   nvm use 18
   ```

2. **Install Dependencies Separately**
   ```bash
   # Core dependencies first
   npm install --save electron better-sqlite3 electron-store
   
   # UI dependencies
   npm install --save uuid axios
   
   # AI integration
   npm install --save openai
   
   # Development tools
   npm install --save-dev electron-builder nodemon concurrently
   ```

## Support

If you encounter issues:
1. Check the `debug.log` file for error details
2. Search existing issues on GitHub
3. Create a new issue with system info and error logs

---

**Note**: Some features require macOS system permissions. The app will guide you through granting these when first launched. 