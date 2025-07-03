// Simple test to check if sessions are being saved in the database
const sqlite3 = require('better-sqlite3');

async function testSessionDatabase() {
  console.log('🔍 Testing Session Database Directly\n');
  
  try {
    // Check if database file exists
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'flowclip', 'flowclip.db');
    
    if (!fs.existsSync(dbPath)) {
      console.log('❌ Database file not found:', dbPath);
      return;
    }
    
    console.log('✅ Database file found:', dbPath);
    
    // Open database
    const db = sqlite3(dbPath, { readonly: true });
    
    // Check sessions table
    console.log('\n📊 Checking sessions table...');
    const sessions = db.prepare(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      GROUP BY s.id
      ORDER BY s.last_activity DESC
      LIMIT 10
    `).all();
    
    console.log(`Found ${sessions.length} sessions:`);
    sessions.forEach((session, index) => {
      console.log(`  ${index + 1}. ${session.session_label} (${session.session_type})`);
      console.log(`     Items: ${session.item_count}, Status: ${session.status}`);
      console.log(`     Created: ${session.start_time}`);
      console.log(`     Context summary length: ${session.context_summary ? session.context_summary.length : 0}`);
      console.log('');
    });
    
    // Check a specific session's items if we have any
    if (sessions.length > 0) {
      const firstSession = sessions[0];
      console.log(`\n📋 Items in session "${firstSession.session_label}":`);
      
      const sessionItems = db.prepare(`
        SELECT c.content, c.source_app, c.timestamp
        FROM clipboard_items c
        JOIN session_members sm ON c.id = sm.clipboard_item_id
        WHERE sm.session_id = ?
        ORDER BY sm.sequence_order ASC
      `).all(firstSession.id);
      
      sessionItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.content.substring(0, 60)}... (${item.source_app})`);
      });
      
      // Check if context_summary can be parsed
      if (firstSession.context_summary) {
        try {
          const contextSummary = JSON.parse(firstSession.context_summary);
          console.log(`\n📝 Context summary structure:`);
          console.log(`  Keys: ${Object.keys(contextSummary).join(', ')}`);
        } catch (parseError) {
          console.log(`\n❌ Failed to parse context_summary: ${parseError.message}`);
        }
      }
    }
    
    db.close();
    console.log('\n✅ Database test completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Database test failed:', error);
  }
}

testSessionDatabase();
