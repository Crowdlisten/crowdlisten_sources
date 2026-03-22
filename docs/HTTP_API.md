# HTTP API Reference

> **Status: Planned.** The HTTP API is not yet implemented. CrowdListen Insights currently supports MCP (for AI agents) and CLI interfaces only. This document describes the planned HTTP API for future releases.

~~Start the HTTP server:~~
```bash
# Not yet available — planned for a future release
# npm run start:http   # Will run on http://localhost:3001
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/search` | Search posts |
| POST | `/v1/comments` | Get comments |
| POST | `/v1/analyze` | Full analysis pipeline |
| POST | `/v1/cluster` | Opinion clustering |
| POST | `/v1/trending` | Trending content |
| POST | `/v1/user-content` | User's content |
| GET | `/v1/status` | Available platforms |
| GET | `/v1/health` | Platform health |

## Examples

```bash
curl -X POST http://localhost:3001/v1/search \
  -H 'Content-Type: application/json' \
  -d '{"platform":"reddit","query":"AI agents","limit":10}'

curl -X POST http://localhost:3001/v1/comments \
  -H 'Content-Type: application/json' \
  -d '{"platform":"youtube","contentId":"dQw4w9WgXcQ","limit":50}'

curl -X POST http://localhost:3001/v1/analyze \
  -H 'Content-Type: application/json' \
  -d '{"platform":"reddit","contentId":"t3_abc123"}'

curl http://localhost:3001/v1/health
```

All POST endpoints accept JSON with the same parameters as the CLI/MCP tools.
