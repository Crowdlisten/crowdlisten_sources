// Simple test function to verify Vercel deployment
module.exports = (req, res) => {
  res.status(200).json({
    message: 'Hello from Vercel Functions!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
};