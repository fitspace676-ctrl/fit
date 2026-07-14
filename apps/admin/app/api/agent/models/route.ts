// @fit/admin — available AI-agent models.
//
// The chat UI fetches this to populate its model selector: only models whose
// provider key is configured are returned (cheapest first). An empty list means
// no provider key is set — the chat runs in canned-fallback mode.

import { getServerSession } from '@/lib/session';
import { availableModels } from '@/lib/agent/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await getServerSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const models = availableModels().map((m) => ({ id: m.id, label: m.label }));
  return new Response(JSON.stringify({ models }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
