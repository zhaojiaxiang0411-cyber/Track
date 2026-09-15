// 浏览器端共享的 /api/events 连接：每个标签页只开一条，由订阅方引用计数。
//
// 为什么不让每个 hook 各开一条 EventSource：HTTP/1.1 下同一域名的并发连接上限是 6 条，
// SSE 是常驻连接，一个标签页开两条的话，开三四个标签页就把额度吃光，之后页面所有
// 普通 fetch 都会排队卡住。这里做成单例复用，标签页数量再多也只占一条。

type SseHandler = (data: unknown) => void;

let source: EventSource | null = null;
let refCount = 0;
const handlers = new Map<string, Set<SseHandler>>();
// 已在当前 source 实例上挂过原生监听的事件名。source 关闭重开后原生监听随之失效，
// 所以它跟着 source 的生命周期重置。
const attached = new Set<string>();

function attachNativeListener(event: string): void {
  if (!source || attached.has(event)) return;
  attached.add(event);
  source.addEventListener(event, (raw) => {
    let data: unknown = null;
    try {
      data = JSON.parse((raw as MessageEvent).data);
    } catch {
      /* 忽略非法载荷，事件本身仍然要通知订阅方 */
    }
    for (const handler of handlers.get(event) ?? []) handler(data);
  });
}

/** 订阅某个 SSE 事件，返回退订函数。最后一个订阅者退订时关闭连接。 */
export function subscribeSse(event: string, handler: SseHandler): () => void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(handler);
  refCount += 1;

  if (!source) {
    source = new EventSource("/api/events");
    attached.clear();
    // 重连时要把此前所有事件名的原生监听重新挂上，否则旧订阅收不到消息
    for (const name of handlers.keys()) attachNativeListener(name);
  } else {
    attachNativeListener(event);
  }

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    set.delete(handler);
    refCount -= 1;
    if (refCount <= 0) {
      refCount = 0;
      source?.close();
      source = null;
      attached.clear();
    }
  };
}
