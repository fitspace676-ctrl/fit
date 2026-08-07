import { describe, expect, it } from 'vitest';
import { REPORT_METRIC_DEFINITIONS } from './reports-drilldown';
import {
  CONFIGURABLE_DASHBOARD_SEGMENTS,
  DASHBOARD_SEGMENTS,
  DASHBOARD_WIDGET_CATALOG,
  findDashboardWidget,
  setDashboardWidgetsSchema,
  widgetsForSegment,
} from './dashboard-segments';

describe('dashboard segment catalogue', () => {
  it('leads with the non-configurable overview segment', () => {
    expect(DASHBOARD_SEGMENTS[0]).toBe('overview');
    expect(CONFIGURABLE_DASHBOARD_SEGMENTS).not.toContain('overview');
  });

  it('gives every widget a unique key', () => {
    const keys = DASHBOARD_WIDGET_CATALOG.map((widget) => widget.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('prefixes every widget key with its own segment', () => {
    for (const widget of DASHBOARD_WIDGET_CATALOG) {
      expect(widget.key.startsWith(`${widget.segment}.`)).toBe(true);
    }
  });

  // The invariant that matters: a section renamed in the reports layer must break
  // the build here rather than silently blank a widget on the dashboard.
  it('points every widget at a section its metric actually emits', () => {
    for (const widget of DASHBOARD_WIDGET_CATALOG) {
      const definition = REPORT_METRIC_DEFINITIONS[widget.source.metric];
      expect(definition, `unknown metric for ${widget.key}`).toBeDefined();
      expect(definition.sections, `unknown section for ${widget.key}`).toContain(
        widget.source.section,
      );
    }
  });

  it('gives every configurable segment at least one widget', () => {
    for (const segment of CONFIGURABLE_DASHBOARD_SEGMENTS) {
      expect(widgetsForSegment(segment).length).toBeGreaterThan(0);
    }
  });

  it('returns a segment its widgets in catalogue order', () => {
    expect(widgetsForSegment('members').map((widget) => widget.key)).toEqual([
      'members.new-signups',
      'members.churn',
    ]);
  });

  it('finds a widget by key and misses on an unknown one', () => {
    expect(findDashboardWidget('revenue.over-time')?.segment).toBe('revenue');
    expect(findDashboardWidget('revenue.nope')).toBeUndefined();
  });

  // `sales` is a hand-built view now, so the picker must not offer it — while the
  // tab bar must still show it.
  it('keeps sales out of the configurable segments but in the tab bar', () => {
    expect(CONFIGURABLE_DASHBOARD_SEGMENTS).not.toContain('sales');
    expect(DASHBOARD_SEGMENTS).toContain('sales');
    expect(DASHBOARD_SEGMENTS[1]).toBe('sales');
  });

  it('no longer defines any sales widget', () => {
    expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('sales.'))).toBe(false);
    expect(findDashboardWidget('sales.top-plans')).toBeUndefined();
  });

  // "No stored rows" is read as "use the catalogue default", so an empty
  // selection cannot also mean "the owner removed everything".
  it('refuses an empty widget selection', () => {
    expect(setDashboardWidgetsSchema.safeParse({ widgetKeys: [] }).success).toBe(false);
    expect(setDashboardWidgetsSchema.safeParse({ widgetKeys: ['revenue.over-time'] }).success).toBe(
      true,
    );
  });
});
