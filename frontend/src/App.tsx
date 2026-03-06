import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { ApiClientError, api } from "./api";
import { CopyButton, HexOrEmpty, Section, Shell, shortenHash } from "./components";
import {
  AccountOverview,
  BlockRangeResponse,
  BlockListResponse,
  CacheDebugResponse,
  ComputeTxResultView,
  ExplorerBlock,
  HotAddressResponse,
  NetworkHealth,
  NetworkStats,
  ObjectOutputView,
  RecentComputeItem,
  RecentComputeResponse,
  SearchResponse,
} from "./types";

type ErrorCode = "rpc" | "not_found" | "bad_request" | "unknown";

function classifyError(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof ApiClientError) {
    if (err.code === "rpc_error") return { code: "rpc", message: err.message };
    if (err.code === "not_found") return { code: "not_found", message: err.message };
    if (err.code === "bad_request") return { code: "bad_request", message: err.message };
    return { code: "unknown", message: err.message };
  }
  return { code: "unknown", message: (err as Error).message };
}

function toDate(timestamp?: number | null): string {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
}

function toRelativeTime(timestamp?: number | null): string {
  if (!timestamp) return "-";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function isAddressLike(value: string): boolean {
  return value.startsWith("0x") && value.length === 42;
}

function isHashLike(value: string): boolean {
  return value.startsWith("0x") && value.length === 66;
}

function normalizeFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function objectEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}

