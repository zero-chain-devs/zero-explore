import { useEffect, useRef } from "react";

export function usePolling(task: () => Promise<void> | void, intervalMs: number): void {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;

    const run = async () => {
      try {
        await taskRef.current();
      } finally {
        if (!stopped) {
          timer = window.setTimeout(run, intervalMs);
        }
      }
    };

    void run();

    return () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [intervalMs]);
}
