// @fit/admin — the AI agent's model registry + provider availability.
//
// One catalogue of switchable models (cheapest first), each tagged with its
// provider and concrete model id. A model is "available" only when its
// provider's API key is configured — the UI selector shows exactly the models
// the operator can actually use, and the route resolves the chosen one.

import type { ModelDriver } from './driver';
import { createClaudeDriver } from './providers/claude';
import { createGeminiDriver } from './providers/gemini';

export type AgentProvider = 'anthropic' | 'google';

export interface AgentModel {
  /** Stable UI id sent in the chat request. */
  id: string;
  /** Human label for the selector. */
  label: string;
  provider: AgentProvider;
  /** Concrete provider model id. */
  modelId: string;
}

/**
 * Ordered cheapest → priciest. Gemini Flash is the cost-optimised default when a
 * Google key is present; Claude Haiku is the capable fallback.
 */
const MODELS: AgentModel[] = [
  // "latest" aliases track Google's current model and don't 404 as specific
  // versions get retired for new projects (e.g. gemini-2.5-flash-lite).
  {
    id: 'gemini-flash-lite',
    label: 'Gemini Flash-Lite (cheapest)',
    provider: 'google',
    modelId: 'gemini-flash-lite-latest',
  },
  { id: 'gemini-flash', label: 'Gemini Flash', provider: 'google', modelId: 'gemini-flash-latest' },
  { id: 'haiku', label: 'Claude Haiku 4.5', provider: 'anthropic', modelId: 'claude-haiku-4-5' },
];

/** Is the given provider's API key configured? */
export function providerAvailable(provider: AgentProvider): boolean {
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  return Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);
}

/** The models the operator can actually use right now (keys present). */
export function availableModels(): AgentModel[] {
  return MODELS.filter((m) => providerAvailable(m.provider));
}

/** Resolve a requested model id to an available model, or the first available. */
export function resolveModel(id?: string): AgentModel | undefined {
  const available = availableModels();
  return available.find((m) => m.id === id) ?? available[0];
}

/**
 * Models to fall back to if `model` fails outright — one per *other* configured
 * provider, cheapest first.
 *
 * Both providers are rarely down at once, but a single rejected or expired key
 * is common, and it otherwise takes the console's agent down completely while a
 * second, working key sits configured. Trying the next provider turns that from
 * an outage into a slightly costlier turn.
 */
export function fallbackModels(model: AgentModel): AgentModel[] {
  const seen = new Set<AgentProvider>([model.provider]);
  const spares: AgentModel[] = [];
  for (const candidate of availableModels()) {
    if (seen.has(candidate.provider)) continue;
    seen.add(candidate.provider);
    spares.push(candidate);
  }
  return spares;
}

/** Instantiate the driver for a model. */
export function createDriver(model: AgentModel): ModelDriver {
  return model.provider === 'anthropic'
    ? createClaudeDriver(model.modelId)
    : createGeminiDriver(model.modelId);
}
