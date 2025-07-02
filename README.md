# FlowClip: AI-Powered Clipboard Manager

**"Not just what you copied — why you copied it."**

FlowClip is an intelligent clipboard manager for macOS that captures every copy operation along with its context, then uses AI to provide actionable insights and suggestions.

## 🚀 Features

### Core Functionality
- **Persistent Clipboard History**: Automatically captures all Cmd+C operations
- **Context Awareness**: Records window title, source application, and screenshots
- **AI-Powered Analysis**: Automatic tagging, content analysis, and smart suggestions
- **Semantic Search**: Find clipboard items using natural language queries
- **Privacy First**: Local storage with optional cloud sync

### AI Capabilities
- **Smart Tagging**: Automatically categorizes clipboard content
- **Content Analysis**: Understands context and intent
- **Actionable Suggestions**: Research, summarize, fact-check, create tasks
- **Multi-language Support**: Translation and explanation features

### User Experience
- **Global Shortcuts**: Quick access with Cmd+Shift+V
- **System Tray Integration**: Runs quietly in the background
- **Modern UI**: Clean, dark-themed interface
- **Customizable Settings**: Privacy controls and workflow preferences

## 📋 Requirements

- macOS 10.14 or later
- Node.js 16+ 
- OpenAI API key (optional, for AI features)

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/flowclip.git
   cd flowclip
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create tray icon**
   - Replace `assets/tray-icon.png` with a 16x16 pixel PNG icon
   - You can use any clipboard or document icon

4. **Grant permissions (macOS)**
   - The app needs Accessibility permissions to capture context
   - Go to System Preferences > Security & Privacy > Privacy > Accessibility
   - Add FlowClip when prompted

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build:mac
```

### Start Application
```bash
npm start
```

## ⚙️ Configuration

### AI Features Setup
1. Open FlowClip and go to Settings
2. Enter your OpenAI API key
3. Click "Test" to verify the connection
4. AI features will now be available for clipboard analysis

### Privacy Settings
- **Screenshot Capture**: Toggle context screenshots on/off
- **Text Context**: Control surrounding text capture
- **Data Retention**: Set how long to keep clipboard history
- **Local Processing**: Keep all data on your device

## 🎯 Usage

### Basic Operation
1. **Automatic Capture**: FlowClip runs in the background and captures all copy operations
2. **Quick Access**: Press `Cmd+Shift+V` to open the clipboard history
3. **Search**: Use the search bar to find specific clipboard items
4. **Copy Back**: Click any item to copy it back to your clipboard

### AI-Powered Actions
1. **Open Item Details**: Click on any clipboard item to see full details
2. **AI Analysis**: Use the AI action buttons to:
   - **Summarize**: Get a concise summary of long content
   - **Research**: Get research suggestions and keywords
   - **Fact Check**: Identify claims that need verification
   - **Create Task**: Generate actionable tasks from content
   - **Translate**: Translate to different languages
   - **Explain**: Get simple explanations of complex content

### Keyboard Shortcuts
- `Cmd+Shift+V`: Open clipboard history
- `Cmd+Shift+M`: Toggle clipboard monitoring
- `Cmd+C`: Automatically captured (system-wide)

## 🔧 Technical Architecture

### Core Components
- **Main Process**: Electron app lifecycle and system integration
- **Clipboard Monitor**: Captures copy events and context
- **Context Capture**: Screenshots and window information
- **AI Service**: OpenAI integration for content analysis
- **Database**: SQLite for local storage with full-text search
- **Renderer**: Modern web UI with React-like patterns

### Data Flow
1. User copies content (`Cmd+C`)
2. Clipboard monitor detects change
3. Context capture service records environment
4. Content saved to local database
5. AI analysis runs in background
6. Results available in UI with actionable suggestions

## 🔒 Privacy & Security

### Local-First Architecture
- All clipboard data stored locally in SQLite database
- Screenshots saved to local app data directory
- No data sent to external servers except for AI processing
- OpenAI API key stored securely using system keychain

### Data Control
- **Retention Settings**: Auto-delete old clipboard items
- **Selective Capture**: Disable screenshots or context for sensitive work
- **Export/Import**: Full control over your data
- **Secure Storage**: Database encryption available

## 🛡️ Permissions Required

### macOS Permissions
- **Accessibility**: Required to capture context from active windows
- **Screen Recording**: Needed for screenshot capture (optional)
- **Automation**: For AppleScript-based context capture

### Why These Permissions?
FlowClip needs these permissions to provide context-aware clipboard management. All captured data stays on your device unless you explicitly use AI features.

## 📊 Competitive Advantages

### vs. Traditional Clipboard Managers
- **Context Awareness**: Knows where and why you copied something
- **AI Integration**: Actionable insights, not just storage
- **Semantic Search**: Find items by meaning, not just keywords
- **Privacy Focus**: Local processing with optional cloud features

### vs. AI Note-Taking Apps
- **Automatic Capture**: No manual input required
- **System Integration**: Works with any application
- **Real-time Processing**: Instant analysis and suggestions
- **Workflow Integration**: Designed for active productivity

## 🔄 Workflow Examples

### Research Workflow
1. Copy article snippet while browsing
2. FlowClip captures context and screenshot
3. AI suggests research directions and keywords
4. Use "Create Task" to add follow-up research to your task manager

### Code Review Workflow
1. Copy code snippet from IDE
2. FlowClip records the file and project context
3. AI explains the code functionality
4. Use for documentation or knowledge sharing

### Content Creation Workflow
1. Copy quotes or references from various sources
2. FlowClip maintains source attribution
3. AI helps fact-check and summarize
4. Export organized research for your project

## 🚧 Development Status

### Current Version: MVP 1.0
- ✅ Basic clipboard monitoring
- ✅ Context capture (macOS)
- ✅ Local database storage
- ✅ Modern UI with search
- ✅ AI integration (OpenAI)
- ✅ Privacy controls

### Planned Features
- [ ] Cross-platform support (Windows, Linux)
- [ ] Local LLM integration (Ollama)
- [ ] Browser extension
- [ ] Mobile companion app
- [ ] Team collaboration features
- [ ] Advanced workflow automation

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
# Clone and install
git clone https://github.com/your-username/flowclip.git
cd flowclip
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Electron](https://electronjs.org/)
- AI powered by [OpenAI](https://openai.com/)
- Icons from [Font Awesome](https://fontawesome.com/)
- UI inspired by modern productivity tools

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/flowclip/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/flowclip/discussions)
- **Email**: support@flowclip.app

---

**FlowClip** - Making your clipboard intelligent, one copy at a time. 📋✨ 