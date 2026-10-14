"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-muted">An unexpected error occurred. Please try again.</p>
      <button onClick={reset} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">
        Try again
      </button>
    </div>
  );
}
