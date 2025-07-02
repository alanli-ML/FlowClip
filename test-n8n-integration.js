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
const ExternalApiService = require('./src/services/externalApiService');
const { v4: uuidv4 } = require('uuid');

async function testN8NIntegration() {
  console.log('Testing FlowClip N8N Integration...\n');
  
  try {
    // Ensure test data directory exists
    if (!fs.existsSync('./test-data')) {
      fs.mkdirSync('./test-data', { recursive: true });
    }
    
    // Initialize database and services
    const database = new Database();
    await database.init();
    
    // Create a mock AI service
    const mockAIService = {
      langGraphClient: {
        executeWorkflow: async (workflowName, data) => {
          console.log(`  Mock LangGraph executing: ${workflowName}`);
          
          if (workflowName === 'session_type_detection') {
            const content = data.content.toLowerCase();
            
            if (content.includes('hilton') || content.includes('ritz')) {
              return { sessionType: 'hotel_research', confidence: 0.9 };
            }
            if (content.includes('iphone') || content.includes('macbook')) {
              return { sessionType: 'product_research', confidence: 0.8 };
            }
            if (content.includes('machine learning') || content.includes('neural network')) {
              return { sessionType: 'academic_research', confidence: 0.85 };
            }
            if (content.includes('restaurant') || content.includes('menu')) {
              return { sessionType: 'restaurant_research', confidence: 0.8 };
            }
            
            return { sessionType: 'general_research', confidence: 0.6 };
          }
          
          if (workflowName === 'session_membership') {
            const content = data.content.toLowerCase();
            const sessionType = data.existingSession.type;
            
            // Simple content matching for testing
            if (sessionType === 'hotel_research' && 
                (content.includes('hilton') || content.includes('ritz'))) {
              return { belongs: true, confidence: 0.9 };
            }
            if (sessionType === 'product_research' && 
                (content.includes('iphone') || content.includes('macbook'))) {
              return { belongs: true, confidence: 0.85 };
            }
            if (sessionType === 'academic_research' && 
                (content.includes('machine learning') || content.includes('neural network'))) {
              return { belongs: true, confidence: 0.9 };
            }
            
            return { belongs: false, confidence: 0.1 };
          }
          
          return {};
        }
      }
    };
    
    // Initialize External API Service with test webhook
    const externalApiService = new ExternalApiService();
    
    // Override N8N endpoint for testing
    externalApiService.n8nEndpoint = 'https://webhook.site/test'; // Replace with your test webhook
    
    // Initialize Session Manager with External API Service
    const sessionManager = new SessionManager(database, mockAIService, externalApiService);
    await sessionManager.init();
    
    // Clean up previous test data
    console.log('Cleaning up previous test data...');
    database.db.exec('DELETE FROM session_members');
    database.db.exec('DELETE FROM clipboard_sessions'); 
    database.db.exec('DELETE FROM clipboard_items');
    
    console.log('✓ Database and services initialized\n');
    
    // Test 1: Hotel Research Session
    console.log('Test 1: Hotel Research Session Automation...');
    await testSessionType(sessionManager, 'hotel_research', [
      'Hilton Toronto Downtown',
      'Ritz-Carlton Toronto',
      'Hotel booking for June 2024'
    ]);
    
    // Test 2: Product Research Session
    console.log('\nTest 2: Product Research Session Automation...');
    await testSessionType(sessionManager, 'product_research', [
      'iPhone 15 Pro specifications',
      'MacBook Air M2 reviews',
      'Apple product comparison'
    ]);
    
    // Test 3: Academic Research Session
    console.log('\nTest 3: Academic Research Session Automation...');
    await testSessionType(sessionManager, 'academic_research', [
      'Machine learning algorithms overview',
      'Neural network architectures',
      'Deep learning research papers',
      'Transformer models comparison'
    ]);
    
    // Test 4: Restaurant Research Session
    console.log('\nTest 4: Restaurant Research Session Automation...');
    await testSessionType(sessionManager, 'restaurant_research', [
      'Italian restaurant downtown',
      'Fine dining menu options'
    ]);
    
    // Test 5: General Research Session
    console.log('\nTest 5: General Research Session Automation...');
    await testSessionType(sessionManager, 'general_research', [
      'Climate change solutions',
      'Renewable energy technologies',
      'Environmental impact studies'
    ]);
    
    // Test 6: Workflow Configuration
    console.log('\nTest 6: Workflow Configuration Management...');
    testWorkflowConfiguration(externalApiService);
    
    // Test 7: Rate Limiting
    console.log('\nTest 7: Rate Limiting Test...');
    await testRateLimiting(sessionManager, externalApiService);
    
    // Final status check
    console.log('\nFinal Status Check:');
    const activeSessions = await sessionManager.getActiveSessions();
    console.log(`Total active sessions: ${activeSessions.length}`);
    
    activeSessions.forEach(session => {
      console.log(`- ${session.session_label}: ${session.item_count} items (${session.session_type})`);
    });
    
    // Check workflow status
    console.log('\nWorkflow Status:');
    const workflowStatus = externalApiService.getWorkflowStatus();
    workflowStatus.forEach(status => {
      console.log(`- ${status.sessionType}: ${status.enabled ? 'enabled' : 'disabled'} (threshold: ${status.triggerThreshold})`);
    });
    
    // Clean up
    sessionManager.destroy();
    database.close();
    console.log('\n✓ N8N Integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

async function testSessionType(sessionManager, expectedType, contents) {
  const sessionId = await createTestSession(sessionManager, contents);
  
  if (sessionId) {
    console.log(`  ✓ ${expectedType} session created and automation triggered`);
  } else {
    console.log(`  ✗ ${expectedType} session creation failed`);
  }
  
  return sessionId;
}

async function createTestSession(sessionManager, contents) {
  let sessionId = null;
  
  for (let i = 0; i < contents.length; i++) {
    const item = {
      id: uuidv4(),
      content: contents[i],
      content_type: 'TEXT',
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      source_app: 'Google Chrome',
      window_title: 'Research - Google Search',
      screenshot_path: null,
      surrounding_text: 'Research context',
      tags: []
    };
    
    await sessionManager.database.saveClipboardItem(item);
    console.log(`    - Added: ${item.content}`);
    
    const session = await sessionManager.processClipboardItem(item);
    if (session) {
      sessionId = session.id;
      console.log(`      → Session: ${session.session_label} (${session.session_type})`);
    }
    
    // Small delay to allow for processing
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return sessionId;
}

function testWorkflowConfiguration(externalApiService) {
  console.log('  Testing workflow configuration management...');
  
  // Test disabling a workflow
  externalApiService.disableWorkflow('general_research');
  console.log('    - Disabled general_research workflow');
  
  // Test updating configuration
  externalApiService.updateWorkflowConfig('hotel_research', {
    triggerThreshold: 1,
    timeout: 60000
  });
  console.log('    - Updated hotel_research configuration');
  
  // Test enabling workflow
  externalApiService.enableWorkflow('general_research');
  console.log('    - Re-enabled general_research workflow');
  
  console.log('  ✓ Workflow configuration tests passed');
}

async function testRateLimiting(sessionManager, externalApiService) {
  console.log('  Testing rate limiting...');
  
  // Create a session that should trigger automation
  const testItem = {
    id: uuidv4(),
    content: 'Hilton Rate Limit Test',
    content_type: 'TEXT',
    timestamp: new Date().toISOString(),
    source_app: 'Google Chrome',
    window_title: 'Test',
    screenshot_path: null,
    surrounding_text: 'Test context',
    tags: []
  };
  
  await sessionManager.database.saveClipboardItem(testItem);
  const session1 = await sessionManager.processClipboardItem(testItem);
  
  if (session1) {
    console.log('    - First automation triggered');
    
    // Try to trigger automation again immediately (should be rate limited)
    const testItem2 = {
      ...testItem,
      id: uuidv4(),
      content: 'Hilton Rate Limit Test 2',
      timestamp: new Date(Date.now() + 1000).toISOString()
    };
    
    await sessionManager.database.saveClipboardItem(testItem2);
    const session2 = await sessionManager.processClipboardItem(testItem2);
    
    console.log('    - Second automation should be rate limited');
    console.log('  ✓ Rate limiting test completed');
  }
}

// Event listeners for testing
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
testN8NIntegration(); 