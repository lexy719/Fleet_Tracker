import type { ReactNode } from "react";
import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : "Unexpected application error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    // Keep simple browser-side logging; can be replaced by observability sink.
    console.error("AppErrorBoundary caught error:", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--app-bg)] px-4 py-10 text-[var(--app-fg)]">
        <div className="w-full max-w-lg rounded-3xl border border-[var(--app-border)] bg-[var(--app-card)] p-7 shadow-xl shadow-black/10">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/15 text-red-600 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">System status</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="mt-3 text-sm text-[var(--app-muted)]">
            The application hit an unexpected state. Reload to recover the command center session.
          </p>
          <p className="mt-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2 text-xs text-[var(--app-muted)]">
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reload app
          </button>
        </div>
      </main>
    );
  }
}
