#!/usr/bin/env node

/**
 * Simple MCP Test Script
 * Tests individual MCP tools manually
 */

const { spawn } = require('child_process');

async function testMCPTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let responseData = '';
    let errorData = '';
    
    const timeout = setTimeout(() => {
      serverProcess.kill();
      reject(new Error('Request timeout'));
    }, 20000);

    const onData = (data) => {
      responseData += data.toString();
    };

    const onError = (data) => {
      errorData += data.toString();
    };

    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', onError);

    // Wait for server to initialize
    setTimeout(() => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      serverProcess.stdin.write(JSON.stringify(request) + '\n');
      
      // Wait for response
      setTimeout(() => {
        clearTimeout(timeout);
        serverProcess.kill();
        
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          let response = null;
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.result) {
                response = parsed;
                break;
              }
            } catch (e) {
              // Continue
            }
          }
          
          if (response) {
            resolve(response);
          } else {
            reject(new Error('No valid response received'));
          }
        } catch (error) {
          reject(error);
        }
      }, 10000);
    }, 5000);
  });
}

async function runTests() {
  console.log('🧪 Testing CrowdListen MCP Tools...\n');

  const tests = [
    { name: 'get_platform_status', args: {} },
    { name: 'health_check', args: {} },
    { name: 'get_trending_content', args: { platform: 'reddit', limit: 3 } },
    { name: 'search_content', args: { platform: 'reddit', query: 'technology', limit: 3 } }
  ];

  for (const test of tests) {
    try {
      console.log(`🔧 Testing ${test.name}...`);
      const response = await testMCPTool(test.name, test.args);
      
      if (response.error) {
        console.log(`❌ ${test.name} failed:`, response.error.message);
      } else {
        const data = JSON.parse(response.result.content[0].text);
        console.log(`✅ ${test.name} succeeded:`, JSON.stringify(data, null, 2).substring(0, 200) + '...');
      }
    } catch (error) {
      console.log(`❌ ${test.name} failed:`, error.message);
    }
    console.log('');
  }
}

runTests().catch(console.error);
