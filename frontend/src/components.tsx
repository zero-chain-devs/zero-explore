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
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Link to="/">Zero Explorer</Link>
        </div>
        <nav className="nav">
          <Link to="/">Home</Link>
          <Link to="/blocks">Blocks</Link>
          <span className="lamp-wrap" title={lamp?.detail ?? "network status unknown"}>
            <span className={`lamp ${lamp?.rpc_ok ? "green" : "red"}`} />
            <span>{lamp?.rpc_ok ? "RPC OK" : "RPC DOWN"}</span>
          </span>
        </nav>
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
