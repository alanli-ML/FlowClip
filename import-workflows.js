#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function importWorkflows() {
    console.log('🚀 FlowClip N8N Workflow Importer');
    console.log('==================================');

    // Read the workflows file
    const workflowsPath = path.join(__dirname, 'n8n-workflow-examples.json');
    
    if (!fs.existsSync(workflowsPath)) {
        console.error('❌ Workflow file not found:', workflowsPath);
        return;
    }

    console.log('✅ Found workflow file');
    
    const workflowData = JSON.parse(fs.readFileSync(workflowsPath, 'utf8'));
    const workflows = workflowData.workflows;

    console.log(`📊 Found ${workflows.length} workflows to import:`);
    
    workflows.forEach((workflow, index) => {
        console.log(`   ${index + 1}. ${workflow.name}`);
        console.log(`      Trigger: ${workflow.trigger_threshold}+ items`);
        console.log(`      Webhook: /webhook${workflow.webhook_path}`);
        console.log('');
    });

    console.log('🔗 WEBHOOK URLs for FlowClip:');
    console.log('============================');
    workflows.forEach(workflow => {
        console.log(`${workflow.name}:`);
        console.log(`   http://localhost:5678/webhook${workflow.webhook_path}`);
        console.log('');
    });

    console.log('📋 MANUAL IMPORT STEPS:');
    console.log('1. Go to http://localhost:5678');
    console.log('2. Login: admin / Rv5qOqwqhD7s');
    console.log('3. Click "+ New Workflow"');
    console.log('4. Create each workflow manually using the JSON structure');
    console.log('');
    console.log('💡 TIP: Copy webhook URLs for FlowClip configuration');
}

importWorkflows().catch(console.error); 