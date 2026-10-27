import { vi } from 'vitest';

// The admin runner discovers *.test.tsx; keep the builder's requested spec names.
// Mocks for the dialog spec live here so they are hoisted ahead of every import.
vi.mock('./actions', () => ({
  createAutomationRuleAction: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
  updateAutomationRuleAction: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
}));
vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import './condition-builder.spec';
import './timing-field.spec';
import './rule-form-dialog.spec';
