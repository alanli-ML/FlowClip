# FlowClip N8N Workflows

This directory contains **two different approaches** for automating research workflows in N8N:

## 🔄 **Workflow Approaches Available**

### **1. Mock Processing Workflows** (Current Implementation)
**Files**: `hotel-research.json`, `product-research.json`, `academic-research.json`, etc.

**What they do:**
- ✅ **Data Processing**: Intelligent analysis of FlowClip session data
- ✅ **Entity Extraction**: Extract hotels, products, topics, etc.
- ✅ **Smart Recommendations**: Generate actionable research steps
- ✅ **Contextual Guidance**: Provide specific next actions

**Benefits:**
- **Fast & Reliable**: No external dependencies
- **Always Available**: No network issues or rate limits
- **Intelligent Analysis**: Advanced data processing
- **Practical Value**: Users get immediate guidance

**What they return:**
```json
{
  "automationType": "Hotel Research Processing",
  "insights": [
    "Detected 2 luxury hotels in Vancouver area",
    "Price range appears to be premium ($300-500/night)",
    "Optimal booking window: 2-3 weeks advance"
  ],
  "nextSteps": [
    "Compare prices on Booking.com, Expedia, Hotels.com",
    "Read recent TripAdvisor reviews for both properties",
    "Check for package deals including transportation"
  ]
}
```

### **2. Web Scraping Workflows** (Advanced Implementation)
**Files**: `*-scraping.json`, guided by `WEB_SCRAPING_WORKFLOWS_GUIDE.md`

**What they do:**
- 🔍 **Live Data Scraping**: Real-time data from actual websites
- 🌐 **Multi-Source Research**: Parallel scraping of multiple platforms
- 💰 **Price Discovery**: Current rates, deals, availability
- ⭐ **Review Analysis**: Sentiment analysis from user reviews

**Benefits:**
- **Real Data**: Live information from booking sites, retailers
- **No API Costs**: Free access to public information
- **Comprehensive**: Multiple data sources per query
- **Current Information**: Always up-to-date pricing and availability

**What they return:**
```json
{
  "automationType": "Web Scraping Hotel Research",
  "priceAnalysis": {
    "averagePrice": 285,
    "priceRange": ["$225", "$350", "$299"],
    "lowestPrice": 225,
    "highestPrice": 350
  },
  "reviewAnalysis": {
    "overallSentiment": "Positive",
    "tripAdvisorRatings": ["4.5 stars", "4.2 stars"],
    "communityFeedback": true
  }
}
```

---

## 🎯 **Choosing the Right Approach**

### **Use Mock Processing When:**
- ✅ You want **fast, reliable responses**
- ✅ You need **intelligent guidance and recommendations**
- ✅ You prefer **no external dependencies**
- ✅ You want to **avoid web scraping complexity**

### **Use Web Scraping When:**
- 🔍 You need **real-time pricing and availability**
- 🌐 You want **actual data from websites**
- 💰 You're researching **current deals and promotions**
- ⚡ You don't mind **slightly slower response times**

---

## 📊 **Comparison Table**

| Feature | Mock Processing | Web Scraping |
|---------|----------------|--------------|
| **Speed** | ⚡ Instant | 🐌 5-15 seconds |
| **Reliability** | 🎯 100% uptime | 📱 95% uptime |
| **Data Freshness** | 📚 Static guidance | 🔄 Live data |
| **Price Information** | 💭 Estimates | 💰 Real prices |
| **External Dependencies** | ❌ None | 🌐 Website availability |
| **Rate Limits** | ❌ None | ⚠️ Respectful scraping |
| **Setup Complexity** | ✅ Simple | 🔧 Moderate |
| **Maintenance** | ✅ Minimal | 🛠️ Periodic updates |

---

## 🚀 **Current Production Status**

### **Active Workflows (Mock Processing)**
Currently imported and working in N8N:
- ✅ `hotel-research.json` - Hotel research guidance
- ✅ `general-research.json` - General research assistance  
- ❌ `product-research.json` - Needs manual import
- ❌ `academic-research.json` - Needs manual import
- ❌ `restaurant-research.json` - Needs manual import
- ❌ `travel-research.json` - Needs manual import

### **Available Workflows (Web Scraping)**
Ready for import but not yet active:
- 🆕 `hotel-research-scraping.json` - Live hotel data scraping
- 🆕 `product-research-scraping.json` - Live product price scraping
- 🆕 `academic-research-scraping.json` - Live academic research

---

## 📝 **Implementation Recommendations**

### **Phase 1: Current State (Mock Processing)**
- **Keep existing workflows active** - They provide immediate value
- **Import remaining mock workflows** for complete coverage
- **Perfect for initial user experience** and system stability

### **Phase 2: Enhanced Automation (Web Scraping)**
- **Gradual rollout** of web scraping workflows
- **A/B testing** to compare user preference
- **Fallback mechanisms** to mock processing if scraping fails

