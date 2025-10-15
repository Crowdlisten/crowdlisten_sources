// Simple test endpoint to verify Next.js API routes are working
export async function GET() {
  return Response.json({
    message: "✅ Next.js API routes are working!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
  });
}

export async function POST() {
  return Response.json({
    message: "✅ POST requests work too!",
    timestamp: new Date().toISOString(),
  });
}