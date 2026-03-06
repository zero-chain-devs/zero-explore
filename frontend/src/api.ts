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

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as { code?: string; message?: string };
      throw new ApiClientError(
        parsed.message ?? `Request failed: ${res.status}`,
        res.status,
        parsed.code ?? "unknown",
      );
    } catch {
      throw new ApiClientError(`Request failed: ${res.status} ${raw}`, res.status, "unknown");
    }
  }
  return (await res.json()) as T;
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
