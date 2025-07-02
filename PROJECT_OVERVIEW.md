# FlowClip Project Overview

## Project Summary

FlowClip is a sophisticated AI-powered clipboard manager for macOS built with Electron. It captures every copy operation along with rich contextual information and uses AI to provide intelligent insights and actionable suggestions.

## Architecture Overview

### Technology Stack
- **Framework**: Electron 27.x
- **Database**: SQLite with FTS5 (Full-Text Search)
- **AI Integration**: OpenAI GPT-3.5/GPT-4 API
- **UI**: Modern HTML5/CSS3/JavaScript (Vanilla JS)
- **System Integration**: macOS AppleScript & System APIs
- **Storage**: Local SQLite + Electron Store for settings

### Key Components

#### 1. Main Process (`src/main.js`)
- **Application Lifecycle**: Manages Electron app startup, window creation, and cleanup
- **Clipboard Monitoring**: Continuous monitoring of system clipboard changes
- **System Integration**: Global shortcuts, tray icon, and system notifications
- **IPC Communication**: Handles communication between main and renderer processes
- **Context Orchestration**: Coordinates clipboard capture with context gathering

#### 2. Database Layer (`src/database/database.js`)
- **SQLite Implementation**: Robust local database with WAL mode for performance
- **Full-Text Search**: Advanced search capabilities using SQLite FTS5
- **Data Models**: Clipboard items, AI tasks, tags, and metadata
- **Performance Optimization**: Indexes, prepared statements, and efficient queries
- **Data Integrity**: Proper relationships and cascade deletions

#### 3. AI Service (`src/services/aiService.js`)
- **OpenAI Integration**: Secure API key management and request handling
- **Background Processing**: Async AI analysis of clipboard content
- **Multiple AI Tasks**: Summarization, research, fact-checking, task creation
- **Content Analysis**: Automatic tagging and content type detection
- **Error Handling**: Robust error management and retry logic

#### 4. Context Capture (`src/services/contextCapture.js`)
- **Window Information**: Active application and window title capture
- **Screenshot Capture**: Optional screenshot of active window/screen
- **Text Context**: Surrounding text extraction from various applications
- **Browser Integration**: Enhanced text extraction from web browsers
- **Privacy Controls**: Configurable context capture settings

#### 5. User Interface (`src/renderer/`)
- **Modern Design**: Dark theme with clean, intuitive interface
- **Responsive Layout**: Sidebar navigation with multiple views
- **Real-time Updates**: Live clipboard item additions and AI results
- **Search & Filtering**: Advanced search with semantic capabilities
- **Modal System**: Detailed item view with AI action buttons

## Core Features Implemented

### ✅ MVP Features Complete

#### Clipboard Management
- [x] **Automatic Capture**: Monitors all Cmd+C operations system-wide
- [x] **Rich History**: Stores unlimited clipboard history with metadata
- [x] **Content Types**: Supports text, images, files, and URLs
- [x] **Quick Access**: Global keyboard shortcuts (Cmd+Shift+V)
- [x] **Search**: Full-text search across all clipboard content

#### Context Awareness
- [x] **Source Tracking**: Records source application and window title
- [x] **Screenshot Capture**: Optional screenshots for visual context
- [x] **Timestamp Tracking**: Precise timing of each clipboard operation
- [x] **Metadata Storage**: Comprehensive contextual information

#### AI Integration
- [x] **Automatic Analysis**: Background AI processing of new clipboard items
- [x] **Smart Tagging**: AI-generated tags for content categorization
- [x] **Content Classification**: Automatic content type and sentiment analysis
- [x] **Action Suggestions**: Context-aware recommendations for next steps

#### AI-Powered Actions
- [x] **Summarization**: Intelligent content summarization
- [x] **Research Assistant**: Research suggestions and keyword extraction
- [x] **Fact Checking**: Claim identification and verification guidance
- [x] **Task Creation**: Convert content into actionable tasks
- [x] **Translation**: Multi-language translation capabilities
- [x] **Content Explanation**: Simplify complex content

#### User Experience
- [x] **System Tray Integration**: Runs quietly in background
- [x] **Modern UI**: Clean, dark-themed interface
- [x] **Settings Management**: Comprehensive privacy and behavior controls
- [x] **Data Export**: Full control over personal data
- [x] **Privacy First**: Local storage with optional AI processing

### 🔧 Technical Implementation Details

