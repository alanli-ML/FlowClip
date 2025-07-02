const Database = require('./src/database/database');
const Store = require('electron-store');

async function testImplementationStatus() {
  console.log('🔍 Testing FlowClip Implementation Status\n');
  
  // Check store configuration
  const store = new Store();
  const hasApiKey = !!store.get('openaiApiKey');
  console.log('📊 Configuration Status:');
  console.log(`  - OpenAI API Key: ${hasApiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  - API Key Length: ${store.get('openaiApiKey')?.length || 0} characters\n`);
  
  // Check database
  try {
    const db = new Database();
    await db.init();
    
    console.log('📁 Database Status:');
    console.log('  - Database: ✅ Connected');
    
    // Get recent clipboard items
    const recentItems = await db.getRecentClipboardItems(10);
    console.log(`  - Recent clipboard items: ${recentItems.length}`);
    
    if (recentItems.length > 0) {
      console.log('\n📋 Recent Clipboard Items:');
      recentItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.content.substring(0, 50)}...`);
        console.log(`     Source: ${item.source_app || 'Unknown'}`);
        console.log(`     Time: ${new Date(item.timestamp).toLocaleTimeString()}`);
        console.log(`     Screenshot: ${item.screenshot_path ? '✅ Yes' : '❌ No'}`);
        console.log(`     Tags: ${item.tags?.length || 0}`);
        console.log('');
      });
    }
    
    // Check AI tasks
    const aiTasks = await db.getAllAITasks();
    console.log(`📤 AI Tasks: ${aiTasks.length} total`);
    
    if (aiTasks.length > 0) {
      const recentTasks = aiTasks.slice(-5);
      console.log('\n🤖 Recent AI Tasks:');
      recentTasks.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.task_type} - ${task.status}`);
        console.log(`     Item ID: ${task.clipboard_item_id}`);
        console.log(`     Error: ${task.error || 'None'}`);
        console.log('');
      });
    }
    
    // Check sessions
    const sessions = await db.getActiveSessions();
    console.log(`🎯 Active Sessions: ${sessions.length}`);
    
    if (sessions.length > 0) {
      console.log('\n📊 Session Details:');
      sessions.forEach((session, index) => {
        console.log(`  ${index + 1}. ${session.session_label} (${session.session_type})`);
        console.log(`     Items: ${session.item_count || 0}`);
        console.log(`     Created: ${new Date(session.created_at).toLocaleTimeString()}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.log('❌ Database Error:', error.message);
  }
  
  console.log('✅ Implementation status check complete!');
}

testImplementationStatus().catch(console.error); 