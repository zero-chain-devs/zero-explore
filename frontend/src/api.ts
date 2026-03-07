import {
  AccountOverview,
  BlockRangeResponse,
  BlockListResponse,
  CacheDebugResponse,
  ComputeTxResultView,
  HotAddressResponse,
  NetworkHealth,
  NetworkStats,
  ObjectOutputView,
  RecentComputeResponse,
  SearchResponse,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 8000);
const MAX_RETRIES = Number(import.meta.env.VITE_API_RETRIES ?? 2);

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function withBase(url: string): string {
  if (!API_BASE) return url;
  return `${API_BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const requestUrl = withBase(url);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetchWithTimeout(requestUrl);
      if (!res.ok) {
        const raw = await res.text();
        let parsed: { code?: string; message?: string } | null = null;
        try {
          parsed = JSON.parse(raw) as { code?: string; message?: string };
        } catch {
          parsed = null;
        }
        throw new ApiClientError(
          parsed?.message ?? `Request failed: ${res.status} ${raw || res.statusText}`,
          res.status,
          parsed?.code ?? "unknown",
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const isRetryableApiError =
        err instanceof ApiClientError && (err.status >= 500 || err.code === "rpc_error");
      const canRetry = attempt < MAX_RETRIES;
      if (!canRetry) break;
      if (isAbort || err instanceof TypeError || isRetryableApiError) {
        const backoffMs = 250 * (attempt + 1);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      break;
    }
  }

  if (lastErr instanceof ApiClientError) {
    throw lastErr;
  }
  if (lastErr instanceof DOMException && lastErr.name === "AbortError") {
    throw new ApiClientError("Request timeout", 504, "rpc_error");
  }
  throw new ApiClientError(
    `Network error: ${(lastErr as Error | undefined)?.message ?? "unknown"}`,
    502,
    "rpc_error",
  );
}

export const api = {
  health: () => getJson<{ ok: boolean; service: string }>("/health"),
  networkHealth: () => getJson<NetworkHealth>("/api/network/health"),
  networkStats: () => getJson<NetworkStats>("/api/network/stats"),
  blocks: (limit = 20, page = 1) =>
    getJson<BlockListResponse>(`/api/blocks?limit=${limit}&page=${page}`),
  blocksRange: (from: number, to: number, limit = 50) =>
    getJson<BlockRangeResponse>(`/api/blocks/range?from=${from}&to=${to}&limit=${limit}`),
  blockByNumber: (number: string) =>
    getJson<{ source: string; block: unknown }>(`/api/blocks/${encodeURIComponent(number)}`),
  account: (address: string) =>
    getJson<AccountOverview>(`/api/accounts/${encodeURIComponent(address)}`),
  computeResult: (txId: string) =>
    getJson<ComputeTxResultView>(`/api/compute/${encodeURIComponent(txId)}`),
  txDetail: (txId: string) =>
    getJson<ComputeTxResultView>(`/api/tx/${encodeURIComponent(txId)}`),
  recentCompute: (limit = 10) =>
    getJson<RecentComputeResponse>(`/api/compute/recent?limit=${limit}`),
  hotAddresses: (limit = 10) =>
    getJson<HotAddressResponse>(`/api/activity/hot-addresses?limit=${limit}`),
  object: (objectId: string) =>
    getJson<ObjectOutputView>(`/api/objects/${encodeURIComponent(objectId)}`),
  output: (outputId: string) =>
    getJson<ObjectOutputView>(`/api/outputs/${encodeURIComponent(outputId)}`),
  domain: (domainId: string) =>
    getJson<unknown>(`/api/domains/${encodeURIComponent(domainId)}`),
  search: (query: string) =>
    getJson<SearchResponse>(`/api/search/${encodeURIComponent(query)}`),
  debugCache: () => getJson<CacheDebugResponse>("/api/debug/cache"),
};