#### Database Schema
```sql
-- Clipboard items with full metadata
clipboard_items (
  id, content, content_type, timestamp,
  source_app, window_title, screenshot_path,
  surrounding_text, tags, created_at, updated_at
)

-- AI task tracking and results
ai_tasks (
  id, clipboard_item_id, task_type, status,
  result, error, created_at, completed_at
)

-- Full-text search virtual table
clipboard_search (
  id, content, window_title, surrounding_text, tags
)
```

#### API Endpoints (IPC)
- `get-clipboard-history` - Retrieve clipboard items with filtering
- `get-clipboard-item` - Get single item with full details
- `search-clipboard` - Semantic search across clipboard content
- `trigger-ai-task` - Execute AI analysis on clipboard items
- `add-tags` / `remove-tags` - Manage item tags
- `update-settings` - Modify application preferences

#### Security & Privacy
- **Local Data Storage**: All clipboard data stored locally in SQLite
- **Secure API Keys**: OpenAI keys stored in system keychain
- **Permission Management**: Granular privacy controls
- **No Telemetry**: No user data sent to external services
- **Data Encryption**: Database encryption available

## File Structure

```
FlowClip/
├── package.json              # Dependencies and build configuration
├── README.md                 # Comprehensive project documentation
├── SETUP.md                  # Quick start guide
├── PROJECT_OVERVIEW.md       # This file
├── .gitignore               # Version control exclusions
├── assets/
│   └── tray-icon.png        # System tray icon (placeholder)
└── src/
    ├── main.js              # Electron main process
    ├── database/
    │   └── database.js      # SQLite database layer
    ├── services/
    │   ├── aiService.js     # OpenAI integration
    │   └── contextCapture.js # System context capture
    └── renderer/
        ├── index.html       # Main UI structure
        ├── styles.css       # Modern dark theme styles
        └── renderer.js      # UI logic and interactions
```

## Competitive Advantages

### vs. Traditional Clipboard Managers
1. **AI-Powered Intelligence**: Goes beyond storage to provide insights
2. **Context Awareness**: Captures the "why" not just the "what"
3. **Semantic Search**: Find content by meaning, not just keywords
4. **Workflow Integration**: Actionable suggestions for next steps

### vs. Note-Taking Apps
1. **Zero Friction**: Automatic capture without manual input
2. **System-Wide Integration**: Works with any application
3. **Real-Time Processing**: Instant analysis and suggestions
4. **Privacy Control**: Local processing with optional cloud features

## Development Workflow

### Getting Started
```bash
# Clone and install
git clone <repo-url>
cd FlowClip
npm install

# Start development
npm run dev

# Build for production
npm run build:mac
```

### Development Commands
- `npm start` - Launch the application
- `npm run dev` - Development mode with hot reload
- `npm run build` - Build for distribution
- `npm run build:mac` - Build macOS specific package

### Testing & Debugging
- Built-in error handling and logging
- Electron DevTools integration
- IPC communication debugging
- Database query logging

## Future Roadmap

### Phase 2: Enhanced Features
- [ ] Local LLM support (Ollama integration)
- [ ] Browser extension for web content
- [ ] Mobile companion app
- [ ] Advanced workflow automation
- [ ] Team collaboration features

### Phase 3: Platform Expansion
- [ ] Windows support
- [ ] Linux support
- [ ] Cloud sync capabilities
- [ ] Enterprise features
- [ ] Plugin ecosystem

### Phase 4: AI Evolution
- [ ] Custom AI models
- [ ] Workflow learning
- [ ] Predictive suggestions
- [ ] Multi-modal AI (text + images)
- [ ] Voice integration

## Performance Characteristics

### Resource Usage
- **Memory**: ~50-100MB baseline (depends on clipboard history size)
- **CPU**: Minimal when idle, moderate during AI processing
- **Disk**: SQLite database grows with usage, auto-cleanup available
- **Network**: Only for AI API calls when enabled

### Scalability
- **Database**: Handles thousands of clipboard items efficiently
- **Search**: Sub-second search across large datasets
- **AI Processing**: Async processing doesn't block UI
- **Context Capture**: Optimized for real-time operation

## Conclusion

FlowClip represents a new category of productivity tools that combines traditional clipboard management with modern AI capabilities. By capturing rich context and providing intelligent insights, it transforms the simple act of copying and pasting into a powerful workflow enhancement tool.

The application is built with privacy and user control as core principles, ensuring that sensitive data remains secure while still benefiting from AI-powered features. The modular architecture allows for easy extension and customization, making it a solid foundation for future enhancements.

---

**Built with ❤️ for productivity enthusiasts who want their tools to be as intelligent as they are.** 