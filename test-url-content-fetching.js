const LangGraphClient = require('./src/services/langGraphClient.js');

async function testUrlContentFetching() {
  console.log('🌐 Testing URL Content Fetching for Research and Summarization...\n');
  
  const client = new LangGraphClient();
  await client.initializeWorkflows();
  
  // Test URLs (using real but common URLs)
  const testUrls = [
    'https://github.com/microsoft/vscode',
    'https://nodejs.org',
    'https://www.wikipedia.org'
  ];
  
  for (const url of testUrls) {
    console.log(`\n📄 Testing URL: ${url}`);
    console.log('=' .repeat(60));
    
    // Test content type detection
    const contentType = client.extractContentType(url);
    console.log(`Content Type Detected: ${contentType}`);
    
    if (contentType === 'url') {
      console.log('✅ URL correctly detected as URL content type');
      
      // Test URL content fetching
      console.log('\n🔍 Testing URL content fetching...');
      try {
        const urlContent = await client.fetchUrlContent(url);
        
        if (urlContent && urlContent.content && !urlContent.fallback) {
          console.log(`✅ Successfully fetched content from ${urlContent.domain}`);
          console.log(`   Title: ${urlContent.title}`);
          console.log(`   Content length: ${urlContent.content.length} characters`);
          console.log(`   Content preview: ${urlContent.content.substring(0, 150)}...`);
          
          // Test research workflow with URL
          console.log('\n🔬 Testing Research Workflow with URL content...');
          try {
            const researchResult = await client.executeWorkflow('research', {
              content: url,
              context: {
                sourceApp: 'Browser',
                windowTitle: 'Test URL Research'
              }
            });
            
            if (researchResult && researchResult.researchSummary) {
              console.log('✅ Research workflow completed successfully');
              console.log(`   Used URL content: ${researchResult.isUrlContent ? 'Yes' : 'No'}`);
              console.log(`   Research queries: [${researchResult.researchQueries.join(', ')}]`);
              console.log(`   Confidence: ${researchResult.confidence}`);
              console.log(`   Sources: ${researchResult.totalSources}`);
              console.log(`   Summary preview: ${researchResult.researchSummary.substring(0, 200)}...`);
            } else {
              console.log('❌ Research workflow failed or returned no summary');
            }
          } catch (researchError) {
            console.log(`❌ Research workflow error: ${researchError.message}`);
          }
          
          // Test summarization workflow with URL
          console.log('\n📝 Testing Summarization Workflow with URL content...');
          try {
            const summaryResult = await client.executeWorkflow('summarization', {
              content: url,
              context: {
                sourceApp: 'Browser',
                windowTitle: 'Test URL Summarization'
              }
            });
            
            if (summaryResult && summaryResult.finalSummary) {
              console.log('✅ Summarization workflow completed successfully');
              console.log(`   Used URL content: ${summaryResult.isUrlContent ? 'Yes' : 'No'}`);
              console.log(`   Quality score: ${summaryResult.qualityScore}`);
              console.log(`   Key points: [${summaryResult.keyPoints.join(', ')}]`);
              console.log(`   Final summary: ${summaryResult.finalSummary}`);
            } else {
              console.log('❌ Summarization workflow failed or returned no summary');
            }
          } catch (summaryError) {
            console.log(`❌ Summarization workflow error: ${summaryError.message}`);
          }
          
        } else if (urlContent && urlContent.fallback) {
          console.log(`⚠️  Fallback content generated for ${url}`);
          console.log(`   Content: ${urlContent.content}`);
        } else {
          console.log(`❌ Could not fetch content from ${url}`);
        }
        
      } catch (fetchError) {
        console.log(`❌ URL fetching error: ${fetchError.message}`);
      }
      
    } else {
      console.log(`❌ URL not detected as URL content type (detected as: ${contentType})`);
    }
    
    // Add delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n🎯 URL Content Fetching Test Summary:');
  console.log('- URL content type detection tested');
  console.log('- URL content fetching functionality tested');
  console.log('- Research workflow with URL content tested');
  console.log('- Summarization workflow with URL content tested');
  console.log('\nNote: Some tests may fail if OpenAI API rate limits are hit or network issues occur.');
}

// Test a simple URL content fetch without full workflow
async function testSimpleUrlFetch() {
  console.log('\n🔧 Testing Simple URL Content Fetch...\n');
  
  const client = new LangGraphClient();
  
  const testUrl = 'https://example.com';
  console.log(`Testing simple fetch for: ${testUrl}`);
  
  try {
    const result = await client.fetchUrlContent(testUrl);
    
    if (result) {
      console.log('✅ Simple URL fetch successful');
      console.log(`   Domain: ${result.domain}`);
      console.log(`   Title: ${result.title}`);
      console.log(`   Content length: ${result.content.length}`);
      console.log(`   Is fallback: ${result.fallback || false}`);
    } else {
      console.log('❌ Simple URL fetch returned null');
    }
  } catch (error) {
    console.log(`❌ Simple URL fetch error: ${error.message}`);
  }
}

// Run tests
if (process.env.OPENAI_API_KEY) {
  console.log('🚀 OpenAI API key found - running full URL content fetching tests\n');
  testUrlContentFetching().then(() => {
    return testSimpleUrlFetch();
  }).catch(error => {
    console.error('❌ Test suite failed:', error);
  });
} else {
  console.log('⚠️  No OpenAI API key found - skipping URL content fetching tests');
  console.log('   Set OPENAI_API_KEY environment variable to run these tests');
  
  // Just test content type detection
  const client = new LangGraphClient();
  const testUrls = ['https://github.com/microsoft/vscode', 'https://nodejs.org'];
  
  console.log('\n📋 Testing URL Content Type Detection Only:');
  testUrls.forEach(url => {
    const contentType = client.extractContentType(url);
    console.log(`${url} -> ${contentType} ${contentType === 'url' ? '✅' : '❌'}`);
  });
}
