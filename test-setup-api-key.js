const Store = require('electron-store');

// Initialize the store (same as used by the app)
const store = new Store();

// For testing purposes, set a placeholder API key
// In production, this would be a real OpenAI API key entered through the UI
const testApiKey = process.env.OPENAI_API_KEY || 'test-key-placeholder';

console.log('Setting up test API key...');
store.set('openaiApiKey', testApiKey);

console.log('Current API key configured:', store.get('openaiApiKey') ? 'Yes' : 'No');
console.log('Test setup complete!');

// Also log current store data for debugging
console.log('Store data:', {
  hasApiKey: !!store.get('openaiApiKey'),
  keyLength: store.get('openaiApiKey')?.length || 0
}); 