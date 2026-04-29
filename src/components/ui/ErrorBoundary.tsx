import React from 'react';
import { cn } from '@/lib/utils';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  className?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const {
        fallbackTitle = 'Something went wrong',
        fallbackMessage = 'An unexpected error occurred. You can try again or reload the page.',
        className,
      } = this.props;

      return (
        <div
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center',
            className
          )}
        >
          <div className="rounded-lg border border-border bg-elevated p-6 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold text-text-primary">
              {fallbackTitle}
            </h2>
            <p className="mb-4 text-sm text-text-secondary">
              {fallbackMessage}
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-32 overflow-auto rounded bg-tertiary p-3 text-left text-xs text-text-muted">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex h-9 items-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:bg-tertiary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
