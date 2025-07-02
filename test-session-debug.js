// Mock Electron app for testing
const mockApp = {
  getPath: (path) => {
    if (path === 'userData') {
      return './test-data';
    }
    return './';
  }
};

// Mock Electron module
const electron = { app: mockApp };
require.cache[require.resolve('electron')] = { exports: electron };

const fs = require('fs');
const path = require('path');
const Database = require('./src/database/database');
const SessionManager = require('./src/services/sessionManager');
const { v4: uuidv4 } = require('uuid');

async function testSessionManagement() {
  console.log('Testing FlowClip Session Management...\n');
  
  try {
    // Ensure test data directory exists
    if (!fs.existsSync('./test-data')) {
      fs.mkdirSync('./test-data', { recursive: true });
    }
    
    // Initialize database and session manager
    const database = new Database();
    await database.init();
    
    // Create a mock AI service that mimics the real one
    const mockAIService = {
      langGraphClient: {
        executeWorkflow: async (workflowName, data) => {
          console.log(`  Mock LangGraph executing: ${workflowName}`);
          
          if (workflowName === 'session_type_detection') {
            // Mock session type detection - be more realistic
            const content = data.content.toLowerCase();
            
            // Hotel research detection
            if (content.includes('hilton') || content.includes('ritz') || content.includes('shangri')) {
              return { sessionType: 'hotel_research', confidence: 0.9 };
            }
            
            // General research for various topics
            if (content.includes('pancakes') || content.includes('javascript') || content.includes('tutorial') || content.includes('recipe')) {
              return { sessionType: 'general_research', confidence: 0.7 };
            }
            
            return { sessionType: null, confidence: 0.3 };
          }
          
          if (workflowName === 'session_membership') {
            // Mock session membership - be very precise about what belongs together
            const content = data.content.toLowerCase();
            const sessionType = data.existingSession.type;
            const existingItems = data.existingSession.items || [];
            
            // Hotel content can only join hotel research sessions
            const isHotelContent = content.includes('hilton') || content.includes('ritz') || content.includes('shangri');
            const isHotelSession = sessionType === 'hotel_research';
            
            if (isHotelContent && isHotelSession) {
              return { belongs: true, confidence: 0.9, reasoning: 'Hotel research items belong together' };
            }
            
            // Non-hotel content should never join hotel sessions
            if (!isHotelContent && isHotelSession) {
              return { belongs: false, confidence: 0.05, reasoning: 'Non-hotel content does not belong in hotel research' };
            }
            
            // For general research sessions, check semantic similarity
            if (!isHotelContent && sessionType === 'general_research') {
              // Check if topics are related by looking at existing content
              const existingContent = existingItems.map(item => item.content.toLowerCase()).join(' ');
              
              // Cooking-related content
              const isCookingContent = content.includes('pancakes') || content.includes('recipe') || content.includes('cooking');
              const hasCookingContent = existingContent.includes('pancakes') || existingContent.includes('recipe') || existingContent.includes('cooking');
              
              // Programming-related content  
              const isProgrammingContent = content.includes('javascript') || content.includes('tutorial') || content.includes('programming');
              const hasProgrammingContent = existingContent.includes('javascript') || existingContent.includes('tutorial') || existingContent.includes('programming');
              
              // Only group if topics are semantically related
              if (isCookingContent && hasCookingContent) {
                return { belongs: true, confidence: 0.8, reasoning: 'Related cooking/recipe content' };
              }
              
              if (isProgrammingContent && hasProgrammingContent) {
                return { belongs: true, confidence: 0.8, reasoning: 'Related programming content' };
              }
              
              // Different general research topics should not be grouped
              return { belongs: false, confidence: 0.2, reasoning: 'Different research topics should not be grouped' };
            }
            
            return { belongs: false, confidence: 0.1, reasoning: 'Different session types' };
          }
          
          if (workflowName === 'session_analysis') {
            // Mock session analysis
            return {
              contextSummary: { summary: 'Research session analysis' },
              intentAnalysis: { intent: 'Information gathering' }
            };
          }
          
          return {};
        }
      }
    };
    
    const sessionManager = new SessionManager(database, mockAIService);
    await sessionManager.init();
    
    // Clean slate - clear any existing sessions from previous test runs
    console.log('Cleaning up previous test data...');
    database.db.exec('DELETE FROM session_members');
    database.db.exec('DELETE FROM clipboard_sessions'); 
    database.db.exec('DELETE FROM clipboard_items');
    
    console.log('✓ Database and SessionManager initialized\n');
    
    // Test 1: Create hotel-related clipboard items
    console.log('Test 1: Adding hotel research items...');
    
    const hotelItems = [
      {
        id: uuidv4(),
        content: 'Hilton Toronto Downtown',
        content_type: 'TEXT',
        timestamp: new Date().toISOString(),
        source_app: 'Google Chrome',
        window_title: 'Hotels in Toronto - Google Search',
        screenshot_path: null,
        surrounding_text: 'Best hotels in downtown Toronto',
        tags: []
      },
      {
        id: uuidv4(),
        content: 'The Ritz-Carlton, Toronto',
        content_type: 'TEXT',
        timestamp: new Date(Date.now() + 1000).toISOString(),
        source_app: 'Google Chrome',
        window_title: 'Luxury Hotels Toronto - Booking.com',
        screenshot_path: null,
        surrounding_text: 'Premium accommodation in Toronto',
        tags: []
      }
    ];
    
    // Save items to database and process through session manager
    for (const item of hotelItems) {
      await database.saveClipboardItem(item);
      console.log(`- Saved: ${item.content}`);
      
      const session = await sessionManager.processClipboardItem(item);
      if (session) {
        console.log(`  → Added to session: ${session.session_label} (${session.session_type})`);
      } else {
        console.log(`  → No session created/joined`);
      }
    }
    
    // Test 2: Test unrelated general research content
    console.log('\nTest 2: Adding unrelated general research items...');
    
    const generalItems = [
      {
        id: uuidv4(),
        content: 'How to make pancakes',
        content_type: 'TEXT',
        timestamp: new Date(Date.now() + 2000).toISOString(),
        source_app: 'Safari',
        window_title: 'Cooking Recipes - Food Network',
        screenshot_path: null,
        surrounding_text: 'Easy breakfast recipes',
        tags: []
      },
      {
        id: uuidv4(),
        content: 'JavaScript async/await tutorial',
        content_type: 'TEXT',
        timestamp: new Date(Date.now() + 3000).toISOString(),
        source_app: 'Google Chrome',
        window_title: 'MDN Web Docs - JavaScript',
        screenshot_path: null,
        surrounding_text: 'Modern JavaScript programming concepts',
        tags: []
      }
    ];
    
    for (const item of generalItems) {
      await database.saveClipboardItem(item);
      console.log(`- Saved: ${item.content}`);
      
      const session = await sessionManager.processClipboardItem(item);
      if (session) {
        console.log(`  → Added to session: ${session.session_label} (${session.session_type})`);
      } else {
        console.log(`  → No session created/joined`);
      }
    }
    
    // Test 3: Add related content to see if it groups correctly  
    console.log('\nTest 3: Adding related content...');
    
    const relatedItems = [
      {
        id: uuidv4(),
        content: 'Easy pancake recipe with syrup',
        content_type: 'TEXT',
        timestamp: new Date(Date.now() + 4000).toISOString(),
        source_app: 'Safari',
        window_title: 'AllRecipes - Pancake Recipes',
        screenshot_path: null,
        surrounding_text: 'Best pancake recipes online',
        tags: []
      },
      {
        id: uuidv4(),
        content: 'JavaScript promises vs async/await',
        content_type: 'TEXT',
        timestamp: new Date(Date.now() + 5000).toISOString(),
        source_app: 'Google Chrome',
        window_title: 'JavaScript.info - Promises',
        screenshot_path: null,
        surrounding_text: 'Understanding asynchronous JavaScript',
        tags: []
      }
    ];
    
    for (const item of relatedItems) {
      await database.saveClipboardItem(item);
      console.log(`- Saved: ${item.content}`);
      
      const session = await sessionManager.processClipboardItem(item);
      if (session) {
        console.log(`  → Added to session: ${session.session_label} (${session.session_type})`);
      } else {
        console.log(`  → No session created/joined`);
      }
    }
    
    // Final check
    console.log('\nFinal session state:');
    const finalSessions = await sessionManager.getActiveSessions();
    console.log(`Total active sessions: ${finalSessions.length}`);
    
    for (const session of finalSessions) {
      console.log(`\n- ${session.session_label}: ${session.item_count} items (${session.session_type})`);
      const items = await sessionManager.getSessionItems(session.id);
      items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.content}`);
      });
    }
    
    // Clean up properly
    sessionManager.destroy();
    database.close();
    console.log('\n✓ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

// Run the test
testSessionManagement(); 

async function debugSessions() {
  console.log('🔍 Session Debug Test\\n');
  
  try {
    const db = new Database();
    await db.init();
    
    // Get recent clipboard items
    console.log('📋 Recent Clipboard Items:');
    const recentItems = db.db.prepare(`
      SELECT id, content, source_app, timestamp, 
             SUBSTR(content, 1, 50) as preview
      FROM clipboard_items 
      ORDER BY datetime(timestamp) DESC 
      LIMIT 10
    `).all();
    
    recentItems.forEach((item, index) => {
      console.log(`  ${index + 1}. [${item.id.substring(0, 8)}] ${item.preview}... (${item.source_app})`);
    });
    
    console.log('\\n🎯 Active Sessions:');
    const sessions = db.db.prepare(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      WHERE s.status = 'active'
      GROUP BY s.id
      ORDER BY s.last_activity DESC
    `).all();
    
    if (sessions.length === 0) {
      console.log('  ❌ No active sessions found');
    } else {
      sessions.forEach((session, index) => {
        console.log(`  ${index + 1}. ${session.session_label} (${session.session_type}): ${session.item_count} items`);
        console.log(`     Last activity: ${session.last_activity}`);
        
        // Get items in this session
        const sessionItems = db.db.prepare(`
          SELECT c.content, c.timestamp
          FROM clipboard_items c
          JOIN session_members sm ON c.id = sm.clipboard_item_id
          WHERE sm.session_id = ?
          ORDER BY sm.sequence_order ASC
        `).all(session.id);
        
        sessionItems.forEach((item, itemIndex) => {
          console.log(`     ${itemIndex + 1}. ${item.content.substring(0, 60)}...`);
        });
        console.log('');
      });
    }
    
    // Check for expired sessions
    console.log('💀 Recently Expired Sessions:');
    const expiredSessions = db.db.prepare(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      WHERE s.status = 'expired'
      GROUP BY s.id
      ORDER BY s.last_activity DESC
      LIMIT 5
    `).all();
    
    if (expiredSessions.length === 0) {
      console.log('  ✅ No recently expired sessions');
    } else {
      expiredSessions.forEach((session, index) => {
        console.log(`  ${index + 1}. ${session.session_label} (${session.session_type}): ${session.item_count} items - expired`);
      });
    }
    
    await db.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Mock LangGraph client for session workflows if database needs it
class MockLangGraphClient {
  async executeWorkflow(workflowName, state) {
    console.log(`Mock LangGraph: ${workflowName} called`);
    
    if (workflowName === 'session_type_detection') {
      return {
        sessionType: 'hotel_research',
        confidence: 0.8,
        reasoning: 'Mock detection based on hotel keywords'
      };
    }
    
    if (workflowName === 'session_membership') {
      return {
        belongs: true,
        confidence: 0.7,
        reasoning: 'Mock membership - hotel research content'
      };
    }
    
    return { result: 'mock' };
  }
}

debugSessions().catch(console.error); 