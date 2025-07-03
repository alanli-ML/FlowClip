#!/usr/bin/env node
/**
 * Test session processing timing - verify comprehensive analysis is available
 */

const path = require('path');
const Database = require('./src/database/database');

async function testSessionTiming() {
  console.log('🔍 Testing Session Timing and Analysis Data');
  
  try {
    // Initialize database
    const dbPath = path.join(process.env.HOME, 'Library', 'Application Support', 'flowclip', 'flowclip.db');
    console.log('📁 Database path:', dbPath);
    
    const database = new Database(dbPath);
    
    // Get recent clipboard items
    const recentItems = await database.getClipboardHistory({ limit: 10 });
    console.log(`📋 Found ${recentItems.length} recent clipboard items`);
    
    // Check for analysis data
    let itemsWithAnalysis = 0;
    let itemsWithoutAnalysis = 0;
    
    for (const item of recentItems) {
      console.log(`\n📄 Item ${item.id}:`);
      console.log(`   Content: ${item.content.substring(0, 50)}...`);
      console.log(`   Timestamp: ${item.timestamp}`);
      console.log(`   Analysis data: ${item.analysis_data ? 'AVAILABLE' : 'MISSING'}`);
      
      if (item.analysis_data) {
        itemsWithAnalysis++;
        try {
          const analysisData = JSON.parse(item.analysis_data);
          console.log(`   Analysis type: ${analysisData.contentType || 'unknown'}`);
          console.log(`   Analysis keys: ${Object.keys(analysisData).join(', ')}`);
          
          // Check for specific analysis fields that session processing needs
          if (analysisData.contentType && analysisData.purpose) {
            console.log(`   ✅ Has contentType (${analysisData.contentType}) and purpose (${analysisData.purpose})`);
          } else {
            console.log(`   ❌ Missing contentType or purpose fields`);
          }
        } catch (error) {
          console.log(`   ❌ Error parsing analysis data: ${error.message}`);
        }
      } else {
        itemsWithoutAnalysis++;
        console.log(`   ❌ No analysis data available for session processing`);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Items with analysis: ${itemsWithAnalysis}`);
    console.log(`   Items without analysis: ${itemsWithoutAnalysis}`);
    
    // Check for sessions
    const query = `
      SELECT s.*, 
             COUNT(si.clipboard_item_id) as item_count
      FROM sessions s 
      LEFT JOIN session_items si ON s.id = si.session_id 
      GROUP BY s.id 
      ORDER BY s.created_at DESC 
      LIMIT 5
    `;
    
    const sessions = database.db.prepare(query).all();
    console.log(`\n🗂️ Found ${sessions.length} recent sessions:`);
    
    for (const session of sessions) {
      console.log(`   Session ${session.id}: ${session.session_label}`);
      console.log(`     Type: ${session.session_type}`);
      console.log(`     Items: ${session.item_count}`);
      console.log(`     Created: ${session.created_at}`);
      
      // Check if session has research data
      if (session.entry_specific_research) {
        console.log(`     ✅ Has entry-specific research data`);
      } else {
        console.log(`     ❌ No entry-specific research data`);
      }
    }
    
    // Close database
    database.close();
    
    console.log('\n✅ Session timing test completed');
    
  } catch (error) {
    console.error('💥 Session timing test failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testSessionTiming().catch(console.error); 