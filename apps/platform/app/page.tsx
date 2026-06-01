export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        @fit/platform
      </span>
      <h1 className="text-4xl font-bold tracking-tight text-brand-600">Run your gym on Fit</h1>
      <p className="max-w-md text-slate-500">
        Placeholder marketing site + owner signup. If you can read this on a Vercel preview URL, the
        deploy pipeline is working.
      </p>
    </main>
  );
}
