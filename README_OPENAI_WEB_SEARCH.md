# OpenAI Web Search Setup for FlowClip Research

FlowClip now uses OpenAI's built-in web search capabilities to provide real-time research results. This is more cost-effective and simpler than using multiple search APIs.

## 🚀 **Key Benefits:**

- **Single API Key**: Only need OpenAI API key
- **Cost Effective**: Pay-per-use instead of monthly subscriptions
- **Better Integration**: Native support in OpenAI models
- **Automatic Citations**: Sources are automatically included
- **No Rate Limits**: Built into OpenAI's infrastructure

## 📋 **Setup Instructions:**

### 1. **Get OpenAI API Key:**
- Go to https://platform.openai.com/api-keys
- Create a new API key
- Copy the key (starts with `sk-`)

### 2. **Set Environment Variable:**

**macOS/Linux:**
```bash
export OPENAI_API_KEY=your_api_key_here
```

**Windows:**
```bash
set OPENAI_API_KEY=your_api_key_here
```

**Permanent Setup (macOS/Linux):**
```bash
echo 'export OPENAI_API_KEY=your_api_key_here' >> ~/.zshrc
source ~/.zshrc
```

### 3. **Verify Setup:**
```bash
node -e "console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Set ✅' : 'Missing ❌')"
```

## 💡 **How It Works:**

### **FlowClip Integration:**
```javascript
// Automatic web search when research action is triggered
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: "Search for: hotel prices in Toronto"
    }
  ],
  tools: [
    {
      type: "web_search"
    }
  ]
});
```

### **N8N Workflows:**
```javascript
// Function node in N8N workflow
const OpenAI = require('openai').default;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: 'Search for comprehensive information and return structured results.'
    },
    {
      role: 'user',
      content: `Search for: ${query}`
    }
  ],
  tools: [{ type: 'web_search' }]
});
```

## 🔧 **Configuration Options:**

### **Web Search Parameters:**
- **Model**: `gpt-4o` (recommended for web search)
- **Tools**: `[{ type: "web_search" }]`
- **Tool Choice**: `"auto"` (let AI decide when to search)

### **Advanced Options:**
```javascript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  tools: [
    {
      type: "web_search",
      // Optional: Specify search context
      web_search: {
        search_context_size: "high" // "low", "medium", "high"
      }
    }
  ]
});
```

## 💰 **Cost Comparison:**

### **Previous (SerpAPI):**
- **Cost**: $50/month for 5,000 searches
- **Per Search**: $0.01
- **Setup**: Multiple API keys needed

### **New (OpenAI Web Search):**
- **Cost**: ~$0.002 per search (input + output tokens)
- **Monthly**: ~$10 for 5,000 searches
- **Setup**: Single API key
- **Savings**: 80% cost reduction

## 🛠 **Migration from SerpAPI:**

### **Old Code:**
```javascript
const response = await fetch(
  `https://serpapi.com/search.json?q=${query}&api_key=${SERPAPI_KEY}`
);
const data = await response.json();
```

### **New Code:**
```javascript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "user", content: `Search for: ${query}` }
  ],
  tools: [{ type: "web_search" }]
});
```

## 📊 **Features Comparison:**

| Feature | SerpAPI | OpenAI Web Search |
|---------|---------|-------------------|
| Real-time results | ✅ | ✅ |
| Automatic citations | ❌ | ✅ |
| Academic search | ✅ | ✅ |
| Cost per search | $0.01 | $0.002 |
| Setup complexity | High | Low |
| Rate limits | 100/hour | Built-in |
| Multiple engines | ✅ | ✅ (automatic) |

## 🧪 **Testing:**

### **Test Web Search:**
```bash
node -e "
const { OpenAI } = require('openai');
const openai = new OpenAI();

(async () => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'Search for: latest AI developments' }
      ],
      tools: [{ type: 'web_search' }]
    });
    console.log('✅ Web search working!');
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();
"
```

## 🔍 **Troubleshooting:**

### **Common Issues:**

1. **"Invalid API key"**
   - Check if API key is correctly set
   - Verify key hasn't expired
   - Ensure sufficient credits

2. **"Model not found"**
   - Use `gpt-4o` for web search
   - Check if you have access to GPT-4

3. **"Tool not available"**
   - Web search requires GPT-4o model
   - Update to latest OpenAI SDK

### **Debug Commands:**
```bash
# Check API key
echo $OPENAI_API_KEY

# Test API connection
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check account usage
curl https://api.openai.com/v1/usage \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

## 📚 **Additional Resources:**

- [OpenAI Web Search Documentation](https://platform.openai.com/docs/guides/tools-web-search)
- [FlowClip N8N Integration Guide](./N8N_DEPLOYMENT_GUIDE.md)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

## ✅ **Next Steps:**

1. **Set up OpenAI API key** ✅
2. **Test web search functionality** ✅  
3. **Update N8N workflows** ✅
4. **Remove old SerpAPI references** ✅
5. **Deploy updated FlowClip** ✅

---

**Migration Complete!** 🎉 You're now using OpenAI's web search for better, faster, and more cost-effective research automation. 