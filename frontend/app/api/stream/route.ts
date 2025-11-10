export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';

// Change this to your FastAPI backend URL
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:9001/stream';

export async function POST(req: NextRequest) {
  // DEBUG: Log incoming request
  const clone = req.clone();
  let debugBody = "";
  try {
    debugBody = await clone.text();
    console.log("[Proxy] Incoming body:", debugBody);
  } catch (e) {
    console.log("[Proxy] Could not read body for debug");
  }
  // Forward the request body and headers to the Python backend
  const body = req.body;
  const headers = new Headers(req.headers);
  // Remove Next.js specific headers that may cause issues
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  // Forward the request to the Python backend
  const backendRes = await fetch(PYTHON_BACKEND_URL, {
    method: 'POST',
    headers,
    body,
    // @ts-ignore
    duplex: 'half', // Required for streaming in Node.js 18+
  });

  // Stream the response back to the client
  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: {
      'Content-Type': backendRes.headers.get('content-type') || 'text/event-stream',
      'Cache-Control': 'no-cache',
      // Allow CORS if needed
      'Access-Control-Allow-Origin': '*',
    },
  });
}
