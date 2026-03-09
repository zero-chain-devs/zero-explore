import { DependencyList, useEffect } from "react";

type LatestAsyncEffectOptions<T> = {
  enabled?: boolean;
  reset?: () => void;
  onSuccess: (value: T) => void;
  onError?: (error: unknown) => void;
};

export function useLatestAsyncEffect<T>(
  request: () => Promise<T>,
  deps: DependencyList,
  { enabled = true, reset, onSuccess, onError }: LatestAsyncEffectOptions<T>,
): void {
  useEffect(() => {
    if (!enabled) {
      reset?.();
      return;
    }

    let cancelled = false;
    reset?.();

    void request()
      .then((value) => {
        if (cancelled) return;
        onSuccess(value);
      })
      .catch((error) => {
        if (cancelled) return;
        onError?.(error);
      });

    return () => {
      cancelled = true;
    };
  }, deps);
}
