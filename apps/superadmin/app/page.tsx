export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        @fit/superadmin
      </span>
      <h1 className="text-4xl font-bold tracking-tight text-brand-600">Fit SuperAdmin</h1>
      <p className="max-w-md text-slate-500">
        Placeholder operator console. SUPER_ADMIN-only — full auth guard lands in T2.12. If you can
        read this on a Vercel preview URL, the deploy pipeline is working.
      </p>
    </main>
  );
}
