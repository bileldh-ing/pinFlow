import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="pf-grid-bg grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold">This page isn’t on the board</h1>
        <p className="mt-2 text-sm text-muted">It may have moved, or you may not have access to it.</p>
        <Link href="/" className="mt-6 inline-block text-accent hover:underline">Back home</Link>
      </div>
    </main>
  );
}
