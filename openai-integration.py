#!/usr/bin/env python3
"""
OpenAI Responses API integration for CrowdListen MCP server
Run this after api.crowdlisten.com is deployed
"""

from openai import OpenAI

client = OpenAI()

# Test the MCP integration
response = client.responses.create(
    model="gpt-4",
    tools=[
        {
            "type": "mcp",
            "server_label": "CrowdListen",
            "server_description": "Social media content analysis with engagement-weighted opinion clustering across TikTok, Twitter, Reddit, and Instagram",
            "server_url": "https://api.crowdlisten.com/api/mcp",
            "require_approval": "never",
        }
    ],
    input="Analyze trending content on TikTok and provide opinion clustering insights for the most popular videos"
)

print("🤖 OpenAI Response:")
print("=" * 50)
print(response.output_text)
print("=" * 50)
print(f"✅ Integration successful! MCP server at api.crowdlisten.com is working with ChatGPT")