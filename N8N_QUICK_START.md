# 🚀 N8N Quick Start for FlowClip

**Get your FlowClip automation running in 5 minutes!**

## 🎯 Choose Your Deployment

| Option | Best For | Time | Difficulty |
|--------|----------|------|------------|
| **🏠 Local** | Development & Testing | 2 minutes | ⭐ Easy |
| **☁️ N8N Cloud** | Production (Managed) | 5 minutes | ⭐ Easy |
| **🐳 Docker** | Production (Self-hosted) | 10 minutes | ⭐⭐ Medium |

---

## 🏠 Option 1: Local Development (Fastest)

**Perfect for:** Testing FlowClip integration, development work

```bash
# 1. Run the automated setup
chmod +x scripts/deploy-n8n-local.sh
./scripts/deploy-n8n-local.sh

# 2. Start N8N
./start-n8n-local.sh

# 3. Test integration
node test-n8n-integration.js
```

**✅ You're done!** Access N8N at http://localhost:5678

---

## ☁️ Option 2: N8N Cloud (Recommended for Production)

**Perfect for:** Production use without server management

### Step 1: Sign Up
1. Visit [n8n.cloud](https://n8n.cloud)
2. Create account (free tier available)
3. Note your instance URL: `https://your-instance.app.n8n.cloud`

### Step 2: Configure FlowClip
```bash
# Create/update .env file
echo "N8N_WEBHOOK_ENDPOINT=https://your-instance.app.n8n.cloud/webhook" > .env
echo "N8N_API_KEY=your_optional_api_key" >> .env
```

### Step 3: Import Workflows
1. In N8N Cloud, click "+" → "Import from file"
2. Import `n8n-workflow-examples.json`
3. Configure API keys for external services

### Step 4: Test
```bash
node test-n8n-integration.js
```

**✅ Production ready!** No server maintenance required.

---

## 🐳 Option 3: Docker Self-Hosted

**Perfect for:** Production with full control

```bash
# 1. Run automated Docker setup
chmod +x scripts/deploy-n8n-docker.sh
./scripts/deploy-n8n-docker.sh

# Follow prompts for domain configuration

# 2. Start services
cd n8n-deployment
./start.sh

# 3. Test integration
./test-integration.sh
```

**✅ Self-hosted production setup complete!**

---

## 🧪 Testing Your Setup

Once N8N is running, test your FlowClip integration:

```bash
# Test the full integration
node test-n8n-integration.js

# Expected output:
# ✓ hotel_research session created and automation triggered
# ✓ product_research session created and automation triggered
# ✓ academic_research session created and automation triggered
```

## 📋 Import FlowClip Workflows

### Manual Import (All Options)
1. Open your N8N instance in browser
2. Click "+" → "Import from file"
3. Select `n8n-workflow-examples.json`
4. Repeat for each workflow type:
   - FlowClip Hotel Research Automation
   - FlowClip Product Research Automation
   - FlowClip Academic Research Automation
   - FlowClip General Research Automation

### Workflow Configuration
After importing, configure each workflow:
1. **Webhook Node**: Verify webhook path matches FlowClip integration
2. **API Credentials**: Add your external service API keys
3. **Function Nodes**: Customize data processing if needed

---

## 🔑 API Keys (Optional but Recommended)

For full functionality, add these API keys to your N8N workflows:

### Free APIs (Good to Start)
- **arXiv**: No key needed (academic papers)
- **Wikipedia**: No key needed (general information)

### Paid APIs (Enhanced Features)
- **SerpAPI**: Google Search, Scholar ($50/month for 5K searches)
- **TripAdvisor**: Hotel reviews (contact for pricing)
- **Amazon Product API**: Product search (revenue sharing)
- **eBay API**: Product listings (free tier available)

### API Setup in N8N:
1. Go to Settings → Credentials
2. Add new credential for each API
3. Use in corresponding workflow nodes

---

## 🧪 Integration Testing

### Test FlowClip Session Automation

1. **Start FlowClip**:
   ```bash
   npm start
   ```

2. **Copy some hotel research content** (e.g., copy text about "Hilton Toronto Downtown")

3. **Verify session creation** in FlowClip Sessions tab

4. **Check N8N execution** in your N8N interface

### Debug Issues

**N8N not receiving webhooks?**
```bash
# Check N8N health
curl http://localhost:5678/healthz

# Test webhook directly
curl -X POST http://localhost:5678/webhook/flowclip-hotel-research \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**FlowClip not triggering automation?**
- Check your `.env` file has correct `N8N_WEBHOOK_ENDPOINT`
- Verify session threshold is met (e.g., 2+ items for hotel research)
- Check console logs for integration errors

---

## 🚀 Production Checklist

### For N8N Cloud:
- [ ] Account created and instance provisioned
- [ ] FlowClip workflows imported
- [ ] API credentials configured
- [ ] Integration tested with FlowClip

### For Self-Hosted:
- [ ] Docker deployment completed
- [ ] SSL certificates configured (if using custom domain)
- [ ] Backup strategy implemented
- [ ] Monitoring set up
- [ ] Firewall configured
- [ ] Integration tested with FlowClip

---

## 📊 Monitoring Your Setup

### N8N Cloud:
- Built-in execution monitoring
- Email notifications for failures
- Usage analytics dashboard

### Self-Hosted Docker:
```bash
# Check health
./health.sh

# View logs
./logs.sh -f

# Monitor resource usage
docker stats
```

---

## 🆘 Troubleshooting

### Common Issues:

**1. "Webhook not found" errors**
- Import FlowClip workflows in N8N
- Verify webhook paths match your integration

**2. "Connection refused" errors**
- Check N8N is running: `curl http://localhost:5678/healthz`
- Verify firewall settings
- Check Docker containers: `docker-compose ps`

**3. "Rate limit exceeded" API errors**
- Configure API retry mechanisms
- Implement proper rate limiting
- Consider upgrading API plans

**4. FlowClip sessions not triggering N8N**
- Check `.env` configuration
- Verify session threshold settings
- Enable debug logging: `DEBUG=flowclip:n8n npm start`

---

## 📞 Support & Resources

- **N8N Documentation**: https://docs.n8n.io/
- **N8N Community**: https://community.n8n.io/
- **FlowClip Integration**: `test-n8n-integration.js` for examples
- **Full Deployment Guide**: `N8N_DEPLOYMENT_GUIDE.md`

---

## 🎉 What's Next?

Once your N8N integration is working:

1. **Customize Workflows**: Modify the example workflows for your specific needs
2. **Add More APIs**: Integrate additional services for richer automation
3. **Create Custom Workflows**: Build workflows for your specific research patterns
4. **Scale Up**: Monitor usage and upgrade resources as needed

**🎯 Goal**: Let FlowClip intelligently automate your research workflows while you focus on the important work!

---

*Choose your option above and get started in minutes! 🚀* 