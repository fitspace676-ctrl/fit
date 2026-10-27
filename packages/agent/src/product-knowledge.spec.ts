import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_DOMAINS } from '@fit/mcp';
import { describe, expect, it } from 'vitest';
import { CONSOLE_PAGES, GLOSSARY, WORKFLOWS } from './product-knowledge';

const dashboard = fileURLToPath(new URL('../../../apps/admin/app/(dashboard)/', import.meta.url));
const routeFile = (path: string) =>
  `${path
    .split('?')[0]!
    .replace(/:([a-z]+)/g, '[$1]')
    .replace(/^\//, '')
    .replace(/\/$/, '')}/page.tsx`.replace(/^\//, '');

function pageFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    return entry.isDirectory()
      ? pageFiles(resolve(dir, entry.name), `${name}/`)
      : entry.name === 'page.tsx'
        ? [name]
        : [];
  });
}

describe('product knowledge', () => {
  it('covers all 47 physical dashboard pages plus the audience tab, without invented routes', () => {
    const physical = pageFiles(dashboard).sort();
    expect(physical).toHaveLength(47);
    expect(CONSOLE_PAGES).toHaveLength(48);
    expect(new Set(CONSOLE_PAGES.map((p) => p.path)).size).toBe(CONSOLE_PAGES.length);
    for (const page of CONSOLE_PAGES) {
      expect(existsSync(resolve(dashboard, routeFile(page.path))), page.path).toBe(true);
      expect(page.title.en).not.toBe('');
      expect(page.title.ka).not.toBe('');
      expect(page.purpose).not.toBe('');
    }
    expect([...new Set(CONSOLE_PAGES.map((p) => routeFile(p.path)))].sort()).toEqual(physical);
    expect(CONSOLE_PAGES.map((p) => p.path)).toContain('/marketing?tab=audience');
    expect(CONSOLE_PAGES.map((p) => p.path)).not.toContain('/segments');
    expect(CONSOLE_PAGES.map((p) => p.path)).not.toContain('/overview');
  });

  it('uses only registered tool domains', () => {
    const domains = TOOL_DOMAINS.map((d) => d.id);
    for (const page of CONSOLE_PAGES) {
      if (page.toolDomain) expect(domains, page.path).toContain(page.toolDomain);
    }
  });

  it('uses Georgian without em/en dashes or Mtavruli letters', () => {
    for (const ka of [...CONSOLE_PAGES.map((p) => p.title.ka), ...GLOSSARY.map((t) => t.ka)]) {
      expect(ka).not.toMatch(/[\u2013\u2014\u1C90-\u1CBF]/u);
    }
    expect(new Set(GLOSSARY.map((t) => t.en)).size).toBe(GLOSSARY.length);
    for (const term of GLOSSARY) expect(term.meaning.length).toBeGreaterThan(0);
  });

  it('keeps 15-25 workflows with 1-3 steps using real pages and tools', () => {
    const paths = CONSOLE_PAGES.map((p) => p.path);
    const tools = TOOL_DOMAINS.flatMap((d) => d.tools);
    expect(WORKFLOWS.length).toBeGreaterThanOrEqual(15);
    expect(WORKFLOWS.length).toBeLessThanOrEqual(25);
    for (const workflow of WORKFLOWS) {
      expect(workflow.steps.length).toBeGreaterThanOrEqual(1);
      expect(workflow.steps.length).toBeLessThanOrEqual(3);
      for (const step of workflow.steps) {
        const mentionedPaths = [...step.matchAll(/(?:^|\s)(\/[a-zA-Z0-9/:?=_-]+)/g)].map((m) =>
          m[1]!.replace(/:$/, ''),
        );
        const mentionedTools = [...step.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((m) => m[0]);
        expect(mentionedPaths.length + mentionedTools.length, step).toBeGreaterThan(0);
        for (const path of mentionedPaths) expect(paths, step).toContain(path);
        for (const tool of mentionedTools) expect(tools, step).toContain(tool);
      }
    }
  });

  it("keeps a member's own subscription and freeze on the member page", () => {
    const payments = CONSOLE_PAGES.find((p) => p.path === '/payments')!;
    expect(payments.purpose).toContain('/members/:id');
    const freeze = WORKFLOWS.find((w) => w.task === 'Freeze a subscription')!;
    expect(freeze.steps.join(' ')).toContain('/members/:id');
    expect(freeze.steps.join(' ')).toContain('freeze_subscription');
    expect(freeze.steps.join(' ')).not.toContain('/payments');
  });
});