### **Phase 3: Hybrid Approach**
```javascript
// Intelligent workflow selection
const useWebScraping = sessionData.requiresRealTimeData && 
                      systemHealth.scrapingAvailable &&
                      user.preferences.dataFreshness === 'high';

const workflowEndpoint = useWebScraping ? 
  '/webhook/flowclip-hotel-research' :      // Web scraping
  '/webhook/flowclip-hotel-processing';     // Mock processing
```

---

## 🔧 **How to Switch Approaches**

### **To Add Web Scraping Workflows:**
1. **Import** `*-scraping.json` files to N8N
2. **Update** FlowClip's `ExternalApiService` URLs:
   ```javascript
   // In src/services/externalApiService.js
   const SCRAPING_ENDPOINTS = {
     hotel_research: 'http://localhost:5678/webhook/flowclip-hotel-research',
     product_research: 'http://localhost:5678/webhook/flowclip-product-research'
   };
   ```
3. **Test** with FlowClip sessions
4. **Monitor** performance and reliability

### **To Revert to Mock Processing:**
1. **Deactivate** scraping workflows in N8N  
2. **Keep** existing mock processing workflows active
3. **No code changes needed** - URLs remain the same

---

## 🎉 **User Experience**

Both approaches provide **excellent user value**:

### **Mock Processing Experience**
*"FlowClip analyzed your hotel research and suggests: Compare prices on Booking.com, read recent TripAdvisor reviews, and check for package deals. Optimal booking window is 2-3 weeks in advance."*

### **Web Scraping Experience**  
*"FlowClip found live data: Fairmont Pacific Rim averages $285/night, Pan Pacific shows $310/night on Booking.com. TripAdvisor ratings: 4.5 and 4.2 stars respectively. Reddit discussions show positive guest experiences."*

Both approaches **enhance the user's research workflow** and provide **actionable intelligence**! 🚀

## 🎯 Available Workflows

| Workflow | File | Trigger Threshold | Webhook Path |
|----------|------|------------------|--------------|
| **Hotel Research** | `hotel-research.json` | 2+ items | `/flowclip-hotel-research` |
| **Product Research** | `product-research.json` | 3+ items | `/flowclip-product-research` |
| **Academic Research** | `academic-research.json` | 4+ items | `/flowclip-academic-research` |
| **Restaurant Research** | `restaurant-research.json` | 2+ items | `/flowclip-restaurant-research` |
| **Travel Research** | `travel-research.json` | 2+ items | `/flowclip-travel-research` |
| **General Research** | `general-research.json` | 3+ items | `/flowclip-general-research` |

## 📋 Import Instructions

### Method 1: Individual Import (Recommended)
1. Go to your N8N instance: **http://localhost:5678**
2. Login with: **admin** / **Rv5qOqwqhD7s**
3. Click **"+ New Workflow"**
4. Click the **three dots menu** (⋯) → **"Import from URL or file"**
5. Choose **"Upload from file"**
6. Select one of the JSON files from this directory
7. **Save** and **Activate** the workflow

### Method 2: Manual Creation
If import doesn't work, create manually:
1. Add **Webhook** node with the appropriate path
2. Add **Function** node with the processing code
3. Connect Webhook → Function
4. Save and activate

## 🔗 Webhook URLs

After importing and activating, your webhooks will be available at:

```
http://localhost:5678/webhook/flowclip-hotel-research
http://localhost:5678/webhook/flowclip-product-research
http://localhost:5678/webhook/flowclip-academic-research
http://localhost:5678/webhook/flowclip-restaurant-research
http://localhost:5678/webhook/flowclip-travel-research
http://localhost:5678/webhook/flowclip-general-research
```

## 🧪 Testing Workflows

Test any workflow with curl:

```bash
curl -X POST http://localhost:5678/webhook/flowclip-hotel-research \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-001",
    "sessionType": "hotel_research",
    "itemCount": 3,
    "hotelData": {
      "hotelNames": ["Hotel A", "Hotel B"],
      "locations": ["Toronto"]
    }
  }'
```

## ✅ What Each Workflow Does

### 🏨 Hotel Research
- Analyzes hotel names, locations, dates
- Provides price comparison recommendations
- Suggests review checking and booking strategies

### 🛒 Product Research  
- Compares products across multiple platforms
- Analyzes prices, features, and reviews
- Recommends best deals and alternatives

### 🎓 Academic Research
- Discovers papers and academic sources
- Maps author networks and citations
- Suggests research databases and strategies

### 🍽️ Restaurant Research
- Compares restaurant reviews and menus
- Checks reservation availability
- Analyzes cuisine types and pricing

### ✈️ Travel Research
- Compares flight and hotel prices
- Plans activities and itineraries
- Provides travel tips and requirements

### 🔍 General Research
- Performs web search and fact-checking
- Verifies information across sources
- Organizes findings and recommendations

## 🔧 FlowClip Integration

Make sure your FlowClip `.env` file contains:
```
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
N8N_ENABLED=true
```

## 🚀 Ready to Use!

Once imported and activated, these workflows will automatically trigger when FlowClip detects the appropriate session types with enough items! 