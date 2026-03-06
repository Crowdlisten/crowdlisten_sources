---
name: sources-router
description: Route CrowdListen Sources requests to the right MCP tools and workflow paths. Use for source-type detection, tool selection, and deterministic routing decisions across URL/keyword/account/media inputs.
---

# sources-router

1. Classify input as one of: `url`, `keyword`, `account`, `media`.
2. Select MCP path:
   - `keyword` -> `search_content` or `get_trending_content`
   - `account` -> `get_user_content`
   - `url` -> `analyze_content` and/or `get_content_comments`
   - `media` -> delegate to ingest enrichment (transcribe/frame) then analysis
3. Emit deterministic routing output with trace id.

## Deterministic Output

```json
{
  "trace_id": "string",
  "input_type": "url|keyword|account|media",
  "route": "string",
  "mcp_tools": ["string"],
  "flags": {"beta": false}
}
```
