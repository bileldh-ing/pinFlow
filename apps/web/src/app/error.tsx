"use client";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">Your saved work is safe. {error.digest ? `Reference: ${error.digest}` : ""}</p>
        <button type="button" onClick={reset} className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink">Try again</button>
      </div>
    </main>
  );
}
