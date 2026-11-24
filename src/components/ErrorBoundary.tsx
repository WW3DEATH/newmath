import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let displayMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && typeof parsed.error === 'string') {
          displayMsg = `${parsed.error} (${parsed.operationType} on ${parsed.path || 'database'})`;
        }
      } catch {
        // Non-JSON error message
      }

      return (
        <div className="flex h-screen w-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h1 className="text-lg font-semibold text-white">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-slate-300">{displayMsg}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              Reload View
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
