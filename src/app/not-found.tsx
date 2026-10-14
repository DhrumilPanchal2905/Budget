import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-semibold tracking-tight">404</p>
      <p className="mt-3 text-sm text-muted">This page does not exist.</p>
      <Link href="/" className="mt-6 rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
        Go home
      </Link>
    </div>
  );
}
