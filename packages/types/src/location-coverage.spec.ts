// @fit/types — every list query either takes a branch or says why it does not.
//
// Location is an explicit query parameter, not an ambient filter (roadmap §3 in
// `docs/superpowers/plans/2026-08-30-multi-branch-location-filter.md`), so a list
// endpoint that forgets it fails OPEN: it quietly shows every branch. This spec is
// the lint the roadmap asks for. It scans every module in `src/` — not `index.ts`,
// so a module nobody re-exported is still caught — for the list/dashboard/report
// query schemas and requires each one to carry `locationId` or sit on one of the
// two lists below with a reason.
//
// Both lists fail when they go stale: a name that no longer exists, or that has
// since gained `locationId`, has to be deleted rather than left to excuse the next
// schema that happens to take its name.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/** Deliberately branch-less: the thing listed is not at a branch. */
const LOCATION_EXEMPT: Record<string, string> = {
  listAdminLocationsQuerySchema:
    'the branch catalogue itself — narrowing it to one branch hides the rest',
  listLocationsQuerySchema: 'the public branch picker — it is what a branch is chosen from',
  listAuditLogQuerySchema:
    'AuditLog carries no branch; a trail of who changed the gym, not activity at a site',
  listAdminAuditLogQuerySchema:
    'SUPER_ADMIN trail across every tenant; below the gym, a branch means nothing',
  listAutomationRunsQuerySchema:
    'already pinned to one rule by the path (`/automation/rules/:id/runs`)',
  listNotificationsQuerySchema: "the caller's own inbox",
  listMyOrdersQuerySchema: "the member's own order history, wherever they bought",
  listMemberBookingsQuerySchema: "the member's own bookings, wherever they train",
  listTrainerReviewsQuerySchema:
    'a Review has no branch; a rating is a property of the trainer (register: staff rating)',
  listAdminTrainerReviewsQuerySchema:
    'a Review has no branch; the moderation queue is per trainer, by path',
  listPublicBannersQuerySchema:
    'Banner has no branch column and no roadmap stage gives it one; one gym-wide carousel',
};

// PENDING: needs the filter, tracked. Each of these lists rows that do reach a
// branch, so today it fails open. They are here only to keep the suite green while
// the gaps are open — close one by adding `locationId` and deleting its line.
const LOCATION_PENDING: Record<string, string> = {
  listActivityQuerySchema:
    'GET /admin/activity — members, bookings, check-ins, payments, subscriptions all reach a branch',
  listRedemptionsQuerySchema: "GET /loyalty/redemptions — attributable by the member's home branch",
  listCampaignsQuerySchema:
    'GET /marketing/campaigns — Stage 7 exclusivity; Campaign has no column yet',
  listAutomationRulesQuerySchema:
    'GET /automation/rules — Stage 7 exclusivity; AutomationRule has no column yet',
  listServiceSlotsQuerySchema: 'public GET /service-sessions — ServiceSession.locationId exists',
};

const COVERED_NAME = /^(list\w*|dashboard\w*|report\w*)QuerySchema$/;

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const modules = readdirSync(srcDir)
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
  .sort();

/** Every covered export, by name → the module that first exports it. */
const schemas = new Map<string, { file: string; schema: unknown }>();
for (const file of modules) {
  const mod = (await import(`./${file}`)) as Record<string, unknown>;
  for (const [name, value] of Object.entries(mod)) {
    if (COVERED_NAME.test(name) && !schemas.has(name)) schemas.set(name, { file, schema: value });
  }
}

/** The object shape under refinements, defaults and intersections; `null` if there is none. */
function shapeOf(schema: unknown): z.ZodRawShape | null {
  if (schema instanceof z.ZodObject) return schema.shape as z.ZodRawShape;
  if (schema instanceof z.ZodEffects) return shapeOf(schema.innerType());
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return shapeOf(schema.unwrap());
  if (schema instanceof z.ZodDefault) return shapeOf(schema._def.innerType);
  if (schema instanceof z.ZodPipeline) return shapeOf(schema._def.in);
  if (schema instanceof z.ZodIntersection) {
    const left = shapeOf(schema._def.left);
    const right = shapeOf(schema._def.right);
    return left || right ? { ...left, ...right } : null;
  }
  return null;
}

const hasLocationId = (schema: unknown): boolean => {
  const shape = shapeOf(schema);
  return shape !== null && 'locationId' in shape;
};

describe('location coverage of list queries', () => {
  it('finds the schemas it is meant to police', () => {
    // A scanner that silently finds nothing would pass every check below.
    expect(schemas.size).toBeGreaterThan(40);
    expect(schemas.has('listMembersQuerySchema')).toBe(true);
    expect(schemas.has('reportQuerySchema')).toBe(true);
    expect(schemas.has('dashboardOverviewQuerySchema')).toBe(true);
  });

  it.each([...schemas.keys()])('%s takes locationId or is on a list', (name) => {
    const { file, schema } = schemas.get(name)!;
    expect(
      shapeOf(schema),
      `${file}: ${name} is not an object schema this spec can read`,
    ).not.toBeNull();
    if (hasLocationId(schema)) return;
    expect(
      name in LOCATION_EXEMPT || name in LOCATION_PENDING,
      `${file}: ${name} has no locationId — add it, or add a reasoned entry to LOCATION_EXEMPT`,
    ).toBe(true);
  });

  it('keeps no name on both lists', () => {
    expect(Object.keys(LOCATION_EXEMPT).filter((name) => name in LOCATION_PENDING)).toEqual([]);
  });

  it.each([
    ...Object.keys(LOCATION_EXEMPT).map((name) => ['LOCATION_EXEMPT', name] as const),
    ...Object.keys(LOCATION_PENDING).map((name) => ['LOCATION_PENDING', name] as const),
  ])('%s entry %s is not stale', (list, name) => {
    const entry = schemas.get(name);
    expect(
      entry,
      `${list}.${name} names a schema that no longer exists — delete the entry`,
    ).toBeDefined();
    expect(
      hasLocationId(entry!.schema),
      `${list}.${name} now takes locationId — delete the entry`,
    ).toBe(false);
  });
});
