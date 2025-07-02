# SerpAPI Setup for FlowClip Research

FlowClip now uses SerpAPI to provide real Google search results for the research action.

## Quick Setup

1. **Get a free SerpAPI key:**
   - Go to https://serpapi.com/
   - Sign up for a free account (100 searches/month free)
   - Get your API key from the dashboard

2. **Set the environment variable:**
   ```bash
   export SERPAPI_KEY=your_api_key_here
   ```

3. **For permanent setup, add to your shell profile:**
   ```bash
   echo 'export SERPAPI_KEY=your_api_key_here' >> ~/.zshrc
   source ~/.zshrc
   ```

## Usage

The research action will now:
- ✅ Use real Google search results
- ✅ Include featured snippets and knowledge graphs
- ✅ Provide comprehensive AI synthesis
- ✅ Show actual sources and URLs

## Fallback

If no API key is provided, the system uses:
- Demo key (limited searches)
- Fallback to AI-generated research insights

## Features

- **Real Google Results**: Actual search results from Google
- **Featured Snippets**: Priority content like answer boxes
- **Knowledge Graphs**: Structured information panels
- **Source URLs**: Direct links to original content
- **AI Synthesis**: Comprehensive analysis combining all results

Start using real search results now! 