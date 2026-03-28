import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import { CopyButton, HexOrEmpty, Section, Shell, shortenHash } from "./components";
import { useLatestAsyncEffect } from "./hooks/useLatestAsyncEffect";
import { usePolling } from "./hooks/usePolling";
import {
  classifyError,
  ErrorCode,
  isAddressLike,
  isCopyableHexValue,
  isHashLike,
  normalizeFieldValue,
  objectEntries,
  toDate,
  toRelativeTime,
} from "./utils/explorer";
import {
  AccountOverview,
  AddressBlocksResponse,
  BlockRangeResponse,
  BlockListResponse,
  CacheDebugResponse,
  ComputeTxResultView,
  ExplorerBlock,
  HotAddressResponse,
  MinerDetailResponse,
  MinerStatsResponse,
  NetworkHealth,
  NetworkStats,
  ObjectOutputView,
  OverviewResponse,
  EndpointProbe,
  RecentComputeItem,
  RecentComputeResponse,
  RecentTxResponse,
  SearchResponse,
} from "./types";

type StatHistoryPoint = {
  ts: number;
  block: number;
};

function KeyValueGrid({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="detail-grid">
      {Object.entries(data).map(([k, v]) => (
        <Fragment key={k}>
          <div className="k">
            {k}
          </div>
          <div className="v">
            {normalizeFieldValue(v)}
            {typeof v === "string" && isCopyableHexValue(v) ? <CopyButton text={v} /> : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function HeroSearch({ smartRedirect = false }: { smartRedirect?: boolean }) {
  const [text, setText] = useState("");
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;

    if (smartRedirect) {
      if (isAddressLike(q)) {
        nav(`/accounts/${encodeURIComponent(q)}`);
        return;
      }
      if (/^\d+$/.test(q)) {
        nav(`/blocks/${encodeURIComponent(q)}`);
        return;
      }
      if (isHashLike(q)) {
        nav(`/tx/${encodeURIComponent(q)}`);
        return;
      }

      try {
        const result = await api.search(q);
        if (result.canonical_route) {
          nav(result.canonical_route);
          return;
        }
      } catch {
        // ignore and fallback below
      }
    }

    nav(`/search/${encodeURIComponent(q)}`);
  };

  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-left">
          <div className="hero-title">The ZeroChain Blockchain Explorer</div>
          <form className="hero-search" onSubmit={onSubmit}>
            <select defaultValue="all" aria-label="filter">
              <option value="all">All Filters</option>
            </select>
            <input
              placeholder="Search by Address / Operation Hash / Block / Object / Output / Domain"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit">🔍</button>
          </form>
        </div>
        <div className="hero-ad">
          <div className="hero-ad-label">Ad</div>
          <div className="hero-ad-body">
            <div className="hero-ad-title">Earn up to 8% on ZRC-20 tokens</div>
            <div className="hero-ad-sub">Eligibility and terms apply.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMetrics({ stats }: { stats: NetworkStats | null }) {
  const [history, setHistory] = useState<StatHistoryPoint[]>([]);

  useEffect(() => {
    if (!stats?.latest_block_number) return;
    const point: StatHistoryPoint = {
      ts: Date.now(),
      block: stats.latest_block_number,
    };

    setHistory((prev) => {
      const next = [...prev, point];
      return next.slice(-14);
    });
  }, [stats?.latest_block_number]);

  const chartPath = useMemo(() => {
    if (history.length <= 1) return "";
    const values = history.map((x) => x.block);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const width = 240;
    const height = 56;
    return history
      .map((p, i) => {
        const x = (i / (history.length - 1)) * width;
        const y = height - ((p.block - min) / span) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [history]);

  return (
    <section className="hero-metrics">
      <div className="hero-metrics-grid">
        <div className="metric-card">
          <div className="metric-title">LATEST BLOCK</div>
          <div className="metric-value">{stats?.latest_block_number ?? "-"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">HASHRATE</div>
          <div className="metric-value">{stats?.hashrate ?? "-"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">GAS PRICE</div>
          <div className="metric-value">{stats?.gas_price ?? "-"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">BLOCK HISTORY IN RECENT CHECKS</div>
          <div className="mini-chart-wrap">
            {chartPath ? (
              <svg className="mini-chart" viewBox="0 0 240 56" preserveAspectRatio="none" aria-hidden="true">
                <path d={chartPath} />
              </svg>
            ) : (
              <div className="mini-chart-empty">collecting…</div>
            )}
          </div>
          <div className="mini-chart-axis">
            <span>{history.length > 0 ? toDate(Math.floor(history[0].ts / 1000)) : "-"}</span>
            <span>{history.length > 0 ? toDate(Math.floor(history[history.length - 1].ts / 1000)) : "-"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeBlockRows({ items }: { items: ExplorerBlock[] }) {
  return (
    <div className="list-rows">
      {items.map((b) => (
        <div className="list-row" key={b.hash}>
          <div className="row-icon">◻</div>
          <div className="row-main">
            <div className="row-top">
              <Link to={`/blocks/${b.number}`}>{b.number}</Link>
            </div>
            <div className="row-sub">{toRelativeTime(b.timestamp)}</div>
          </div>
          <div className="row-meta">
            <div className="row-top">
              Miner <Link to={`/accounts/${b.miner}`}>{shortenHash(b.miner, 10)}</Link>
            </div>
            <div className="row-sub">{b.tx_count} ops</div>
          </div>
          <div className="amount-pill">{b.difficulty}</div>
        </div>
      ))}
    </div>
  );
}

function HomeTxRows({ items }: { items: RecentComputeItem[] }) {
  return (
    <div className="list-rows">
      {items.map((x) => (
        <div className="list-row" key={x.tx_id}>
          <div className="row-icon">≣</div>
          <div className="row-main">
            <div className="row-top">
              <Link to={`/compute/${x.tx_id}`}>{shortenHash(x.tx_id, 12)}</Link>
            </div>
            <div className="row-sub">{toRelativeTime(x.seen_at_unix)}</div>
          </div>
          <div className="row-meta">
            <div className="row-top">
              <span className={x.success ? "ok" : "bad"}>{x.success ? "Success" : "Failed"}</span>
            </div>
            <div className="row-sub">via zero_getComputeTxResult</div>
          </div>
          <div className="amount-pill">tx</div>
        </div>
      ))}
    </div>
  );
}

function TopMinerRows({ miners }: { miners: MinerStatsResponse["items"] }) {
  return (
    <table className="table compact">
      <thead>
        <tr>
          <th>Miner</th>
          <th>Blocks</th>
          <th>Share</th>
          <th>Last Seen</th>
        </tr>
      </thead>
      <tbody>
        {miners.map((x) => (
          <tr key={x.address.toLowerCase()}>
            <td>
              <Link to={`/miners/${x.address}`}>{shortenHash(x.address, 12)}</Link>
            </td>
            <td>{x.blocks_mined}</td>
            <td>{(x.share_of_window * 100).toFixed(2)}%</td>
            <td>{toRelativeTime(x.last_seen_unix)}</td>
          </tr>
        ))}
        {!miners.length ? (
          <tr>
            <td colSpan={4} className="muted">
              No miner data yet.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function HomePage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [miners, setMiners] = useState<MinerStatsResponse | null>(null);
  const [blocks, setBlocks] = useState<BlockListResponse | null>(null);
  const [recentCompute, setRecentCompute] = useState<RecentComputeResponse | null>(null);
  const [hotAddresses, setHotAddresses] = useState<HotAddressResponse | null>(null);
  const [cacheDebug, setCacheDebug] = useState<CacheDebugResponse | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<ErrorCode>("unknown");
  const [txWindow, setTxWindow] = useState<"latest" | "all">("latest");
  const [blockWindow, setBlockWindow] = useState<"latest" | "all">("latest");
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  usePolling(async () => {
    try {
      const [s, o, m, b, c, h, d] = await Promise.all([
        api.networkStats(),
        api.overview(),
        api.miners(2000, 10),
        api.blocks(10, 1),
        api.recentCompute(10),
        api.hotAddresses(10),
        api.debugCache(),
      ]);
      if (!aliveRef.current) return;
      setStats(s);
      setOverview(o);
      setMiners(m);
      setBlocks(b);
      setRecentCompute(c);
      setHotAddresses(h);
      setCacheDebug(d);
      setError("");
    } catch (e) {
      if (!aliveRef.current) return;
      const classified = classifyError(e);
      setError(classified.message);
      setErrorCode(classified.code);
    }
  }, 5000);

  return (
    <>
      <HeroSearch smartRedirect />
      {error ? <div className="error">[{errorCode}] {error}</div> : null}

      <HeroMetrics stats={stats} />

      <Section title="Chain Overview">
        <div className="detail-grid">
          <div className="k">Chain ID</div>
          <div className="v">{overview?.chain_id ?? "-"}</div>
          <div className="k">Network ID</div>
          <div className="v">{overview?.network_id ?? "-"}</div>
          <div className="k">Latest Block</div>
          <div className="v">{overview?.latest_block_number ?? "-"}</div>
          <div className="k">Indexed Blocks</div>
          <div className="v">{overview?.indexed_blocks ?? "-"}</div>
          <div className="k">Unique Miners</div>
          <div className="v">{overview?.unique_miners ?? "-"}</div>
          <div className="k">Blocks (24h)</div>
          <div className="v">{overview?.block_24h ?? "-"}</div>
          <div className="k">Avg Block Interval</div>
          <div className="v">
            {overview ? `${overview.avg_block_interval_secs.toFixed(2)}s` : "-"}
          </div>
          <div className="k">Recent Compute Operations</div>
          <div className="v">{overview?.recent_compute_txs ?? "-"}</div>
        </div>
      </Section>

      <div className="home-twin">
        <article className="home-panel">
          <div className="home-panel-head">
            <h3>Latest Blocks</h3>
            <div className="head-tools">
              <div className="segment" role="tablist" aria-label="blocks window">
                <button
                  className={`segment-btn ${blockWindow === "latest" ? "active" : ""}`}
                  type="button"
                  onClick={() => setBlockWindow("latest")}
                >
                  Latest
                </button>
                <button
                  className={`segment-btn ${blockWindow === "all" ? "active" : ""}`}
                  type="button"
                  onClick={() => setBlockWindow("all")}
                >
                  All
                </button>
              </div>
              <button className="tiny-btn" type="button" disabled title="Current dashboard layout is fixed">
                Fixed Layout
              </button>
            </div>
          </div>
          <HomeBlockRows items={blockWindow === "latest" ? (blocks?.items ?? []).slice(0, 6) : (blocks?.items ?? [])} />
          <div className="row-end">
            <Link to="/blocks">VIEW ALL BLOCKS →</Link>
          </div>
        </article>

        <article className="home-panel">
          <div className="home-panel-head">
            <h3>Latest Compute Operations</h3>
            <div className="head-tools">
              <div className="segment" role="tablist" aria-label="transactions window">
                <button
                  className={`segment-btn ${txWindow === "latest" ? "active" : ""}`}
                  type="button"
                  onClick={() => setTxWindow("latest")}
                >
                  Latest
                </button>
                <button
                  className={`segment-btn ${txWindow === "all" ? "active" : ""}`}
                  type="button"
                  onClick={() => setTxWindow("all")}
                >
                  All
                </button>
              </div>
              <button className="tiny-btn" type="button" disabled title="Current dashboard layout is fixed">
                Fixed Layout
              </button>
            </div>
          </div>
          <HomeTxRows items={txWindow === "latest" ? (recentCompute?.items ?? []).slice(0, 6) : (recentCompute?.items ?? [])} />
          <div className="row-end">
            <Link to="/txs">VIEW ALL OPERATIONS →</Link>
          </div>
        </article>
      </div>

      <Section title="Hot Addresses">
        <table className="table compact">
          <thead>
            <tr>
              <th>Address</th>
              <th>Hits</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {hotAddresses?.items.map((x) => (
              <tr key={x.address.toLowerCase()}>
                <td>
                  <Link to={`/accounts/${x.address}`}>{shortenHash(x.address, 12)}</Link>
                </td>
                <td>{x.hits}</td>
                <td>{toRelativeTime(x.last_seen_unix)}</td>
              </tr>
            ))}
            {!hotAddresses?.items.length ? (
              <tr>
                <td colSpan={3} className="muted">
                  No hot addresses yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      <Section title="Top Miners">
        <TopMinerRows miners={miners?.items ?? []} />
        <div className="row-end">
          <Link to="/miners">VIEW ALL MINERS →</Link>
        </div>
      </Section>

      <Section title="Backend Cache">
        <div className="detail-grid">
          <div className="k">TTL</div>
          <div className="v">{cacheDebug?.ttl_secs ?? "-"}s</div>
          <div className="k">Network Stats</div>
          <div className="v">{cacheDebug ? `${cacheDebug.network_stats.fresh}/${cacheDebug.network_stats.entries} fresh` : "-"}</div>
          <div className="k">Block Pages</div>
          <div className="v">{cacheDebug ? `${cacheDebug.block_pages.fresh}/${cacheDebug.block_pages.entries} fresh` : "-"}</div>
          <div className="k">Block Ranges</div>
          <div className="v">{cacheDebug ? `${cacheDebug.block_ranges.fresh}/${cacheDebug.block_ranges.entries} fresh` : "-"}</div>
          <div className="k">Domains</div>
          <div className="v">{cacheDebug ? `${cacheDebug.domains.fresh}/${cacheDebug.domains.entries} fresh` : "-"}</div>
        </div>
      </Section>
    </>
  );
}

function BlocksPage() {
  const [blocks, setBlocks] = useState<BlockListResponse | null>(null);
  const [rangeBlocks, setRangeBlocks] = useState<BlockRangeResponse | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("0");
  const [rangeTo, setRangeTo] = useState("0");

  useLatestAsyncEffect(
    () => api.blocks(20, page),
    [page, rangeMode],
    {
      enabled: !rangeMode,
      reset: () => {
        setBlocks(null);
        setError("");
      },
      onSuccess: setBlocks,
      onError: (e) => setError((e as Error).message),
    },
  );

  const applyRange = async () => {
    const from = Number(rangeFrom);
    const to = Number(rangeTo);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      setError("range must be numbers");
      return;
    }
    try {
      const data = await api.blocksRange(from, to, 500);
      setRangeBlocks(data);
      setError("");
    } catch (e) {
      const classified = classifyError(e);
      setError(`[${classified.code}] ${classified.message}`);
    }
  };

  return (
    <>
      <SearchBar smartRedirect />
      {error ? <div className="error">{error}</div> : null}
      <Section title="Blocks">
        <div className="range-bar">
          <label>
            <input
              type="checkbox"
              checked={rangeMode}
              onChange={(e) => setRangeMode(e.target.checked)}
            />{" "}
            Range mode
          </label>
          {rangeMode ? (
            <>
              <input value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="from" />
              <input value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} placeholder="to" />
              <button onClick={applyRange}>Load</button>
            </>
          ) : null}
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Height</th>
              <th>Hash</th>
              <th>Parent</th>
              <th>Difficulty</th>
              <th>Extra Data</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {(rangeMode ? rangeBlocks?.items : blocks?.items)?.map((b) => (
              <tr key={b.hash}>
                <td>
                  <Link to={`/blocks/${b.number}`}>{b.number}</Link>
                </td>
                <td title={b.hash}>{shortenHash(b.hash, 12)} <CopyButton text={b.hash} /></td>
                <td title={b.parent_hash}>{shortenHash(b.parent_hash, 12)} <CopyButton text={b.parent_hash} /></td>
                <td>{b.difficulty}</td>
                <td title={b.extra_data}>{shortenHash(b.extra_data ?? "-", 8)}</td>
                <td>{toRelativeTime(b.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!rangeMode ? <div className="pager">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </button>
          <span>Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!blocks?.has_more || (blocks?.items.length ?? 0) === 0}
          >
            Next
          </button>
        </div> : null}
      </Section>
    </>
  );
}

function BlockDetailPage() {
  const { number } = useParams();
  const [payload, setPayload] = useState<{ source: string; block: unknown } | null>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => api.blockByNumber(number!),
    [number],
    {
      enabled: Boolean(number),
      reset: () => {
        setPayload(null);
        setError("");
      },
      onSuccess: setPayload,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  const blockObj = (payload?.block ?? null) as Record<string, unknown> | null;

  return (
    <>
      <SearchBar smartRedirect />
      <Section title={`Block #${number}`}>
        {error ? <div className="error">{error}</div> : null}
        {!error && blockObj ? (
          <>
            <KeyValueGrid
              data={{
                source: payload?.source,
                number: blockObj.number,
                hash: blockObj.hash,
                parentHash: blockObj.parentHash ?? blockObj.parent_hash,
                miner: blockObj.miner ?? blockObj.coinbase,
                timestamp: blockObj.timestamp,
                difficulty: blockObj.difficulty,
                nonce: blockObj.nonce,
              }}
            />
            <div className="json-box mt12">
              <pre>{JSON.stringify(payload?.block ?? {}, null, 2)}</pre>
            </div>
          </>
        ) : null}
      </Section>
    </>
  );
}

function AccountPage() {
  const { address } = useParams();
  const [data, setData] = useState<AccountOverview | null>(null);
  const [minedBlocks, setMinedBlocks] = useState<AddressBlocksResponse | null>(null);
  const [txs, setTxs] = useState<RecentTxResponse | null>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => Promise.all([api.account(address!), api.accountBlocks(address!, 20, 1), api.accountTxs(address!, 20, 1)]),
    [address],
    {
      enabled: Boolean(address),
      reset: () => {
        setData(null);
        setMinedBlocks(null);
        setTxs(null);
        setError("");
      },
      onSuccess: ([overview, blocks, txList]) => {
        setData(overview);
        setMinedBlocks(blocks);
        setTxs(txList);
      },
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Address Overview (zero_getAccount)">
        {error ? <div className="error">{error}</div> : null}
        {data ? (
          <KeyValueGrid
            data={{
              address: data.address,
              balance: data.balance_hex,
              nonce: data.nonce_hex,
              txCount: data.tx_count_hex,
            }}
          />
        ) : null}
      </Section>

      <Section title="UTXOs (zero_getUtxos)">
        <div className="json-box">
          <pre>{JSON.stringify(data?.utxos ?? [], null, 2)}</pre>
        </div>
      </Section>

      <Section title="Mined Blocks (recent window)">
        <table className="table compact">
          <thead>
            <tr>
              <th>Block</th>
              <th>Hash</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {(minedBlocks?.items ?? []).map((b) => (
              <tr key={b.hash}>
                <td><Link to={`/blocks/${b.number}`}>{b.number}</Link></td>
                <td title={b.hash}>{shortenHash(b.hash, 12)} <CopyButton text={b.hash} /></td>
                <td>{toRelativeTime(b.timestamp)}</td>
              </tr>
            ))}
            {!(minedBlocks?.items.length ?? 0) ? (
              <tr>
                <td colSpan={3} className="muted">No mined blocks found in current window.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      <Section title="Operations (recent)">
        <table className="table compact">
          <thead>
            <tr>
              <th>Operation</th>
              <th>Kind</th>
              <th>From</th>
              <th>To</th>
              <th>Value</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {(txs?.items ?? []).map((x, idx) => (
              <tr key={x.tx_hash ?? x.tx_id ?? x.hash ?? `acct-tx-${idx}`}>
                <td>
                  <Link to={`/tx/${x.tx_hash ?? x.tx_id ?? x.hash ?? ""}`}>
                    {shortenHash(x.tx_hash ?? x.tx_id ?? x.hash ?? "-", 12)}
                  </Link>
                </td>
                <td>{x.kind ?? "-"}</td>
                <td>{x.from ? <Link to={`/accounts/${x.from}`}>{shortenHash(x.from, 10)}</Link> : "-"}</td>
                <td>{x.to ? <Link to={`/accounts/${x.to}`}>{shortenHash(x.to, 10)}</Link> : "-"}</td>
                <td>{x.value ?? "-"}</td>
                <td>{toRelativeTime(x.timestamp ?? x.result?.submitted_at_unix)}</td>
              </tr>
            ))}
            {!(txs?.items.length ?? 0) ? (
              <tr>
                <td colSpan={6} className="muted">No operations found for this address.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function ComputeTxPage() {
  const { txId } = useParams();
  const [data, setData] = useState<ComputeTxResultView | null>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => api.computeResult(txId!),
    [txId],
    {
      enabled: Boolean(txId),
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  const resultObj = (data?.result ?? null) as Record<string, unknown> | null;

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Compute Operation Result (zero_getComputeTxResult)">
        {error ? <div className="error">{error}</div> : null}
        {data ? (
          <>
            <KeyValueGrid
              data={{
                txId: data.tx_id,
                ok: resultObj?.ok,
                duplicate: resultObj?.duplicate,
                consumed_inputs: resultObj?.consumed_inputs,
                read_objects: resultObj?.read_objects,
                created_outputs: resultObj?.created_outputs,
              }}
            />
            <div className="json-box mt12">
              <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
          </>
        ) : null}
      </Section>
    </>
  );
}

function TxAliasPage() {
  const { txId } = useParams();
  const [data, setData] = useState<ComputeTxResultView | null>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => api.txDetail(txId!),
    [txId],
    {
      enabled: Boolean(txId),
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  return (
    <>
      <SearchBar smartRedirect />
      <Section title={`Operation ${txId}`}>
        <div className="muted">operation route currently resolves via backend /api/tx for forward compatibility.</div>
        {error ? <div className="error">{error}</div> : null}
        {data ? (
          <div className="json-box mt12">
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </div>
        ) : null}
      </Section>
    </>
  );
}

function ObjectPage() {
  const { objectId } = useParams();
  const [data, setData] = useState<ObjectOutputView | null>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => api.object(objectId!),
    [objectId],
    {
      enabled: Boolean(objectId),
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  const valueObj = objectEntries(data?.value);

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Object (zero_getObject)">
        {error ? <div className="error">{error}</div> : null}
        {data ? (
          <>
            <KeyValueGrid data={{ id: data.id, kind: data.kind }} />
            {valueObj.length ? (
              <div className="detail-grid mt12">
                {valueObj.map(([k, v]) => (
                  <Fragment key={k}>
                    <div className="k">
                      {k}
                    </div>
                    <div className="v">
                      {normalizeFieldValue(v)}
                    </div>
                  </Fragment>
                ))}
              </div>
            ) : null}
            <div className="json-box mt12">
              <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
          </>
        ) : null}
      </Section>
    </>
  );
}

function OutputPage() {
  const { outputId } = useParams();
  const [data, setData] = useState<ObjectOutputView | null>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => api.output(outputId!),
    [outputId],
    {
      enabled: Boolean(outputId),
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  const valueObj = objectEntries(data?.value);

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Output (zero_getOutput)">
        {error ? <div className="error">{error}</div> : null}
        {data ? (
          <>
            <KeyValueGrid data={{ id: data.id, kind: data.kind }} />
            {valueObj.length ? (
              <div className="detail-grid mt12">
                {valueObj.map(([k, v]) => (
                  <Fragment key={k}>
                    <div className="k">
                      {k}
                    </div>
                    <div className="v">
                      {normalizeFieldValue(v)}
                    </div>
                  </Fragment>
                ))}
              </div>
            ) : null}
            <div className="json-box mt12">
              <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
          </>
        ) : null}
      </Section>
    </>
  );
}

function DomainPage() {
  const { domainId } = useParams();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => api.domain(domainId!),
    [domainId],
    {
      enabled: Boolean(domainId),
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  const obj = (data ?? null) as Record<string, unknown> | null;

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Domain (zero_getDomain)">
        {error ? <div className="error">{error}</div> : null}
        {obj ? (
          <>
            <KeyValueGrid data={obj} />
            <div className="json-box mt12">
              <pre>{JSON.stringify(data, null, 2)}</pre>
            </div>
          </>
        ) : null}
      </Section>
    </>
  );
}

function TxsPage() {
  const [data, setData] = useState<RecentTxResponse | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useLatestAsyncEffect(
    () => api.recentTxs(20, page),
    [page],
    {
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Recent Operations">
        {error ? <div className="error">{error}</div> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Tx</th>
              <th>Kind</th>
              <th>From</th>
              <th>To</th>
              <th>Value</th>
              <th>OK</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((x, idx) => (
              <tr key={x.tx_hash ?? x.tx_id ?? x.hash ?? `tx-${idx}`}>
                <td>
                  <Link to={`/tx/${x.tx_hash ?? x.tx_id ?? x.hash ?? ""}`}>
                    {shortenHash(x.tx_hash ?? x.tx_id ?? x.hash ?? "-", 12)}
                  </Link>
                </td>
                <td>{x.kind ?? "-"}</td>
                <td>{x.from ? <Link to={`/accounts/${x.from}`}>{shortenHash(x.from, 10)}</Link> : "-"}</td>
                <td>{x.to ? <Link to={`/accounts/${x.to}`}>{shortenHash(x.to, 10)}</Link> : "-"}</td>
                <td>{x.value ?? "-"}</td>
                <td>{x.result?.ok === undefined ? "-" : String(Boolean(x.result.ok))}</td>
                <td>{toRelativeTime(x.timestamp ?? x.result?.submitted_at_unix)}</td>
              </tr>
            ))}
            {!(data?.items.length ?? 0) ? (
              <tr>
                <td colSpan={7} className="muted">No operations yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="pager">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </button>
          <span>Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={!data?.has_more}>
            Next
          </button>
        </div>
      </Section>
    </>
  );
}

function MinersPage() {
  const [data, setData] = useState<MinerStatsResponse | null>(null);
  const [error, setError] = useState("");
  const [lookback, setLookback] = useState("2000");

  useLatestAsyncEffect(
    () => {
      const parsed = Number(lookback);
      const value = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2000;
      return api.miners(value, 200);
    },
    [lookback],
    {
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Miner Leaderboard">
        <div className="row-end" style={{ justifyContent: "flex-start", gap: 8 }}>
          <label htmlFor="lookback">Lookback blocks</label>
          <input
            id="lookback"
            value={lookback}
            onChange={(e) => setLookback(e.target.value)}
            style={{ width: 120 }}
          />
          <span className="muted">latest={data?.latest_block ?? "-"}</span>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <TopMinerRows miners={data?.items ?? []} />
      </Section>
    </>
  );
}

const TELEMETRY_PROBE_PATHS = [
  "/health",
  "/api/network/health",
  "/api/network/stats",
  "/api/debug/cache",
  "/api/overview",
];

function TelemetryPage() {
  const [networkHealth, setNetworkHealth] = useState<NetworkHealth | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [cacheDebug, setCacheDebug] = useState<CacheDebugResponse | null>(null);
  const [probes, setProbes] = useState<EndpointProbe[]>([]);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<ErrorCode>("unknown");
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  usePolling(async () => {
    try {
      const [health, stats, cache, nextProbes] = await Promise.all([
        api.networkHealth(),
        api.networkStats(),
        api.debugCache(),
        Promise.all(TELEMETRY_PROBE_PATHS.map((path) => api.endpointProbe(path))),
      ]);
      if (!aliveRef.current) return;
      setNetworkHealth(health);
      setNetworkStats(stats);
      setCacheDebug(cache);
      setProbes(nextProbes);
      setError("");
    } catch (e) {
      if (!aliveRef.current) return;
      const classified = classifyError(e);
      setError(classified.message);
      setErrorCode(classified.code);
    }
  }, 5000);

  const telemetryRoot = import.meta.env.VITE_OTEL_ENDPOINT || import.meta.env.VITE_OTLP_ENDPOINT || "http://127.0.0.1:4317";

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="OpenTelemetry Control Plane">
        {error ? <div className="error">[{errorCode}] {error}</div> : null}
        <div className="detail-grid">
          <div className="k">Explorer Backend Health</div>
          <div className="v">{networkHealth ? `${networkHealth.rpc_ok ? "RPC OK" : "RPC DOWN"} | latency=${networkHealth.rpc_latency_ms}ms` : "-"}</div>
          <div className="k">Network</div>
          <div className="v">{networkStats ? `chain_id=${networkStats.chain_id} network_id=${networkStats.network_id} latest_block=${networkStats.latest_block_number}` : "-"}</div>
          <div className="k">Cache TTL</div>
          <div className="v">{cacheDebug ? `${cacheDebug.ttl_secs}s` : "-"}</div>
          <div className="k">OTLP Endpoint (target)</div>
          <div className="v">{String(telemetryRoot)}</div>
          <div className="k">Read API Base</div>
          <div className="v">{import.meta.env.VITE_API_BASE || "(same-origin /api)"}</div>
        </div>
      </Section>

      <Section title="Live Endpoint Probes">
        <table className="table compact">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Status</th>
              <th>HTTP</th>
              <th>Latency</th>
              <th>Checked</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {probes.map((probe) => (
              <tr key={probe.path}>
                <td><code>{probe.path}</code></td>
                <td><span className={probe.ok ? "ok" : "bad"}>{probe.ok ? "OK" : "DOWN"}</span></td>
                <td>{probe.status ?? "-"}</td>
                <td>{probe.latency_ms} ms</td>
                <td>{toDate(probe.checked_at_unix)}</td>
                <td title={probe.detail} className="muted">{probe.detail || "-"}</td>
              </tr>
            ))}
            {!probes.length ? (
              <tr>
                <td colSpan={6} className="muted">No probe data yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      <Section title="ZeroChain / Explorer / Node OTel Wiring">
        <div className="telemetry-grid">
          <article className="telemetry-card">
            <h3>ZeroChain Node</h3>
            <p>Enable exporter when running node process:</p>
            <div className="json-box"><pre>{`zerochain --otel-enabled --otel-endpoint http://127.0.0.1:4317 run --network mainnet`}</pre></div>
            <p className="muted">This enables tracing export from CLI runtime and node services.</p>
          </article>
          <article className="telemetry-card">
            <h3>Explorer Backend</h3>
            <p>Current backend exposes health + debug APIs used by this page:</p>
            <div className="json-box"><pre>{`/health
/api/network/health
/api/network/stats
/api/debug/cache`}</pre></div>
            <p className="muted">No fake metric stream here; cards above only show real probe and API state.</p>
          </article>
          <article className="telemetry-card">
            <h3>Collector / UI</h3>
            <p>Recommended local endpoint and common UI ports:</p>
            <div className="json-box"><pre>{`OTLP gRPC: http://127.0.0.1:4317
OTLP HTTP: http://127.0.0.1:4318
Jaeger UI:  http://127.0.0.1:16686
Grafana:    http://127.0.0.1:3000`}</pre></div>
            <p className="muted">Set Vite env for docs display: <code>VITE_OTEL_ENDPOINT</code> / <code>VITE_OTLP_ENDPOINT</code>.</p>
          </article>
        </div>
      </Section>

      <Section title="Verification Playbook">
        <ol className="telemetry-steps">
          <li>Start collector (OTLP on <code>4317/4318</code>), then start <code>zerochain</code> with <code>--otel-enabled</code>.</li>
          <li>Load explorer and open this page. Confirm probe rows stay green for backend endpoints.</li>
          <li>Execute one real action: submit compute tx or mine a block, then check trace backend for new spans.</li>
          <li>Use <code>/api/debug/cache</code> freshness counters to verify backend poll loop is active.</li>
        </ol>
      </Section>
    </>
  );
}

function MinerDetailPage() {
  const { address } = useParams();
  const [data, setData] = useState<MinerDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useLatestAsyncEffect(
    () => api.minerDetail(address!, 20, page),
    [address, page],
    {
      enabled: Boolean(address),
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  return (
    <>
      <SearchBar smartRedirect />
      <Section title={`Miner ${address}`}>
        {error ? <div className="error">{error}</div> : null}
        {data ? (
          <>
            <KeyValueGrid
              data={{
                address: data.miner.address,
                blocks_mined: data.miner.blocks_mined,
                first_block: data.miner.first_block,
                last_block: data.miner.last_block,
                last_seen: toDate(data.miner.last_seen_unix),
                share_of_window: `${(data.miner.share_of_window * 100).toFixed(2)}%`,
              }}
            />
            <table className="table mt12">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Hash</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {data.blocks.map((b) => (
                  <tr key={b.hash}>
                    <td><Link to={`/blocks/${b.number}`}>{b.number}</Link></td>
                    <td title={b.hash}>{shortenHash(b.hash, 12)} <CopyButton text={b.hash} /></td>
                    <td>{toDate(b.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </button>
              <span>Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * (data.limit ?? 20) >= data.total_blocks}
              >
                Next
              </button>
            </div>
          </>
        ) : null}
      </Section>
    </>
  );
}

function SearchResultPage() {
  const { query } = useParams();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");

  useLatestAsyncEffect(
    () => api.search(query!),
    [query],
    {
      enabled: Boolean(query),
      reset: () => {
        setData(null);
        setError("");
      },
      onSuccess: setData,
      onError: (e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      },
    },
  );

  const pretty = useMemo(() => JSON.stringify(data, null, 2), [data]);

  return (
    <>
      <SearchBar defaultValue={query} smartRedirect />
      <Section title={`Search: ${query}`}>
        {error ? <div className="error">{error}</div> : null}
        {!error ? (
          <>
            <div className="search-links">
              {data?.canonical_route ? (
                <Link to={data.canonical_route}>Open canonical route</Link>
              ) : null}
              <Link to={`/compute/${encodeURIComponent(query ?? "")}`}>Open as Compute Operation</Link>
              <Link to={`/objects/${encodeURIComponent(query ?? "")}`}>Open as Object</Link>
              <Link to={`/outputs/${encodeURIComponent(query ?? "")}`}>Open as Output</Link>
              <Link to={`/domains/${encodeURIComponent(query ?? "")}`}>Open as Domain</Link>
            </div>
            <div className="json-box">
              <pre>{pretty}</pre>
            </div>
          </>
        ) : null}
      </Section>
    </>
  );
}

function SearchBar({ defaultValue, smartRedirect = false }: { defaultValue?: string; smartRedirect?: boolean }) {
  const [text, setText] = useState(defaultValue ?? "");
  const nav = useNavigate();

  useEffect(() => {
    if (defaultValue !== undefined) {
      setText(defaultValue);
    }
  }, [defaultValue]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;

    if (smartRedirect) {
      // local-first routing for instant UX
      if (isAddressLike(q)) {
        nav(`/accounts/${encodeURIComponent(q)}`);
        return;
      }
      if (/^\d+$/.test(q)) {
        nav(`/blocks/${encodeURIComponent(q)}`);
        return;
      }
      if (isHashLike(q)) {
        // tx alias for hash-like query; detail page can still navigate onward
        nav(`/tx/${encodeURIComponent(q)}`);
        return;
      }

      // remote confirm fallback for non-obvious patterns
      try {
        const result = await api.search(q);
        if (result.canonical_route) {
          nav(result.canonical_route);
          return;
        }
      } catch {
        // fallback to search route
      }
    }

    nav(`/search/${encodeURIComponent(q)}`);
  };

  return (
    <>
      <form className="search" onSubmit={onSubmit}>
        <input
          placeholder="Search by block height / address / compute tx / object id / output id / domain id"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>
      <div className="quick-nav">
        <Link to="/blocks">Blocks</Link>
        <Link to="/txs">Operations</Link>
        <Link to="/miners">Miners</Link>
        <Link to="/telemetry">Telemetry</Link>
        <Link to="/domains/0">Domain #0</Link>
      </div>
    </>
  );
}

export function App() {
  const [health, setHealth] = useState<NetworkHealth | null>(null);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  usePolling(async () => {
    try {
      const [h, s] = await Promise.all([api.networkHealth(), api.networkStats()]);
      if (!aliveRef.current) return;
      setHealth(h);
      setStats(s);
    } catch {
      if (!aliveRef.current) return;
      setHealth({
        backend_ok: true,
        rpc_ok: false,
        rpc_latency_ms: 0,
        checked_at_unix: 0,
        detail: "health check failed",
      });
      setStats(null);
    }
  }, 5000);

  const lampDetail = health
    ? `rpc_ok=${health.rpc_ok}; latency=${health.rpc_latency_ms}ms; checked=${toDate(health.checked_at_unix)}; detail=${health.detail}`
    : "network status unknown";

  return (
    <Shell
      lamp={health ? { rpc_ok: health.rpc_ok, detail: lampDetail } : undefined}
      stats={stats}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/blocks" element={<BlocksPage />} />
        <Route path="/blocks/:number" element={<BlockDetailPage />} />
        <Route path="/accounts/:address" element={<AccountPage />} />
        <Route path="/txs" element={<TxsPage />} />
        <Route path="/miners" element={<MinersPage />} />
        <Route path="/miners/:address" element={<MinerDetailPage />} />
        <Route path="/telemetry" element={<TelemetryPage />} />
        <Route path="/tx/:txId" element={<TxAliasPage />} />
        <Route path="/compute/:txId" element={<ComputeTxPage />} />
        <Route path="/objects/:objectId" element={<ObjectPage />} />
        <Route path="/outputs/:outputId" element={<OutputPage />} />
        <Route path="/domains/:domainId" element={<DomainPage />} />
        <Route path="/search/:query" element={<SearchResultPage />} />
      </Routes>
    </Shell>
  );
}
