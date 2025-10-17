// Simple test endpoint to debug the 500 error
module.exports = async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Test basic functionality
    const testResult = {
      method: req.method,
      timestamp: new Date().toISOString(),
      env_check: {
        twitter_key_exists: !!process.env.TWITTER_API_KEY,
        node_version: process.version,
        platform: process.platform
      },
      body: req.body || 'no body',
      headers: req.headers
    };

    return res.status(200).json({
      status: 'success',
      message: 'Test endpoint working',
      data: testResult
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message,
      stack: error.stack
    });
  }
};