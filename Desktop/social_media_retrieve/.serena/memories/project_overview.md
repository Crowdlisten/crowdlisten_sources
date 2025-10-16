# CrowdListen MCP Server - Project Overview

## Purpose
CrowdListen MCP is a unified Model Context Protocol server that provides standardized access to multiple social media platforms for content retrieval and analysis. It abstracts the complexity of different social media APIs into a single, clean interface.

## Tech Stack
- **Language**: TypeScript with full type safety
- **Framework**: Model Context Protocol (MCP) SDK  
- **APIs**: Twitter API v2, Instagram Private API, Reddit JSON API, TikTok HTTP endpoints
- **Architecture**: Adapter pattern with unified service layer
- **Dependencies**: @modelcontextprotocol/sdk, axios, twitter-api-v2, instagram-private-api

## Project Structure
- `src/core/interfaces/` - Unified interface definitions
- `src/core/base/` - Shared adapter functionality  
- `src/core/utils/` - Data standardization utilities
- `src/platforms/` - Platform-specific adapters (TikTok, Twitter, Reddit, Instagram)
- `src/services/` - Service coordinator (UnifiedSocialMediaService)
- `src/index.ts` - Main MCP server entry point

## Current Capabilities
- 7 Unified MCP Tools for content retrieval across all platforms
- Cross-platform search, trending content, user content, comment analysis
- Health monitoring and platform status checks
- Comprehensive error handling and rate limiting
- Data normalization for consistent format across platforms