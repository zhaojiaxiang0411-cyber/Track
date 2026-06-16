import { addSseClient, getClientCount, removeSseClient } from "@/lib/events";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// SSE 仅向客户端单向推送只读更新，对所有人（含游客）开放。
export async function GET(_request: NextRequest) {
  let clientId: number | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clientId = addSseClient(controller);
      const connected = new TextEncoder().encode(
        `event: connected\ndata: ${JSON.stringify({ clients: getClientCount() })}\n\n`
      );
      controller.enqueue(connected);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);

      (controller as ReadableStreamDefaultController<Uint8Array> & {
        _heartbeat?: ReturnType<typeof setInterval>;
      })._heartbeat = heartbeat;
    },
    cancel() {
      if (clientId !== null) removeSseClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
