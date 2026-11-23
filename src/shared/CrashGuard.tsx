import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Wraps a whole screen. If anything in it throws while drawing, React removes
 * the screen and leaves it black. This shows what went wrong instead, with a
 * way to try again or reload, so nobody is left staring at a blank panel.
 */
export class CrashGuard extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[sidekick] screen crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="p-5 text-sm text-text">
        <h1 className="text-lg font-semibold">Sidekick hit a problem</h1>
        <p className="mt-2 text-text-muted">
          Your recordings are safe on this computer. Try again, and if it keeps happening, reload
          Sidekick and send this message to the team.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-btn border border-ink/10 p-3 text-xs text-text-muted">
          {error.message}
        </pre>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          <button type="button" className="btn-primary" onClick={() => chrome.runtime.reload()}>
            Reload Sidekick
          </button>
        </div>
      </div>
    );
  }
}
