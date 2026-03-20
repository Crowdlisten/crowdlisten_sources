#!/usr/bin/env node

/**
 * CrowdListen HTTP API Server
 * REST API for AI agent integration — same handlers as CLI and MCP.
 */

import express from 'express';
import { createService } from './service-config.js';
import {
  searchContent,
  getContentComments,
  analyzeContent,
  clusterOpinions,
  getTrendingContent,
  getUserContent,
  getPlatformStatus,
  healthCheck,
  deepAnalyze,
  extractInsights,
  researchSynthesis,
} from './handlers.js';

const app = express();
app.use(express.json());

const service = createService();

// Wrapper: calls handler, returns JSON, catches errors
function wrap(fn: (svc: typeof service, body: any) => Promise<any> | any) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const result = await fn(service, req.body);
      res.json(result);
    } catch (err: any) {
      console.error(`[HTTP] Error:`, err.message);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };
}

// --- Routes ---

app.post('/v1/search', wrap((svc, body) => searchContent(svc, body)));
app.post('/v1/comments', wrap((svc, body) => getContentComments(svc, body)));
app.post('/v1/analyze', wrap((svc, body) => analyzeContent(svc, body)));
app.post('/v1/cluster', wrap((svc, body) => clusterOpinions(svc, body)));
app.post('/v1/trending', wrap((svc, body) => getTrendingContent(svc, body)));
app.post('/v1/user-content', wrap((svc, body) => getUserContent(svc, body)));
app.get('/v1/status', wrap((svc) => getPlatformStatus(svc)));
app.get('/v1/health', wrap((svc) => healthCheck(svc)));

// --- Paid endpoints (proxy to agent.crowdlisten.com) ---
app.post('/v1/insights', async (req, res) => {
  try {
    const result = await extractInsights(req.body);
    res.json(result);
  } catch (err: any) {
    const status = err.message?.includes('API_KEY required') ? 402 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.post('/v1/research', async (req, res) => {
  try {
    const result = await researchSynthesis(req.body);
    res.json(result);
  } catch (err: any) {
    const status = err.message?.includes('API_KEY required') ? 402 : 500;
    res.status(status).json({ error: err.message });
  }
});

// --- Server ---

const PORT = parseInt(process.env.CROWDLISTEN_PORT || '3001');

async function main() {
  console.error('[HTTP] Initializing CrowdListen HTTP API...');
  const initResults = await service.initialize();
  const ok = Object.entries(initResults).filter(([, s]) => s).map(([p]) => p);

  if (ok.length === 0) {
    console.error('[HTTP] Error: No platforms initialized');
    process.exit(1);
  }

  console.error(`[HTTP] Platforms: ${ok.join(', ')}`);

  app.listen(PORT, () => {
    console.error(`[HTTP] CrowdListen API running on http://localhost:${PORT}`);
    console.error(`[HTTP] Endpoints: POST /v1/{search,comments,analyze,cluster,trending,user-content} | GET /v1/{status,health}`);
  });
}

process.on('SIGINT', async () => {
  await service.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await service.cleanup();
  process.exit(0);
});

main().catch((err) => {
  console.error('[HTTP] Fatal:', err);
  process.exit(1);
});
