import { Component, type ReactNode } from "react";

/** Contains a crash to the piece that crashed: one widget failing must not
 *  take the lesson down with it. Shows what broke so it can be reported. */
export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[fret-not] ${this.props.label} crashed:`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-crash={this.props.label} className="my-5 rounded-xl border border-bad bg-bad-soft px-4 py-3 text-fg">
        <p className="font-semibold">This part of the page hit an error ({this.props.label}).</p>
        <p className="font-mono text-sm text-fg-2">{this.state.error.message}</p>
      </div>
    );
  }
}
