import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-8 rounded-xl bg-slate-900/80 border border-rose-500/30 text-center max-w-md mx-auto my-12">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Something Went Wrong</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {this.state.error?.message || 'An unexpected operational UI rendering error occurred.'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={this.handleReset}
          >
            Retry Section
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
