#!/usr/bin/env node

/**
 * CrowdListen MCP Server Test Script
 * Tests the social media retrieval system functionality
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class CrowdListenTester {
  constructor() {
    this.results = [];
    this.serverProcess = null;
  }

  async runTests() {
    console.log('🧪 Starting CrowdListen MCP Server Tests...\n');

    try {
      // Test 1: Check if server starts without errors
      await this.testServerStartup();
      
      // Test 2: Test platform status
      await this.testPlatformStatus();
      
      // Test 3: Test health check
      await this.testHealthCheck();
      
      // Test 4: Test Reddit functionality (no credentials needed)
      await this.testRedditFunctionality();
      
      // Test 5: Test trending content
      await this.testTrendingContent();
      
      // Test 6: Test search functionality
      await this.testSearchFunctionality();

      this.printResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      this.cleanup();
    }
  }

  async testServerStartup() {
    const startTime = Date.now();
    
    try {
      console.log('🔧 Testing server startup...');
      
      // Check if the built files exist
      const distPath = path.join(process.cwd(), 'dist', 'index.js');
      
      if (!fs.existsSync(distPath)) {
        throw new Error('Built server file not found. Run "npm run build" first.');
      }
      
      // Try to start the server process
      this.serverProcess = spawn('node', [distPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });
      
      // Give the server a moment to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if process is still running
      if (this.serverProcess.killed) {
        throw new Error('Server process died during startup');
      }
      
      this.addResult('Server Startup', true, undefined, undefined, Date.now() - startTime);
      console.log('✅ Server started successfully');
      
    } catch (error) {
      this.addResult('Server Startup', false, error.message, undefined, Date.now() - startTime);
      console.log('❌ Server startup failed:', error.message);
    }
  }

  async testPlatformStatus() {
    const startTime = Date.now();
    
    try {
      console.log('📊 Testing platform status...');
      
      // Send MCP request to get platform status
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'get_platform_status',
          arguments: {}
        }
      };
      
      const response = await this.sendMCPRequest(request);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const platforms = JSON.parse(response.result.content[0].text);
      
      this.addResult('Platform Status', true, undefined, platforms, Date.now() - startTime);
      console.log('✅ Platform status retrieved:', Object.keys(platforms.availablePlatforms || {}));
      
    } catch (error) {
      this.addResult('Platform Status', false, error.message, undefined, Date.now() - startTime);
      console.log('❌ Platform status test failed:', error.message);
    }
  }

  async testHealthCheck() {
    const startTime = Date.now();
    
    try {
      console.log('🏥 Testing health check...');
      
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'health_check',
          arguments: {}
        }
      };
      
      const response = await this.sendMCPRequest(request);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const health = JSON.parse(response.result.content[0].text);
      
      this.addResult('Health Check', true, undefined, health, Date.now() - startTime);
      console.log('✅ Health check completed:', health.healthStatus);
      
    } catch (error) {
      this.addResult('Health Check', false, error.message, undefined, Date.now() - startTime);
      console.log('❌ Health check test failed:', error.message);
    }
  }

  async testRedditFunctionality() {
    const startTime = Date.now();
    
    try {
      console.log('🔴 Testing Reddit functionality...');
      
      // Test Reddit trending content
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_trending_content',
          arguments: {
            platform: 'reddit',
            limit: 5
          }
        }
      };
      
      const response = await this.sendMCPRequest(request);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const redditData = JSON.parse(response.result.content[0].text);
      
      this.addResult('Reddit Functionality', true, undefined, redditData, Date.now() - startTime);
      console.log('✅ Reddit trending content retrieved:', redditData.count, 'posts');
      
    } catch (error) {
      this.addResult('Reddit Functionality', false, error.message, undefined, Date.now() - startTime);
      console.log('❌ Reddit functionality test failed:', error.message);
    }
  }

  async testTrendingContent() {
    const startTime = Date.now();
    
    try {
      console.log('📈 Testing trending content...');
      
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_trending_content',
          arguments: {
            platform: 'all',
            limit: 10
          }
        }
      };
      
      const response = await this.sendMCPRequest(request);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const trendingData = JSON.parse(response.result.content[0].text);
      
      this.addResult('Trending Content', true, undefined, trendingData, Date.now() - startTime);
      console.log('✅ Trending content retrieved:', trendingData.count, 'posts across platforms');
      
    } catch (error) {
      this.addResult('Trending Content', false, error.message, undefined, Date.now() - startTime);
      console.log('❌ Trending content test failed:', error.message);
    }
  }

  async testSearchFunctionality() {
    const startTime = Date.now();
    
    try {
      console.log('🔍 Testing search functionality...');
      
      const request = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'search_content',
          arguments: {
            platform: 'reddit',
            query: 'technology',
            limit: 5
          }
        }
      };
      
      const response = await this.sendMCPRequest(request);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const searchData = JSON.parse(response.result.content[0].text);
      
      this.addResult('Search Functionality', true, undefined, searchData, Date.now() - startTime);
      console.log('✅ Search functionality working:', searchData.count, 'results for "technology"');
      
    } catch (error) {
      this.addResult('Search Functionality', false, error.message, undefined, Date.now() - startTime);
      console.log('❌ Search functionality test failed:', error.message);
    }
  }

  async sendMCPRequest(request) {
    return new Promise((resolve, reject) => {
      if (!this.serverProcess) {
        reject(new Error('Server process not running'));
        return;
      }

      let responseData = '';
      
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 15000);

      const onData = (data) => {
        responseData += data.toString();
        
        try {
          const response = JSON.parse(responseData);
          clearTimeout(timeout);
          this.serverProcess.stdout.removeListener('data', onData);
          resolve(response);
        } catch (e) {
          // Continue accumulating data
        }
      };

      this.serverProcess.stdout.on('data', onData);
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  addResult(test, success, error, data, duration = 0) {
    this.results.push({
      test,
      success,
      error,
      data,
      duration
    });
  }

  printResults() {
    console.log('\n📋 Test Results Summary:');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${total}`);
    console.log(`⏱️  Total Time: ${this.results.reduce((sum, r) => sum + r.duration, 0)}ms`);
    
    console.log('\n📝 Detailed Results:');
    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      const duration = `${result.duration}ms`;
      console.log(`${status} ${result.test} (${duration})`);
      
      if (!result.success && result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      if (result.data && typeof result.data === 'object') {
        const summary = this.getDataSummary(result.data);
        if (summary) {
          console.log(`   Data: ${summary}`);
        }
      }
    });
    
    console.log('\n' + '='.repeat(50));
    
    if (failed === 0) {
      console.log('🎉 All tests passed! The CrowdListen MCP server is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the errors above for details.');
    }
  }

  getDataSummary(data) {
    if (data.count !== undefined) {
      return `${data.count} items`;
    }
    if (data.availablePlatforms) {
      return `${Object.keys(data.availablePlatforms).length} platforms available`;
    }
    if (data.healthStatus) {
      const healthy = Object.values(data.healthStatus).filter(status => status === 'healthy').length;
      const total = Object.keys(data.healthStatus).length;
      return `${healthy}/${total} platforms healthy`;
    }
    return '';
  }

  cleanup() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }
}

// Run the tests
if (require.main === module) {
  const tester = new CrowdListenTester();
  tester.runTests().catch(console.error);
}

module.exports = { CrowdListenTester };