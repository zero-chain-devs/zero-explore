import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "unknown error" };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Keep logging local to avoid hard dependency on external telemetry.
    // eslint-disable-next-line no-console
    console.error("[zero-explorer-frontend] render crash", error, errorInfo);
  }

  private reload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
        <h2 style={{ marginTop: 0 }}>Frontend recovered from a crash</h2>
        <p style={{ marginBottom: 16 }}>
          Rendering failed. You can reload safely. If this keeps happening, check backend health first.
        </p>
        <pre
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: 12,
            overflowX: "auto",
          }}
        >
          {this.state.message}
        </pre>
        <button
          type="button"
          onClick={this.reload}
          style={{ marginTop: 12, padding: "8px 12px", cursor: "pointer" }}
        >
          Reload
        </button>
      </div>
    );
  }
}
