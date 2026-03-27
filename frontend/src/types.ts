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

export type EndpointProbe = {
  path: string;
  ok: boolean;
  status: number | null;
  latency_ms: number;
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

export type MinerStatsItem = {
  address: string;
  blocks_mined: number;
  first_block: number;
  last_block: number;
  last_seen_unix: number;
  share_of_window: number;
};

export type MinerStatsResponse = {
  latest_block: number;
  lookback_blocks: number;
  unique_miners: number;
  items: MinerStatsItem[];
};

export type MinerDetailResponse = {
  miner: MinerStatsItem;
  page: number;
  limit: number;
  total_blocks: number;
  blocks: ExplorerBlock[];
};

export type AddressBlocksResponse = {
  address: string;
  page: number;
  limit: number;
  total_blocks: number;
  items: ExplorerBlock[];
};

export type OverviewResponse = {
  chain_id: string;
  network_id: string;
  latest_block_number: number;
  indexed_blocks: number;
  unique_miners: number;
  block_24h: number;
  avg_block_interval_secs: number;
  recent_compute_txs: number;
  top_miners: MinerStatsItem[];
};

export type RecentTxItem = {
  kind?: string;
  tx_id?: string;
  tx_hash?: string;
  hash?: string;
  timestamp?: number;
  from?: string;
  to?: string;
  value?: string;
  block_number?: number;
  status?: string;
  result?: {
    ok?: boolean;
    duplicate?: boolean;
    consumed_inputs?: number;
    read_objects?: number;
    created_outputs?: number;
    submitted_at_unix?: number;
  };
};

export type RecentTxResponse = {
  page: number;
  limit: number;
  total: number;
  has_more: boolean;
  items: RecentTxItem[];
};
