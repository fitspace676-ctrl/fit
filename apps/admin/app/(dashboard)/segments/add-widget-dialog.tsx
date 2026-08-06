'use client';

// The "Add widget" picker.
//
// The segment list IS the dialog's tab bar, so choosing what a segment shows
// happens in the same vocabulary as looking at it. Applying issues one save per
// CHANGED segment — an untouched tab costs no request.
//
// A segment must keep at least one widget: zero stored rows reads as "never
// configured", which restores the catalogue default and would quietly undo the
// removal. The last remaining checkbox is disabled rather than allowed to fail
// on save.
//
// Astryx `Dialog` centres itself by default (see `useSlideDrawer`'s own header
// comment) — this picker has no reason to anchor to an edge like the console's
// other "Add X" panels, so it skips that hook entirely and uses `Dialog` +
// `Layout` the way `categories-drawer.tsx` does, minus the drawer motion.

import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import {
  CONFIGURABLE_DASHBOARD_SEGMENTS,
  widgetsForSegment,
  type ConfigurableDashboardSegment,
} from '@fit/types';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Icon } from '@/components/ui';
import { saveSegmentWidgetsAction } from './actions';

type Selection = Record<ConfigurableDashboardSegment, string[]>;

const styles = stylex.create({
  icon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  tabs: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    marginBottom: '1rem',
  },
  tab: {
    flexShrink: 0,
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  tabActive: { borderBottomColor: 'var(--color-brand)', color: 'var(--color-brand)' },
  note: {
    margin: 0,
    marginBottom: '1rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  error: {
    margin: 0,
    marginTop: '0.75rem',
    fontSize: '0.8125rem',
    color: 'var(--color-error, var(--color-warning))',
  },
});

/** No stored selection for a segment the picker hasn't touched yet reads as empty, not missing. */
function currentSelection(
  selectedKeys: Selection,
  segment: ConfigurableDashboardSegment,
): string[] {
  return selectedKeys[segment] ?? [];
}

export function AddWidgetDialog({
  initialSegment,
  selectedKeys,
  onSaved,
}: {
  initialSegment: ConfigurableDashboardSegment;
  selectedKeys: Selection;
  onSaved: () => void;
}) {
  const t = useTranslations('admin.dashboard.picker');
  const tSegments = useTranslations('admin.dashboard.segments');
  const tWidgets = useTranslations('admin.dashboard.widgets');

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<ConfigurableDashboardSegment>(initialSegment);
  const [draft, setDraft] = useState<Selection>(selectedKeys);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const catalogue = useMemo(() => widgetsForSegment(tab), [tab]);
  const chosen = draft[tab] ?? [];
  const isLast = chosen.length === 1;

  function openDialog(): void {
    // Each open starts from what's actually saved — any abandoned edit from a
    // previous open (closed without applying) must not linger in the draft.
    setTab(initialSegment);
    setDraft(selectedKeys);
    setError(null);
    setIsOpen(true);
  }

  function toggle(key: string): void {
    setDraft((current) => {
      const keys = current[tab] ?? [];
      const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
      return { ...current, [tab]: next };
    });
  }

  async function apply(): Promise<void> {
    setSaving(true);
    setError(null);
    // Only the segments the user actually touched are written — order matters
    // (it's the display order), so a reorder with the same members still counts
    // as a change.
    const changed = CONFIGURABLE_DASHBOARD_SEGMENTS.filter(
      (segment) =>
        (draft[segment] ?? []).join(' ') !== currentSelection(selectedKeys, segment).join(' '),
    );
    for (const segment of changed) {
      const result = await saveSegmentWidgetsAction(segment, draft[segment] ?? []);
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setIsOpen(false);
    onSaved();
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        label={t('open')}
        icon={<Icon name="plus" {...stylex.props(styles.icon)} />}
        onClick={openDialog}
      />

      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} purpose="info" width="34rem">
        <Layout
          height="auto"
          header={<DialogHeader title={t('title')} onOpenChange={setIsOpen} />}
          content={
            <LayoutContent>
              <p {...stylex.props(styles.note)}>{t('shared')}</p>

              <div role="tablist" aria-label={tSegments('aria')} {...stylex.props(styles.tabs)}>
                {CONFIGURABLE_DASHBOARD_SEGMENTS.map((segment) => (
                  <button
                    key={segment}
                    type="button"
                    role="tab"
                    aria-selected={segment === tab}
                    onClick={() => setTab(segment)}
                    {...stylex.props(styles.tab, segment === tab && styles.tabActive)}
                  >
                    {tSegments(segment)}
                  </button>
                ))}
              </div>

              <div {...stylex.props(styles.list)}>
                {catalogue.map((widget) => {
                  const checked = chosen.includes(widget.key);
                  return (
                    <CheckboxInput
                      key={widget.key}
                      label={tWidgets(widget.labelKey)}
                      value={checked}
                      // Unchecking the last one would restore the whole catalogue.
                      // Left natively `disabled` (no `disabledMessage`) rather than
                      // the focusable `aria-disabled` CheckboxInput otherwise offers
                      // — the "why" already reads from the note below the list.
                      isDisabled={checked && isLast}
                      onChange={() => toggle(widget.key)}
                    />
                  );
                })}
              </div>

              {isLast ? <p {...stylex.props(styles.note)}>{t('lastWidget')}</p> : null}
              {error !== null ? (
                <p role="alert" {...stylex.props(styles.error)}>
                  {error}
                </p>
              ) : null}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <Button
                variant="ghost"
                size="sm"
                label={t('cancel')}
                onClick={() => setIsOpen(false)}
              />
              <Button
                variant="primary"
                size="sm"
                label={t('apply')}
                isDisabled={saving}
                onClick={() => void apply()}
              />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
