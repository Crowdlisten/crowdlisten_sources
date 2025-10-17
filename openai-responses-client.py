#!/usr/bin/env python3
"""
OpenAI Responses API client for CrowdListen MCP Server
Demonstrates how to use the social media clustering MCP server with OpenAI's new Responses API
"""

import os
from openai import OpenAI

class CrowdListenOpenAIClient:
    def __init__(self, mcp_server_url: str = None, connector_id: str = None):
        """
        Initialize OpenAI client for CrowdListen MCP integration
        
        Args:
            mcp_server_url: URL of deployed CrowdListen MCP server (for custom deployment)
            connector_id: OpenAI connector ID (for hosted connector)
        """
        self.client = OpenAI()
        self.mcp_server_url = mcp_server_url
        self.connector_id = connector_id
        
    def create_mcp_tool_config(self, authorization_token: str = None):
        """Create MCP tool configuration for OpenAI Responses API"""
        
        if self.connector_id:
            # Use hosted OpenAI connector
            return {
                "type": "mcp",
                "server_label": "CrowdListen",
                "connector_id": self.connector_id,
                "authorization": authorization_token,
                "require_approval": "never",
            }
        else:
            # Use custom MCP server
            return {
                "type": "mcp", 
                "server_label": "CrowdListen",
                "server_description": "Social media content analysis with engagement-weighted opinion clustering across TikTok, Twitter, Reddit, and Instagram",
                "server_url": self.mcp_server_url,
                "require_approval": "never",
            }
    
    def analyze_social_media_content(self, platform: str, content_id: str, enable_clustering: bool = True, authorization_token: str = None):
        """
        Analyze social media content with opinion clustering
        
        Args:
            platform: Social media platform (tiktok, twitter, reddit, instagram)
            content_id: ID of content to analyze
            enable_clustering: Whether to enable engagement-weighted clustering
            authorization_token: OAuth token if using hosted connector
        """
        
        tool_config = self.create_mcp_tool_config(authorization_token)
        
        prompt = f"""
        Analyze the {platform} content with ID: {content_id}
        
        Please provide:
        1. Basic content analysis (sentiment, themes, summary)
        2. {"Engagement-weighted opinion clustering analysis" if enable_clustering else "Skip clustering analysis"}
        3. Comment insights and community reaction patterns
        4. Key takeaways about audience sentiment
        
        Focus on actionable insights about the content performance and audience engagement.
        """
        
        try:
            resp = self.client.responses.create(
                model="gpt-4",  # Use gpt-4 for now, gpt-5 when available
                tools=[tool_config],
                input=prompt,
            )
            
            return {
                "status": "success",
                "analysis": resp.output_text,
                "platform": platform,
                "content_id": content_id,
                "clustering_enabled": enable_clustering
            }
            
        except Exception as e:
            return {
                "status": "error", 
                "error": str(e),
                "platform": platform,
                "content_id": content_id
            }
    
    def get_trending_analysis(self, platforms: list = None, authorization_token: str = None):
        """
        Get trending content analysis across platforms
        
        Args:
            platforms: List of platforms to analyze (default: all)
            authorization_token: OAuth token if using hosted connector
        """
        
        if platforms is None:
            platforms = ["tiktok", "twitter", "reddit", "instagram"]
        
        tool_config = self.create_mcp_tool_config(authorization_token)
        
        platforms_str = ", ".join(platforms)
        prompt = f"""
        Get trending content from {platforms_str} and analyze:
        
        1. Current trending topics and themes
        2. Cross-platform sentiment patterns  
        3. Engagement patterns and viral content characteristics
        4. Community reaction differences between platforms
        
        Provide insights about what's resonating with audiences right now.
        """
        
        try:
            resp = self.client.responses.create(
                model="gpt-4",
                tools=[tool_config],
                input=prompt,
            )
            
            return {
                "status": "success",
                "analysis": resp.output_text,
                "platforms": platforms
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "platforms": platforms
            }
    
    def search_and_cluster_opinions(self, query: str, platforms: list = None, authorization_token: str = None):
        """
        Search for content and perform opinion clustering analysis
        
        Args:
            query: Search query
            platforms: Platforms to search (default: all)
            authorization_token: OAuth token if using hosted connector
        """
        
        if platforms is None:
            platforms = ["tiktok", "twitter", "reddit", "instagram"]
        
        tool_config = self.create_mcp_tool_config(authorization_token)
        
        platforms_str = ", ".join(platforms)
        prompt = f"""
        Search for content about "{query}" on {platforms_str} and perform comprehensive analysis:
        
        1. Find relevant content across platforms
        2. Analyze comments with engagement-weighted clustering
        3. Identify opinion themes and sentiment patterns
        4. Compare how different platforms discuss this topic
        5. Highlight the most engaging/viral perspectives
        
        Provide strategic insights about public opinion on this topic.
        """
        
        try:
            resp = self.client.responses.create(
                model="gpt-4",
                tools=[tool_config], 
                input=prompt,
            )
            
            return {
                "status": "success",
                "analysis": resp.output_text,
                "query": query,
                "platforms": platforms
            }
            
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "query": query,
                "platforms": platforms
            }


def main():
    """Example usage of CrowdListen OpenAI integration"""
    
    # Option 1: Use with custom deployed MCP server
    # client = CrowdListenOpenAIClient(mcp_server_url="https://your-crowdlisten-server.com/mcp")
    
    # Option 2: Use with OpenAI hosted connector (when available)
    # client = CrowdListenOpenAIClient(connector_id="connector_crowdlisten")
    
    # For demo purposes, use a placeholder URL
    client = CrowdListenOpenAIClient(mcp_server_url="https://crowdlisten-mcp.herokuapp.com/mcp")
    
    print("🎯 CrowdListen OpenAI Integration Demo")
    print("====================================")
    
    # Example 1: Analyze specific content
    print("\n1. Analyzing TikTok video...")
    result1 = client.analyze_social_media_content(
        platform="tiktok",
        content_id="7123456789012345678",
        enable_clustering=True
    )
    print(f"Status: {result1['status']}")
    if result1['status'] == 'success':
        print(f"Analysis: {result1['analysis'][:200]}...")
    else:
        print(f"Error: {result1['error']}")
    
    # Example 2: Get trending analysis
    print("\n2. Getting trending content analysis...")
    result2 = client.get_trending_analysis(platforms=["tiktok", "twitter"])
    print(f"Status: {result2['status']}")
    if result2['status'] == 'success':
        print(f"Trending Analysis: {result2['analysis'][:200]}...")
    else:
        print(f"Error: {result2['error']}")
    
    # Example 3: Search and cluster opinions
    print("\n3. Searching and clustering opinions...")
    result3 = client.search_and_cluster_opinions(
        query="climate change",
        platforms=["twitter", "reddit"]
    )
    print(f"Status: {result3['status']}")
    if result3['status'] == 'success':
        print(f"Opinion Analysis: {result3['analysis'][:200]}...")
    else:
        print(f"Error: {result3['error']}")


if __name__ == "__main__":
    main()