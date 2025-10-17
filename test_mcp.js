const mcpHandler = require('./api/mcp.js');

// Mock request and response objects
const createMockReq = (method, body) => ({
  method,
  body
});

const createMockRes = () => {
  const res = {
    status: (code) => res,
    json: (data) => {
      console.log(`Status: ${res._status || 200}`);
      console.log('Response:', JSON.stringify(data, null, 2));
      return res;
    },
    end: () => {
      console.log('Response ended');
      return res;
    },
    setHeader: (name, value) => {
      console.log(`Header: ${name}: ${value}`);
      return res;
    }
  };
  
  res.status = (code) => {
    res._status = code;
    return res;
  };
  
  return res;
};

async function testMCP() {
  console.log('=== Testing MCP Initialize Method ===');
  const initReq = createMockReq('POST', {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} }
    },
    id: 1
  });
  await mcpHandler(initReq, createMockRes());
  
  console.log('\n=== Testing MCP Tools/List Method ===');
  const listReq = createMockReq('POST', {
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 2
  });
  await mcpHandler(listReq, createMockRes());
  
  console.log('\n=== Testing MCP Tools/Call Method ===');
  const callReq = createMockReq('POST', {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'health_check',
      arguments: {}
    },
    id: 3
  });
  await mcpHandler(callReq, createMockRes());
}

testMCP().catch(console.error);