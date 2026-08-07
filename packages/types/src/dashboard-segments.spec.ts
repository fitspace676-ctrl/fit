import { describe, expect, it } from 'vitest';
import { REPORT_METRIC_DEFINITIONS } from './reports-drilldown';
import {
  CONFIGURABLE_DASHBOARD_SEGMENTS,
  DASHBOARD_SEGMENTS,
  DASHBOARD_WIDGET_CATALOG,
  findDashboardWidget,
  HAND_BUILT_SEGMENTS,
  isHandBuiltSegment,
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
    expect(widgetsForSegment('staff').map((widget) => widget.key)).toEqual([
      'staff.sessions-per-trainer',
    ]);
  });

  it('finds a widget by key and misses on an unknown one', () => {
    expect(findDashboardWidget('staff.sessions-per-trainer')?.segment).toBe('staff');
    expect(findDashboardWidget('staff.nope')).toBeUndefined();
  });

  // Four hand-built views now, so the picker must offer none of them — while the
  // tab bar must still show every one.
  it('keeps the hand-built tabs out of the configurable segments but in the tab bar', () => {
    for (const segment of HAND_BUILT_SEGMENTS) {
      expect(CONFIGURABLE_DASHBOARD_SEGMENTS).not.toContain(segment);
      expect(DASHBOARD_SEGMENTS).toContain(segment);
    }
    expect(DASHBOARD_SEGMENTS.slice(0, 5)).toEqual([
      'overview',
      'sales',
      'members',
      'revenue',
      'classes',
    ]);
  });

  // The console splits every tab on this guard alone — a tab it misjudges either
  // asks the segments API for a catalogue that does not exist (the Members bug)
  // or renders no view at all.
  it('sorts every tab into exactly one of hand-built and configurable', () => {
    for (const segment of DASHBOARD_SEGMENTS) {
      expect(isHandBuiltSegment(segment)).toBe(
        (HAND_BUILT_SEGMENTS as readonly string[]).includes(segment),
      );
      expect(isHandBuiltSegment(segment)).toBe(
        !(CONFIGURABLE_DASHBOARD_SEGMENTS as readonly string[]).includes(segment),
      );
    }
  });

  it('no longer defines any sales widget', () => {
    expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('sales.'))).toBe(false);
    expect(findDashboardWidget('sales.top-plans')).toBeUndefined();
  });

  it('no longer defines any revenue widget', () => {
    expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('revenue.'))).toBe(
      false,
    );
    expect(findDashboardWidget('revenue.over-time')).toBeUndefined();
  });

  it('no longer defines any classes widget', () => {
    expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('classes.'))).toBe(
      false,
    );
    expect(findDashboardWidget('classes.most-booked')).toBeUndefined();
  });

  it('no longer defines any members widget', () => {
    expect(DASHBOARD_WIDGET_CATALOG.some((widget) => widget.key.startsWith('members.'))).toBe(
      false,
    );
    expect(findDashboardWidget('members.churn')).toBeUndefined();
  });

  // "No stored rows" is read as "use the catalogue default", so an empty
  // selection cannot also mean "the owner removed everything".
  it('refuses an empty widget selection', () => {
    expect(setDashboardWidgetsSchema.safeParse({ widgetKeys: [] }).success).toBe(false);
    expect(
      setDashboardWidgetsSchema.safeParse({ widgetKeys: ['classes.most-booked'] }).success,
    ).toBe(true);
  });
});
