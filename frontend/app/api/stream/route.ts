export const dynamic = "force-dynamic";

import {NextRequest} from 'next/server';

// Change this to your FastAPI backend URL
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:9001/stream';

export const runtime = "nodejs"; // important if you're using Node features like setTimeout

export async function POST(req: NextRequest) {
    // Forward the request body and headers to the Python backend
    const body = req.body;
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("connection");
    headers.delete("content-length");

    // Fetch from Python backend
    const backendRes = await fetch(PYTHON_BACKEND_URL, {
        method: "POST",
        headers,
        body,
        // @ts-ignore
        duplex: "half", // Required for streaming in Node.js 18+
    });

    // Create a ReadableStream to wrap backend JSONL as SSE
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const reader = backendRes.body?.getReader();
            if (!reader) {
                controller.close();
                return;
            }

            let buffer = "";
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    buffer += new TextDecoder().decode(value);
                    let lines = buffer.split("\n");
                    buffer = lines.pop() || ""; // Save incomplete line for next chunk

                    for (const line of lines) {
                        if (line.trim() === "") continue;
                        // Wrap each JSON line as an SSE event
                        const sseChunk = `data: ${line}\n\n`;
                        controller.enqueue(encoder.encode(sseChunk));
                    }
                }
            }
            // Flush any remaining buffered line
            if (buffer.trim() !== "") {
                const sseChunk = `data: ${buffer}\n\n`;
                controller.enqueue(encoder.encode(sseChunk));
            }
            controller.close();
        },
        cancel(reason) {
            console.log("Stream cancelled", reason);
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}


