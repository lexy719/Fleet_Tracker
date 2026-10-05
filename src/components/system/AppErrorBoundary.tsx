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
      <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-4 py-10 text-[var(--text)]">
        <div role="alert" className="w-full max-w-md rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
          <div className="flex items-center gap-2 text-[var(--danger)]">
            <AlertTriangle className="h-4 w-4" />
            <h1 className="text-[15px] font-semibold">O FleetOS encontrou um erro inesperado</h1>
          </div>
          <p className="mt-2 text-[13px] text-[var(--text-2)]">
            Os dados operacionais estão guardados neste navegador e não foram afetados. Recarregue a página para continuar.
          </p>
          <p className="mt-3 rounded-[var(--r-md)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[11.5px] text-[var(--text-3)]">{this.state.message}</p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-4 inline-flex h-8 items-center gap-2 rounded-[var(--r-md)] bg-[var(--accent)] px-3 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recarregar
          </button>
        </div>
      </main>
    );
  }
}