function KeyValueGrid({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="detail-grid">
      {Object.entries(data).map(([k, v]) => (
        <>
          <div className="k" key={`k-${k}`}>
            {k}
          </div>
          <div className="v" key={`v-${k}`}>
            {normalizeFieldValue(v)}
            {typeof v === "string" && v.startsWith("0x") ? <CopyButton text={v} /> : null}
          </div>
        </>
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
              placeholder="Search by Address / Txn Hash / Block / Object / Output / Domain"
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
  return (
    <section className="hero-metrics">
      <div className="hero-metrics-grid">
        <div className="metric-card">
          <div className="metric-title">ZERO PRICE</div>
          <div className="metric-value">$1.973 <span className="metric-sub">(-4.97%)</span></div>
        </div>
        <div className="metric-card">
          <div className="metric-title">TRANSACTIONS</div>
          <div className="metric-value">{stats ? `${stats.latest_block_number * 130} (est.)` : "-"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">MED GAS PRICE</div>
          <div className="metric-value">{stats?.gas_price ?? "-"}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">LAST FINALIZED BLOCK</div>
          <div className="metric-value">{stats?.latest_block_number ?? "-"}</div>
        </div>
      </div>
    </section>
  );
}

function HomeBlockRows({ items }: { items: ExplorerBlock[] }) {
  return (
    <div className="list-rows">
      {items.slice(0, 6).map((b) => (
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
            <div className="row-sub">{b.tx_count} txns</div>
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
      {items.slice(0, 6).map((x) => (
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

function HomePage() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [blocks, setBlocks] = useState<BlockListResponse | null>(null);
  const [recentCompute, setRecentCompute] = useState<RecentComputeResponse | null>(null);
  const [hotAddresses, setHotAddresses] = useState<HotAddressResponse | null>(null);
  const [cacheDebug, setCacheDebug] = useState<CacheDebugResponse | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<ErrorCode>("unknown");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [s, b, c, h, d] = await Promise.all([
          api.networkStats(),
          api.blocks(10, 1),
          api.recentCompute(10),
          api.hotAddresses(10),
          api.debugCache(),
        ]);
        if (!mounted) return;
        setStats(s);
        setBlocks(b);
        setRecentCompute(c);
        setHotAddresses(h);
        setCacheDebug(d);
      } catch (e) {
        if (!mounted) return;
        const classified = classifyError(e);
        setError(classified.message);
        setErrorCode(classified.code);
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <HeroSearch smartRedirect />
      {error ? <div className="error">[{errorCode}] {error}</div> : null}

      <HeroMetrics stats={stats} />

      <div className="split2 dashboard-panels">
        <Section title="Latest Blocks">
          <div className="panel-head-end">
            <button className="tiny-btn" type="button">Customize</button>
          </div>
          <HomeBlockRows items={blocks?.items ?? []} />
          <div className="row-end">
            <Link to="/blocks">VIEW ALL BLOCKS →</Link>
          </div>
        </Section>

        <Section title="Latest Transactions">
          <div className="panel-head-end">
            <button className="tiny-btn" type="button">Customize</button>
          </div>
          <HomeTxRows items={recentCompute?.items ?? []} />
          <div className="row-end">
            <Link to="/search/tx">VIEW ALL TRANSACTIONS →</Link>
          </div>
        </Section>
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

  useEffect(() => {
    if (rangeMode) return;
    api.blocks(20, page)
      .then(setBlocks)
      .catch((e) => setError((e as Error).message));
  }, [page, rangeMode]);

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

  useEffect(() => {
    if (!number) return;
    api.blockByNumber(number)
      .then(setPayload)
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [number]);

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
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) return;
    api.account(address)
      .then(setData)
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [address]);

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
    </>
  );
}

function ComputeTxPage() {
  const { txId } = useParams();
  const [data, setData] = useState<ComputeTxResultView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!txId) return;
    api.computeResult(txId)
      .then(setData)
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [txId]);

  const resultObj = (data?.result ?? null) as Record<string, unknown> | null;

  return (
    <>
      <SearchBar smartRedirect />
      <Section title="Compute Tx Result (zero_getComputeTxResult)">
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

  useEffect(() => {
    if (!txId) return;
    api.txDetail(txId)
      .then(setData)
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [txId]);

  return (
    <>
      <SearchBar smartRedirect />
      <Section title={`Tx ${txId}`}>
        <div className="muted">tx route currently resolves via backend /api/tx for forward compatibility.</div>
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

  useEffect(() => {
    if (!objectId) return;
    api.object(objectId)
      .then(setData)
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [objectId]);

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
                  <>
                    <div className="k" key={`ok-${k}`}>
                      {k}
                    </div>
                    <div className="v" key={`ov-${k}`}>
                      {normalizeFieldValue(v)}
                    </div>
                  </>
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

  useEffect(() => {
    if (!outputId) return;
    api.output(outputId)
      .then(setData)
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [outputId]);

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
                  <>
                    <div className="k" key={`pk-${k}`}>
                      {k}
                    </div>
                    <div className="v" key={`pv-${k}`}>
                      {normalizeFieldValue(v)}
                    </div>
                  </>
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

  useEffect(() => {
    if (!domainId) return;
    api.domain(domainId)
      .then(setData)
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [domainId]);

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

function SearchResultPage() {
  const { query } = useParams();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query) return;
    api.search(query)
      .then((v) => {
        setData(v);
      })
      .catch((e) => {
        const classified = classifyError(e);
        setError(`[${classified.code}] ${classified.message}`);
      });
  }, [query]);

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
              <Link to={`/compute/${encodeURIComponent(query ?? "")}`}>Open as Compute Tx</Link>
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
        <Link to="/domains/0">Domain #0</Link>
      </div>
    </>
  );
}

export function App() {
  const [health, setHealth] = useState<NetworkHealth | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const h = await api.networkHealth();
        if (!mounted) return;
        setHealth(h);
      } catch {
        if (!mounted) return;
        setHealth({
          backend_ok: true,
          rpc_ok: false,
          rpc_latency_ms: 0,
          checked_at_unix: 0,
          detail: "health check failed",
        });
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const lampDetail = health
    ? `rpc_ok=${health.rpc_ok}; latency=${health.rpc_latency_ms}ms; checked=${toDate(health.checked_at_unix)}; detail=${health.detail}`
    : "network status unknown";

  return (
    <Shell lamp={health ? { rpc_ok: health.rpc_ok, detail: lampDetail } : undefined}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/blocks" element={<BlocksPage />} />
        <Route path="/blocks/:number" element={<BlockDetailPage />} />
        <Route path="/accounts/:address" element={<AccountPage />} />
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
