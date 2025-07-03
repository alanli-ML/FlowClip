const LangGraphClient = require('./src/services/langGraphClient.js');

// Test that research queries are generated only from actual content
async function testCleanQueries() {
    console.log('🧪 Testing Research Query Generation - Clean Data Only');
    console.log('');
    
    const client = new LangGraphClient();
    await client.initializeWorkflows();
    
    const testCases = [
        'Responses API o3-deep-research',
        'Machine learning algorithms',
        'Quantum computing applications',
        'Node.js performance optimization',
        'React best practices'
    ];
    
    for (const testContent of testCases) {
        console.log(`📝 Testing: "${testContent}"`);
        
        try {
            const result = await client.executeWorkflow('research', {
                content: testContent,
                context: {}
            });
            
            console.log(`   Generated queries: ${JSON.stringify(result.researchQueries)}`);
            
            // Check for hardcoded hotel/restaurant queries
            const hasHotelQueries = result.researchQueries.some(query => 
                query.toLowerCase().includes('hotel') || 
                query.toLowerCase().includes('restaurant') ||
                query.toLowerCase().includes('amenities') ||
                query.toLowerCase().includes('pricing availability')
            );
            
            if (hasHotelQueries && !testContent.toLowerCase().includes('hotel')) {
                console.log(`   ❌ FOUND HARDCODED QUERIES! Content doesn't contain hotel terms but queries do.`);
            } else {
                console.log(`   ✅ Clean queries - no hardcoded content detected`);
            }
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        
        console.log('');
    }
}

// Run the test
testCleanQueries().catch(console.error); 