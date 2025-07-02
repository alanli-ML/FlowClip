const LangGraphClient = require('../../src/services/langGraphClient');

// Simple test to verify LangGraph integration
async function testLangGraphWorkflows() {
  console.log('🧪 Testing LangGraph Workflow Integration...\n');
  
  // Mock OpenAI API key for testing
  process.env.OPENAI_API_KEY = 'test-key-for-initialization';
  
  let client;
  try {
    client = new LangGraphClient();
    console.log('✅ LangGraph client initialized successfully');
  } catch (error) {
    console.error('❌ LangGraph client initialization failed:', error.message);
    return;
  }

  // Test data
  const testContent = "Machine learning is transforming software development by automating code generation, bug detection, and performance optimization. This technology enables developers to build more robust applications faster than ever before.";
  const testContext = {
    sourceApp: "VS Code",
    windowTitle: "AI Research Document",
    surroundingText: "Previous paragraph about AI trends...",
    timestamp: new Date().toISOString()
  };

  const workflowData = {
    content: testContent,
    context: testContext
  };

  // Test 1: Content Analysis Workflow
  console.log('\n📊 Testing Content Analysis Workflow...');
  try {
    const analysisResult = await client.executeWorkflow('content_analysis', workflowData);
    console.log('✅ Content Analysis completed');
    console.log('   Content Type:', analysisResult.contentType);
    console.log('   Sentiment:', analysisResult.sentiment);
    console.log('   Tags:', analysisResult.tags);
    console.log('   Confidence:', analysisResult.confidence);
  } catch (error) {
    console.error('❌ Content Analysis failed:', error.message);
  }

  // Test 2: Summarization Workflow
  console.log('\n📝 Testing Summarization Workflow...');
  try {
    const summaryResult = await client.executeWorkflow('summarization', workflowData);
    console.log('✅ Summarization completed');
    console.log('   Summary:', summaryResult.finalSummary || summaryResult.summary);
    console.log('   Quality Score:', summaryResult.qualityScore);
    console.log('   Key Points:', summaryResult.keyPoints);
  } catch (error) {
    console.error('❌ Summarization failed:', error.message);
  }

  // Test 3: Tagging Workflow
  console.log('\n🏷️  Testing Tagging Workflow...');
  try {
    const taggingResult = await client.executeWorkflow('tagging', workflowData);
    console.log('✅ Tagging completed');
    console.log('   Content Tags:', taggingResult.contentTags);
    console.log('   Context Tags:', taggingResult.contextTags);
    console.log('   Purpose Tags:', taggingResult.purposeTags);
    console.log('   Final Tags:', taggingResult.finalTags);
  } catch (error) {
    console.error('❌ Tagging failed:', error.message);
  }

  // Test 4: Research Workflow
  console.log('\n🔍 Testing Research Workflow...');
  try {
    const researchResult = await client.executeWorkflow('research', workflowData);
    console.log('✅ Research completed');
    console.log('   Research Questions:', researchResult.researchQuestions);
    console.log('   Search Queries:', researchResult.searchQueries);
    console.log('   Ready for External Research:', researchResult.readyForExternalResearch);
  } catch (error) {
    console.error('❌ Research failed:', error.message);
  }

  // Test 5: Available Workflows
  console.log('\n📋 Available Workflows:');
  const availableWorkflows = client.getAvailableWorkflows();
  availableWorkflows.forEach(workflow => {
    console.log('   ✓', workflow);
  });

  console.log('\n🎉 LangGraph integration test completed!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testLangGraphWorkflows().catch(console.error);
}

module.exports = { testLangGraphWorkflows }; 