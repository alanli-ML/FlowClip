const Database = require('./src/database/database');

async function consolidateHotelSessions() {
  console.log('🔧 Consolidating Hotel Research Sessions\n');
  
  try {
    const db = new Database();
    await db.init();
    
    // Get all hotel research sessions
    console.log('📋 Current Hotel Research Sessions:');
    const hotelSessions = db.db.prepare(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      WHERE s.session_type = 'hotel_research'
      GROUP BY s.id
      ORDER BY s.last_activity DESC
    `).all();
    
    if (hotelSessions.length === 0) {
      console.log('  ✅ No hotel research sessions found');
      await db.close();
      return;
    }
    
    hotelSessions.forEach((session, index) => {
      console.log(`  ${index + 1}. ${session.session_label}: ${session.item_count} items (${session.status})`);
    });
    
    // Look for Toronto hotel sessions to consolidate
    const torontoSessions = hotelSessions.filter(s => 
      s.session_label.toLowerCase().includes('toronto') || 
      s.session_label.toLowerCase().includes('hilton') ||
      s.session_label.toLowerCase().includes('ritz') ||
      s.session_label.toLowerCase().includes('shangri') ||
      s.session_label.toLowerCase().includes('four seasons')
    );
    
    if (torontoSessions.length <= 1) {
      console.log('\n✅ No consolidation needed - found', torontoSessions.length, 'Toronto hotel sessions');
      await db.close();
      return;
    }
    
    console.log(`\n🔄 Consolidating ${torontoSessions.length} Toronto hotel sessions...`);
    
    // Keep the session with the most items as the main one
    const mainSession = torontoSessions.reduce((prev, current) => 
      (prev.item_count > current.item_count) ? prev : current
    );
    
    // Update main session to have a generic Toronto label
    db.db.prepare(`
      UPDATE clipboard_sessions 
      SET session_label = 'Hotel Research - Toronto',
          status = 'active',
          last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(mainSession.id);
    
    console.log(`  → Main session: ${mainSession.session_label} → "Hotel Research - Toronto"`);
    
    // Move all items from other sessions to the main session
    let totalItemsMoved = 0;
    for (const session of torontoSessions) {
      if (session.id === mainSession.id) continue;
      
      // Get items from this session
      const items = db.db.prepare(`
        SELECT clipboard_item_id, sequence_order
        FROM session_members 
        WHERE session_id = ?
      `).all(session.id);
      
      if (items.length > 0) {
        // Get next sequence order in main session
        const nextOrder = db.db.prepare(`
          SELECT COALESCE(MAX(sequence_order), 0) + 1 as next_order
          FROM session_members 
          WHERE session_id = ?
        `).get(mainSession.id).next_order;
        
        // Move items to main session
        for (let i = 0; i < items.length; i++) {
          db.db.prepare(`
            UPDATE session_members 
            SET session_id = ?, sequence_order = ?
            WHERE session_id = ? AND clipboard_item_id = ?
          `).run(mainSession.id, nextOrder + i, session.id, items[i].clipboard_item_id);
        }
        
        totalItemsMoved += items.length;
        console.log(`  → Moved ${items.length} items from "${session.session_label}"`);
      }
      
      // Delete the empty session
      db.db.prepare('DELETE FROM clipboard_sessions WHERE id = ?').run(session.id);
    }
    
    console.log(`\n✅ Consolidation complete! Moved ${totalItemsMoved} items into "Hotel Research - Toronto"`);
    
    // Show final result
    console.log('\n📊 Final Hotel Research Sessions:');
    const finalSessions = db.db.prepare(`
      SELECT s.*, COUNT(sm.clipboard_item_id) as item_count
      FROM clipboard_sessions s
      LEFT JOIN session_members sm ON s.id = sm.session_id
      WHERE s.session_type = 'hotel_research'
      GROUP BY s.id
      ORDER BY s.last_activity DESC
    `).all();
    
    finalSessions.forEach((session, index) => {
      console.log(`  ${index + 1}. ${session.session_label}: ${session.item_count} items (${session.status})`);
      
      // Show items in session
      const sessionItems = db.db.prepare(`
        SELECT c.content
        FROM clipboard_items c
        JOIN session_members sm ON c.id = sm.clipboard_item_id
        WHERE sm.session_id = ?
        ORDER BY sm.sequence_order ASC
      `).all(session.id);
      
      sessionItems.forEach((item, itemIndex) => {
        console.log(`     ${itemIndex + 1}. ${item.content.substring(0, 50)}...`);
      });
      console.log('');
    });
    
    await db.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

consolidateHotelSessions().catch(console.error); 