type TickHandler = () => void;

const handlers = new Map<number, TickHandler>();
let nextId = 1;
let worker: Worker | null = null;

const getWorker = () => {
  if (worker) return worker;

  const script = `
    const timers = new Map();
    self.onmessage = (event) => {
      const { type, id, intervalMs } = event.data;
      if (type === 'start') {
        if (timers.has(id)) clearInterval(timers.get(id));
        timers.set(id, setInterval(() => {
          self.postMessage({ type: 'tick', id });
        }, intervalMs));
      }
      if (type === 'stop') {
        if (timers.has(id)) {
          clearInterval(timers.get(id));
          timers.delete(id);
        }
      }
    };
  `;

  worker = new Worker(URL.createObjectURL(new Blob([script], { type: 'application/javascript' })));
  worker.onmessage = (event) => {
    const { type, id } = event.data;
    if (type === 'tick') handlers.get(id)?.();
  };

  return worker;
};

export const subscribeRealtimeClock = (intervalMs: number, handler: TickHandler) => {
  const id = nextId++;
  handlers.set(id, handler);
  getWorker().postMessage({ type: 'start', id, intervalMs });

  return () => {
    handlers.delete(id);
    worker?.postMessage({ type: 'stop', id });
  };
};
