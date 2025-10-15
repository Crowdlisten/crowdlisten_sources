# CrowdListen MCP Server - Vercel Deployment Guide

## 🚀 Deploy to Vercel

### Prerequisites
1. Vercel account
2. GitHub repository with your code
3. API keys for social media platforms

### Step 1: Prepare for Deployment

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Test locally (optional)
npm run dev
```

### Step 2: Set Environment Variables in Vercel

Go to your Vercel dashboard and add these environment variables:

#### Required (for clustering)
- `OPENAI_API_KEY`: `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`

#### Platform Credentials (optional - platforms work without some)

**Twitter/X:**
- `TWITTER_API_KEY`: `yCw83ZY01TcQBkqHOrYWykIcb`
- `TWITTER_API_KEY_SECRET`: `tsDdXxQhcOln8zZKHVUYoaiNPNAbN2T81V6QkVkM9mKqSAfTP0`
- `TWITTER_ACCESS_TOKEN`: `1572070028471566336-YGM2yMvSCIToiajviXGQhhpoh47PLZ`
- `TWITTER_ACCESS_TOKEN_SECRET`: `uheMpJ1JOfoatmuDuDsryillS5O7rpZqn8BgUhWnuDijr`

**Instagram:**
- `INSTAGRAM_USERNAME`: `crowdlistening`
- `INSTAGRAM_PASSWORD`: `Terry:254954`

**TikTok:**
- `TIKTOK_MS_TOKEN`: `xAMI0SgFWSr1YXP3PqYXnhuDvudP4d8Q8Nh9GjZmP6po9J6wxkODQnGffDtcdTdj7Gnlg8egF6aGQYIHbCEerrwyVkcVoLg8mycnDh6scyzfV5bfPMmyS0DlUMcJQhYqAUW0cFn3a7HKxNA=`

**Reddit:** No credentials needed (works with public access)

### Step 3: Deploy to Vercel

#### Option A: Deploy via GitHub Integration
1. Push your code to GitHub
2. Connect GitHub repo to Vercel
3. Vercel will auto-deploy on push

#### Option B: Deploy via Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Step 4: Test Your Deployment

Your MCP server will be available at:
- Main endpoint: `https://your-app.vercel.app/api/mcp`
- Health check: `https://your-app.vercel.app/api/mcp` (GET request)
- OAuth metadata: `https://your-app.vercel.app/.well-known/oauth-protected-resource`

#### Test with curl:
```bash
# Health check
curl https://your-app.vercel.app/api/mcp

# Test MCP tool
curl -X POST https://your-app.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "health_check",
      "arguments": {}
    }
  }'
```

## 🔗 Connect to OpenAI

### Option 1: Use with OpenAI Responses API

```python
from openai import OpenAI

client = OpenAI()

resp = client.responses.create(
    model="gpt-4",
    tools=[
        {
            "type": "mcp",
            "server_label": "CrowdListen",
            "server_description": "Social media content analysis with engagement-weighted opinion clustering",
            "server_url": "https://your-app.vercel.app/api/mcp",
            "require_approval": "never",
        },
    ],
    input="Analyze trending content on TikTok and provide opinion clustering insights",
)

print(resp.output_text)
```

### Option 2: Submit for OpenAI Connector Review

1. Go to OpenAI's MCP Connector Interest Form
2. Submit your deployed Vercel URL
3. Provide description of CrowdListen capabilities
4. Wait for approval for official connector status

## 🛠️ Available MCP Tools

Your deployed server provides these tools:

1. **analyze_content**: Analyze content with engagement-weighted clustering
2. **get_trending_content**: Get trending content from platforms
3. **search_content**: Search across all platforms
4. **get_content_comments**: Get comments for specific content
5. **health_check**: Check platform status

## 🔍 Monitoring

### Vercel Functions Logs
- View logs in Vercel dashboard under Functions tab
- Monitor performance and errors

### Health Endpoint
Monitor your deployment health:
```bash
curl https://your-app.vercel.app/api/mcp
```

## 🚨 Troubleshooting

### Common Issues

1. **Build Errors**: Check dependencies in package.json
2. **Environment Variables**: Ensure all required vars are set in Vercel
3. **Function Timeout**: Increase maxDuration in vercel.json if needed
4. **Import Errors**: Check Next.js config for external packages

### Debug Locally
```bash
# Run development server
npm run dev

# Test MCP endpoint locally
curl http://localhost:3000/api/mcp
```

## 🎯 Next Steps

1. **Deploy**: Get your Vercel URL
2. **Test**: Verify all tools work correctly
3. **Submit**: Apply for OpenAI connector status
4. **Monitor**: Watch logs and performance
5. **Scale**: Add more platforms or features as needed

Your CrowdListen MCP server will be accessible to ChatGPT and other MCP clients once deployed! 🎉