import { ReactNode } from "react";
import { Link } from "react-router-dom";

type NetworkLamp = {
  rpc_ok: boolean;
  detail: string;
};

export function Shell({
  children,
  lamp,
}: {
  children: ReactNode;
  lamp?: NetworkLamp;
}) {
  const lampLabel = lamp?.rpc_ok ? "RPC OK" : "RPC DOWN";

  return (
    <div className="shell">
      <header className="site-header">
        <div className="market-strip">
          <div className="market-strip-inner">
            <span className="market-item">ZERO Price: <b>$1.973</b> <em className="down">-4.97%</em></span>
            <span className="market-item">Gas: <b>0.308 Gwei</b></span>
          </div>
        </div>

        <div className="main-nav">
          <div className="main-nav-inner">
            <div className="brand">
              <Link to="/">ZeroScan</Link>
            </div>
            <nav className="nav-links">
              <div className="nav-item">
                <Link to="/">Home</Link>
              </div>
              <div className="nav-item has-menu">
                <Link to="/blocks">Blockchain ▾</Link>
                <div className="nav-menu">
                  <Link to="/blocks">View Blocks</Link>
                  <Link to="/search/latest-block">Latest Block</Link>
                  <Link to="/search/finalized">Finalized Block</Link>
                </div>
              </div>
              <div className="nav-item has-menu">
                <Link to="/search/tx">Transactions ▾</Link>
                <div className="nav-menu">
                  <Link to="/search/tx">Search Transactions</Link>
                  <Link to="/compute/0x0">Compute Tx Viewer</Link>
                </div>
              </div>
              <div className="nav-item has-menu">
                <Link to="/search/address">Addresses ▾</Link>
                <div className="nav-menu">
                  <Link to="/search/address">Search Address</Link>
                  <Link to="/accounts/0x0000000000000000000000000000000000000000">Zero Address</Link>
                </div>
              </div>
              <div className="nav-item has-menu">
                <Link to="/search/domain">Resources ▾</Link>
                <div className="nav-menu">
                  <Link to="/domains/0">Domain Lookup</Link>
                  <Link to="/search/object">Object Lookup</Link>
                  <Link to="/search/output">Output Lookup</Link>
                </div>
              </div>
            </nav>
            <div className="nav-right">
              <span className="lamp-wrap" title={lamp?.detail ?? "network status unknown"}>
                <span className={`lamp ${lamp?.rpc_ok ? "green" : "red"}`} />
                <span>{lampLabel}</span>
              </span>
              <button className="ghost-btn" type="button">Sign In</button>
            </div>
          </div>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

export function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      {hint ? <div className="card-hint">{hint}</div> : null}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function shortenHash(hash: string, size = 10): string {
  if (!hash || hash.length <= size * 2) return hash;
  return `${hash.slice(0, size)}…${hash.slice(-size)}`;
}

export function HexOrEmpty({ value }: { value: string | undefined | null }) {
  return <span>{value ?? "-"}</span>;
}

export function CopyButton({ text }: { text: string }) {
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // noop
    }
  };

  return (
    <button className="copy-btn" type="button" onClick={onClick}>
      Copy
    </button>
  );
}
