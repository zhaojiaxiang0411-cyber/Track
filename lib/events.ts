type SseClient = {
  id: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const clients = new Map<number, SseClient>();
let clientId = 0;

function encodeEvent(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export function addSseClient(
  controller: ReadableStreamDefaultController<Uint8Array>
): number {
  const id = ++clientId;
  clients.set(id, { id, controller });
  return id;
}

export function removeSseClient(id: number) {
  clients.delete(id);
}

export function broadcast(event: string, data: unknown) {
  const message = encodeEvent(event, data);
  for (const client of clients.values()) {
    try {
      client.controller.enqueue(message);
    } catch {
      clients.delete(client.id);
    }
  }
}

export function getClientCount() {
  return clients.size;
}
