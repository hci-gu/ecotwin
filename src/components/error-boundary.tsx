import type { ReactNode } from "react"
import { Component } from "react"

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-screen place-items-center bg-white px-6 py-10 text-zinc-900">
        <div className="w-full max-w-xl rounded-md bg-zinc-50 p-4 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-semibold">Something went wrong</div>
          <div className="mt-2 text-xs text-zinc-700">{error.message}</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex cursor-pointer items-center rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}

