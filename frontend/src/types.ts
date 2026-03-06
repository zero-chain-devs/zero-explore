export type NetworkStats = {
  chain_id: string;
  network_id: string;
  latest_block_number: number;
  latest_block_hash: string | null;
  latest_block_timestamp: number | null;
  mining: boolean;
  hashrate: string;
  gas_price: string;
  coinbase: string;
};

export type NetworkHealth = {
  backend_ok: boolean;
  rpc_ok: boolean;
  rpc_latency_ms: number;
  checked_at_unix: number;
  detail: string;
};

export type ExplorerBlock = {
  number: number;
  number_hex: string;
  hash: string;
  parent_hash: string;
  timestamp: number;
  difficulty: string;
  nonce: number;
  miner: string;
  tx_count: number;
  extra_data?: string;
};

export type BlockListResponse = {
  latest_number: number;
  page: number;
  limit: number;
  has_more: boolean;
  items: ExplorerBlock[];
};

export type AccountOverview = {
  address: string;
  balance_hex: string;
  nonce_hex: string;
  tx_count_hex: string;
  utxos: unknown;
};

export type ComputeTxResultView = {
  tx_id: string;
  result: unknown;
};

export type SearchResponse = {
  kind: string;
  primary_id: string;
  canonical_route: string;
  value: unknown;
};

export type BlockRangeResponse = {
  from: number;
  to: number;
  items: ExplorerBlock[];
};

export type CacheDebugSection = {
  entries: number;
  fresh: number;
  stale: number;
};

export type CacheDebugResponse = {
  ttl_secs: number;
  network_stats: CacheDebugSection;
  block_pages: CacheDebugSection;
  block_ranges: CacheDebugSection;
  domains: CacheDebugSection;
};

export type ObjectOutputView = {
  id: string;
  kind: string;
  value: unknown;
};

export type RecentComputeItem = {
  tx_id: string;
  seen_at_unix: number;
  success: boolean;
};

export type RecentComputeResponse = {
  items: RecentComputeItem[];
};

export type HotAddressItem = {
  address: string;
  hits: number;
  last_seen_unix: number;
};

export type HotAddressResponse = {
  items: HotAddressItem[];
};
