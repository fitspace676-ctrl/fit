import React from 'react';

export default function App() {
  return (
    <div className="min-h-[640px] bg-ink-50 flex items-center justify-center p-10 font-sans">
      <div className="w-full max-w-md rounded-card border border-ink-200 bg-white p-8 shadow-pop">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-500">Sign in to continue to your workspace.</p>
        <div className="mt-6 space-y-3">
          <input className="w-full rounded-field border border-ink-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Email address" />
          <input type="password" className="w-full rounded-field border border-ink-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Password" />
          <button className="w-full rounded-btn bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600">Sign in</button>
        </div>
        <p className="mt-5 text-center text-xs text-ink-400">Ask the AI to design something — it creates a new artboard each time.</p>
      </div>
    </div>
  );
}
