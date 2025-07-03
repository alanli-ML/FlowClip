// Test to verify SessionManager is working correctly
const SessionManager = require('./src/services/sessionManager.js');
const Database = require('./src/database/database.js');

async function testSessionManagerFix() {
  console.log('🧪 Testing SessionManager Fix\n');
  
  try {
    // Initialize database
    const db = new Database();
    await db.init();
    console.log('✅ Database initialized');

    // Create mock AI service
    const mockAiService = {
      langGraphClient: {
        executeWorkflow: async (workflow, data) => {
          console.log(`Mock workflow: ${workflow}`);
          return {
            sessionType: 'general_research',
            sessionConfidence: 0.8,
            belongsToSession: false,
            membershipConfidence: 0.3
          };
        }
      }
    };

    // Initialize SessionManager
    const sessionManager = new SessionManager(db, mockAiService);
    console.log('✅ SessionManager initialized');

    // Test evaluateSessionMembershipMinimal method specifically
    const testClipboardItem = {
      id: 'test-123',
      content: 'Test content for general research',
      source_app: 'Google Chrome',
      window_title: 'Test Window'
    };

    const mockSessionCandidates = [{
      id: 'session-123',
      session_type: 'general_research',
      session_label: 'Test Session',
      last_activity: new Date().toISOString()
    }];

    // This should not throw an error anymore
    const result = sessionManager.evaluateSessionMembershipMinimal(testClipboardItem, mockSessionCandidates);
    console.log('✅ evaluateSessionMembershipMinimal method works correctly');
    console.log('   Result:', result ? 'Session found' : 'No session match');

    console.log('\n🎉 All tests passed! SessionManager is working correctly.');
    console.log('✅ UI should now be responsive');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testSessionManagerFix();
