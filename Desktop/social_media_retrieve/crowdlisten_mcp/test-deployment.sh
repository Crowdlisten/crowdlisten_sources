#!/bin/bash
# Test script for MCP server deployment

echo "🧪 Testing CrowdListen MCP Server Deployment"
echo "=========================================="

# Use the current Vercel URL
BASE_URL="https://crowdlisten-mcp.vercel.app"

echo "Testing deployment at: $BASE_URL"
echo ""

echo "1. Testing health check (GET /api/mcp)..."
HEALTH_RESPONSE=$(curl -s -w "HTTP_STATUS:%{http_code}" "$BASE_URL/api/mcp")
HTTP_STATUS=$(echo "$HEALTH_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Health check successful (HTTP $HTTP_STATUS)"
    echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
else
    echo "❌ Health check failed (HTTP $HTTP_STATUS)"
    echo "$HEALTH_BODY"
fi

echo -e "\n2. Testing OAuth metadata..."
OAUTH_RESPONSE=$(curl -s -w "HTTP_STATUS:%{http_code}" "$BASE_URL/.well-known/oauth-protected-resource")
OAUTH_STATUS=$(echo "$OAUTH_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
OAUTH_BODY=$(echo "$OAUTH_RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

if [ "$OAUTH_STATUS" = "200" ]; then
    echo "✅ OAuth metadata successful (HTTP $OAUTH_STATUS)"
    echo "$OAUTH_BODY" | jq '.' 2>/dev/null || echo "$OAUTH_BODY"
else
    echo "❌ OAuth metadata failed (HTTP $OAUTH_STATUS)"
    echo "$OAUTH_BODY"
fi

echo -e "\n3. Testing MCP tool call (POST /api/mcp)..."
MCP_RESPONSE=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "health_check",
      "arguments": {}
    }
  }')
MCP_STATUS=$(echo "$MCP_RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
MCP_BODY=$(echo "$MCP_RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

if [ "$MCP_STATUS" = "200" ]; then
    echo "✅ MCP tool call successful (HTTP $MCP_STATUS)"
    echo "$MCP_BODY" | jq '.' 2>/dev/null || echo "$MCP_BODY"
else
    echo "❌ MCP tool call failed (HTTP $MCP_STATUS)"
    echo "$MCP_BODY"
fi

echo -e "\n=========================================="
echo "🎯 Summary:"
echo "Health Check: $([ "$HTTP_STATUS" = "200" ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "OAuth Metadata: $([ "$OAUTH_STATUS" = "200" ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "MCP Tool Call: $([ "$MCP_STATUS" = "200" ] && echo "✅ PASS" || echo "❌ FAIL")"

if [ "$HTTP_STATUS" = "200" ] && [ "$OAUTH_STATUS" = "200" ] && [ "$MCP_STATUS" = "200" ]; then
    echo ""
    echo "🎉 All tests passed! Your MCP server is ready for OpenAI integration."
    echo "🔗 Server URL: $BASE_URL/api/mcp"
else
    echo ""
    echo "⚠️  Some tests failed. Check Vercel deployment logs for details."
fi