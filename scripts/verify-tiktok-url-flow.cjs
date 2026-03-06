const assert = require('assert');
const mcpHandler = require('../api/mcp.js');

function createMockReq(method, body) {
  return { method, body };
}

function invoke(body) {
  return new Promise((resolve, reject) => {
    const res = {
      _status: 200,
      setHeader: () => res,
      status(code) {
        this._status = code;
        return this;
      },
      json(payload) {
        resolve({ status: this._status, payload });
        return this;
      },
      end() {
        resolve({ status: this._status, payload: null });
        return this;
      }
    };

    Promise.resolve(mcpHandler(createMockReq('POST', body), res)).catch(reject);
  });
}

function extractText(resultPayload) {
  return resultPayload?.result?.content?.[0]?.text || '';
}

async function run() {
  const results = [];

  // 1) MCP tools/list should include analyze_url
  {
    const response = await invoke({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    assert.equal(response.status, 200);
    const tools = response.payload?.result?.tools || [];
    const hasAnalyzeUrl = tools.some((t) => t.name === 'analyze_url');
    assert.ok(hasAnalyzeUrl, 'tools/list missing analyze_url');
    results.push('PASS tools/list includes analyze_url');
  }

  // 2) Parser unit-like check: canonical TikTok URL
  {
    const canonical = 'https://www.tiktok.com/@scout2015/video/6718335390845095173';
    const response = await invoke({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'analyze_url', arguments: { url: canonical } }
    });

    assert.equal(response.status, 200);
    const text = extractText(response.payload);
    const parsed = JSON.parse(text);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.urlType, 'canonical');
    assert.equal(parsed.videoId, '6718335390845095173');
    assert.equal(parsed.username, 'scout2015');
    assert.ok(parsed.canonicalUrl.includes('/@scout2015/video/6718335390845095173'));
    results.push('PASS canonical URL parser check');
  }

  // 3) Parser unit-like check: short TikTok URL (graceful degraded fallback)
  {
    const shortUrl = 'https://vm.tiktok.com/ZM8abc123/';
    const response = await invoke({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'analyze_url', arguments: { url: shortUrl } }
    });

    assert.equal(response.status, 200);
    const text = extractText(response.payload);
    const parsed = JSON.parse(text);
    assert.equal(parsed.status, 'degraded');
    assert.equal(parsed.urlType, 'short');
    assert.equal(parsed.canAnalyze, false);
    assert.ok((parsed.fallbackReason || '').toLowerCase().includes('short url'));
    results.push('PASS short URL graceful degraded fallback check');
  }

  console.log('Verification results:');
  for (const line of results) {
    console.log(`- ${line}`);
  }
}

run().catch((err) => {
  console.error('FAIL verification script:', err.message);
  process.exit(1);
});
