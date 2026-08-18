'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type {
  AudienceCriteria,
  AudienceMemberSample,
  AudienceSegmentRow,
  MemberStatus,
} from '@fit/types';
import { Badge, Button, ConfirmDialog, Dialog } from '@fit/ui-kit';
import { Field, Input, useToast } from '@/components/ui';
import {
  createSegmentAction,
  deleteSegmentAction,
  previewCriteriaAction,
  updateSegmentAction,
} from './actions';

/** The member statuses the audience builder can filter on. */
const STATUS_OPTIONS: readonly MemberStatus[] = ['ACTIVE', 'INVITED', 'SUSPENDED'];

/** Debounce (ms) before an inline-criteria edit refreshes the live preview. */
const PREVIEW_DEBOUNCE_MS = 400;

/** The criteria fields as the browser hands them over (strings). */
interface CriteriaState {
  status: MemberStatus[];
  notVisitedForDays: string;
  visitedWithinDays: string;
  minClassAttendance: string;
  minSpent: string;
  joinedAfter: string;
  joinedBefore: string;
}

const EMPTY_CRITERIA: CriteriaState = {
  status: [],
  notVisitedForDays: '',
  visitedWithinDays: '',
  minClassAttendance: '',
  minSpent: '',
  joinedAfter: '',
  joinedBefore: '',
};

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  layout: {
    display: 'grid',
    gap: '1.25rem',
    alignItems: 'start',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 960px)': 'minmax(0, 3fr) minmax(0, 2fr)',
    },
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  panelHead: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  panelTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  panelHint: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  criteriaGrid: {
    display: 'grid',
    gap: '0.875rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 520px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  fullSpan: { gridColumn: '1 / -1' },
  statusChips: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem' },
  statusChip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
  },
  statusChipActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  builderActions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '1rem',
  },
  spacer: { flex: 1 },
  // Live preview.
  previewHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  countWrap: { display: 'flex', alignItems: 'baseline', gap: '0.5rem' },
  count: {
    fontSize: '1.75rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  countLabel: { fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  sampleList: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  sampleRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.0625rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  sampleName: { fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)' },
  sampleEmail: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  sampleMore: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
    paddingInline: '0.25rem',
  },
  emptyPreview: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    paddingBlock: '0.5rem',
  },
  // Saved segments.
  segmentList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  segmentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  segmentRowActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  segmentMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.0625rem',
    minWidth: 0,
    flex: 1,
    cursor: 'pointer',
    textAlign: 'left',
    background: 'none',
    borderWidth: 0,
    padding: 0,
    color: 'inherit',
  },
  segmentName: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  segmentMeta: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  segmentActions: { display: 'inline-flex', gap: '0.125rem', flexShrink: 0 },
  emptySegments: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
    paddingBlock: '0.5rem',
  },
  dialogBody: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
});

/** Seed the string form from a segment's stored criteria (or blank). */
function seedCriteria(criteria: AudienceCriteria | undefined): CriteriaState {
  if (!criteria) return { ...EMPTY_CRITERIA };
  return {
    status: criteria.status ? [...criteria.status] : [],
    notVisitedForDays:
      criteria.notVisitedForDays !== undefined ? String(criteria.notVisitedForDays) : '',
    visitedWithinDays:
      criteria.visitedWithinDays !== undefined ? String(criteria.visitedWithinDays) : '',
    minClassAttendance:
      criteria.minClassAttendance !== undefined ? String(criteria.minClassAttendance) : '',
    minSpent: criteria.minSpent !== undefined ? String(Math.round(criteria.minSpent / 100)) : '',
    joinedAfter: criteria.joinedAfter ? criteria.joinedAfter.slice(0, 10) : '',
    joinedBefore: criteria.joinedBefore ? criteria.joinedBefore.slice(0, 10) : '',
  };
}

/** Build the API `AudienceCriteria` from the string-based form. */
function buildCriteria(c: CriteriaState): AudienceCriteria {
  const criteria: AudienceCriteria = {};
  if (c.status.length > 0) criteria.status = c.status;
  const num = (v: string): number | undefined => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const notVisited = num(c.notVisitedForDays);
  if (notVisited !== undefined) criteria.notVisitedForDays = notVisited;
  const visited = num(c.visitedWithinDays);
  if (visited !== undefined) criteria.visitedWithinDays = visited;
  const attendance = num(c.minClassAttendance);
  if (attendance !== undefined) criteria.minClassAttendance = attendance;
  const spent = num(c.minSpent);
  if (spent !== undefined) criteria.minSpent = spent * 100;
  if (c.joinedAfter) criteria.joinedAfter = new Date(`${c.joinedAfter}T00:00:00`).toISOString();
  if (c.joinedBefore) criteria.joinedBefore = new Date(`${c.joinedBefore}T23:59:59`).toISOString();
  return criteria;
}

/** How many filters the current form encodes (drives the "clear"/save affordances). */
function activeFilterCount(criteria: AudienceCriteria): number {
  return Object.keys(criteria).length;
}

type DialogState =
  | { kind: 'save' }
  | { kind: 'rename'; segment: AudienceSegmentRow }
  | { kind: 'delete'; segment: AudienceSegmentRow }
  | null;

/**
 * The Audience tab (T12.9) — Build Your Audience. A criteria builder (membership
 * status, visit recency, join-date window, lifetime spend, class attendance)
 * with a live Matching Members preview (count + a sample of members) resolved by
 * the T12.7 segment-preview endpoint as the filters change, and Saved Segments
 * management: save the current criteria as a named segment, load one back into
 * the builder, rename it, or delete it. Everything write goes through the
 * `MarketingManage` Server Actions.
 */
export function AudienceView({
  segments,
  canManage,
}: {
  segments: AudienceSegmentRow[];
  canManage: boolean;
}) {
  const t = useTranslations('admin.marketing');
  const router = useRouter();
  const { toast } = useToast();
  const [criteria, setCriteria] = useState<CriteriaState>({ ...EMPTY_CRITERIA });
  const [count, setCount] = useState<number | null>(null);
  const [sample, setSample] = useState<AudienceMemberSample[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [loadedSegmentId, setLoadedSegmentId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [segmentName, setSegmentName] = useState('');
  const [busy, startBusy] = useTransition();

  const built = useMemo(() => buildCriteria(criteria), [criteria]);
  const filterCount = activeFilterCount(built);
  // A key that changes only when the resolved criteria change, to trigger preview.
  const criteriaKey = useMemo(() => JSON.stringify(built), [built]);

  /** Resolve the current criteria to a live count + sample. */
  const runPreview = useCallback(async (resolved: AudienceCriteria) => {
    setPreviewing(true);
    const result = await previewCriteriaAction(resolved);
    setPreviewing(false);
    if (result.ok) {
      setCount(result.data.count);
      setSample(result.data.sample);
    } else {
      setCount(null);
      setSample([]);
    }
  }, []);

  // Debounced live preview: any change to the resolved criteria re-queries.
  const previewRef = useRef(runPreview);
  previewRef.current = runPreview;
  useEffect(() => {
    const resolved = JSON.parse(criteriaKey) as AudienceCriteria;
    const handle = setTimeout(() => {
      void previewRef.current(resolved);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [criteriaKey]);

  function patch<K extends keyof CriteriaState>(key: K, value: CriteriaState[K]): void {
    setCriteria((prev) => ({ ...prev, [key]: value }));
    setLoadedSegmentId(null);
  }

  function toggleStatus(status: MemberStatus): void {
    setLoadedSegmentId(null);
    setCriteria((prev) => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter((s) => s !== status)
        : [...prev.status, status],
    }));
  }

  function clearAll(): void {
    setCriteria({ ...EMPTY_CRITERIA });
    setLoadedSegmentId(null);
  }

  function loadSegment(segment: AudienceSegmentRow): void {
    setCriteria(seedCriteria(segment.criteria));
    setLoadedSegmentId(segment.id);
    toast(t('audienceTab.loaded', { name: segment.name }), { tone: 'accent', icon: 'target' });
  }

  function confirmSave(): void {
    const name = segmentName.trim();
    if (name.length === 0) return;
    startBusy(async () => {
      const result = await createSegmentAction({ name, criteria: built });
      if (result.ok) {
        setDialog(null);
        setSegmentName('');
        setLoadedSegmentId(result.data.id);
        toast(t('audienceTab.saved'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmRename(segment: AudienceSegmentRow): void {
    const name = segmentName.trim();
    if (name.length === 0) return;
    startBusy(async () => {
      const result = await updateSegmentAction(segment.id, { name });
      if (result.ok) {
        setDialog(null);
        setSegmentName('');
        toast(t('audienceTab.renamed'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function confirmDelete(segment: AudienceSegmentRow): void {
    startBusy(async () => {
      const result = await deleteSegmentAction(segment.id);
      if (result.ok) {
        setDialog(null);
        if (loadedSegmentId === segment.id) setLoadedSegmentId(null);
        toast(t('audienceTab.deleted'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div {...stylex.props(styles.layout)}>
      {/* ── Builder + live preview ─────────────────────────────────────────── */}
      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.panelHead)}>
          <h2 {...stylex.props(styles.panelTitle)}>{t('audienceTab.buildTitle')}</h2>
          <p {...stylex.props(styles.panelHint)}>{t('audienceTab.buildHint')}</p>
        </div>

        <div {...stylex.props(styles.criteriaGrid)}>
          <div {...stylex.props(styles.fullSpan)}>
            <Field label={t('audience.statusLabel')}>
              <div {...stylex.props(styles.statusChips)}>
                {STATUS_OPTIONS.map((status) => {
                  const active = criteria.status.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleStatus(status)}
                      {...stylex.props(styles.statusChip, active && styles.statusChipActive)}
                    >
                      {t(`memberStatus.${status}`)}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <Field label={t('audience.notVisitedLabel')}>
            <Input
              type="number"
              min={1}
              value={criteria.notVisitedForDays}
              onChange={(e) => patch('notVisitedForDays', e.target.value)}
              placeholder={t('audience.daysPlaceholder')}
            />
          </Field>
          <Field label={t('audience.visitedWithinLabel')}>
            <Input
              type="number"
              min={1}
              value={criteria.visitedWithinDays}
              onChange={(e) => patch('visitedWithinDays', e.target.value)}
              placeholder={t('audience.daysPlaceholder')}
            />
          </Field>
          <Field label={t('audience.minClassLabel')}>
            <Input
              type="number"
              min={1}
              value={criteria.minClassAttendance}
              onChange={(e) => patch('minClassAttendance', e.target.value)}
              placeholder={t('audience.countPlaceholder')}
            />
          </Field>
          <Field label={t('audience.minSpentLabel')}>
            <Input
              type="number"
              min={1}
              value={criteria.minSpent}
              onChange={(e) => patch('minSpent', e.target.value)}
              placeholder={t('audience.amountPlaceholder')}
            />
          </Field>
          <Field label={t('audience.joinedAfterLabel')}>
            <Input
              type="date"
              value={criteria.joinedAfter}
              onChange={(e) => patch('joinedAfter', e.target.value)}
            />
          </Field>
          <Field label={t('audience.joinedBeforeLabel')}>
            <Input
              type="date"
              value={criteria.joinedBefore}
              onChange={(e) => patch('joinedBefore', e.target.value)}
            />
          </Field>
        </div>

        <div {...stylex.props(styles.builderActions)}>
          <Button
            variant="ghost"
            size="inline"
            onClick={clearAll}
            disabled={filterCount === 0 && loadedSegmentId === null}
            icon={<Icon name="x" {...stylex.props(styles.kitGlyph)} />}
            label={t('audienceTab.clear')}
          />
          <span {...stylex.props(styles.spacer)} />
          {canManage ? (
            <Button
              variant="primary"
              size="inline"
              onClick={() => {
                setSegmentName('');
                setDialog({ kind: 'save' });
              }}
              icon={<Icon name="pin" {...stylex.props(styles.kitGlyph)} />}
              label={t('audienceTab.saveSegment')}
            />
          ) : null}
        </div>
      </div>

      {/* ── Matching members preview + saved segments ──────────────────────── */}
      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.previewHead)}>
          <div {...stylex.props(styles.panelHead)}>
            <h2 {...stylex.props(styles.panelTitle)}>{t('audienceTab.matchingTitle')}</h2>
            <p {...stylex.props(styles.panelHint)}>
              {filterCount === 0 ? t('audienceTab.matchingAll') : t('audienceTab.matchingFiltered')}
            </p>
          </div>
          {previewing ? <Badge tone="accent" label={t('audience.counting')} /> : null}
        </div>

        <div {...stylex.props(styles.countWrap)}>
          <span {...stylex.props(styles.count)}>{count !== null ? count : '-'}</span>
          <span {...stylex.props(styles.countLabel)}>{t('audienceTab.membersMatch')}</span>
        </div>

        {sample.length > 0 ? (
          <div {...stylex.props(styles.sampleList)}>
            {sample.map((member) => (
              <div key={member.id} {...stylex.props(styles.sampleRow)}>
                <span {...stylex.props(styles.sampleName)}>{member.name}</span>
                <span {...stylex.props(styles.sampleEmail)}>{member.email}</span>
              </div>
            ))}
            {count !== null && count > sample.length ? (
              <span {...stylex.props(styles.sampleMore)}>
                {t('audienceTab.andMore', { count: count - sample.length })}
              </span>
            ) : null}
          </div>
        ) : (
          <p {...stylex.props(styles.emptyPreview)}>
            {previewing ? t('audience.counting') : t('audienceTab.noMatches')}
          </p>
        )}

        <div {...stylex.props(styles.panelHead)}>
          <h2 {...stylex.props(styles.panelTitle)}>{t('audienceTab.savedTitle')}</h2>
          <p {...stylex.props(styles.panelHint)}>{t('audienceTab.savedHint')}</p>
        </div>

        {segments.length === 0 ? (
          <p {...stylex.props(styles.emptySegments)}>{t('audienceTab.noSegments')}</p>
        ) : (
          <div {...stylex.props(styles.segmentList)}>
            {segments.map((segment) => {
              const active = loadedSegmentId === segment.id;
              const filters = activeFilterCount(segment.criteria);
              return (
                <div
                  key={segment.id}
                  {...stylex.props(styles.segmentRow, active && styles.segmentRowActive)}
                >
                  <button
                    type="button"
                    onClick={() => loadSegment(segment)}
                    {...stylex.props(styles.segmentMain)}
                  >
                    <span {...stylex.props(styles.segmentName)}>{segment.name}</span>
                    <span {...stylex.props(styles.segmentMeta)}>
                      {filters === 0
                        ? t('audienceTab.segmentAll')
                        : t('audienceTab.segmentFilters', { count: filters })}
                    </span>
                  </button>
                  <span {...stylex.props(styles.segmentActions)}>
                    <Button
                      variant="ghost"
                      size="card"
                      iconOnly
                      title={t('audienceTab.load')}
                      onClick={() => loadSegment(segment)}
                      icon={<Icon name="target" {...stylex.props(styles.kitGlyph)} />}
                      label={t('audienceTab.loadFor', { name: segment.name })}
                    />
                    {canManage ? (
                      <>
                        <Button
                          variant="ghost"
                          size="card"
                          iconOnly
                          title={t('audienceTab.rename')}
                          onClick={() => {
                            setSegmentName(segment.name);
                            setDialog({ kind: 'rename', segment });
                          }}
                          icon={<Icon name="settings" {...stylex.props(styles.kitGlyph)} />}
                          label={t('audienceTab.renameFor', { name: segment.name })}
                        />
                        <Button
                          variant="ghost"
                          size="card"
                          iconOnly
                          title={t('audienceTab.delete')}
                          onClick={() => setDialog({ kind: 'delete', segment })}
                          icon={<Icon name="trash" {...stylex.props(styles.kitGlyph)} />}
                          label={t('audienceTab.deleteFor', { name: segment.name })}
                        />
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save / rename dialog. */}
      {dialog?.kind === 'save' || dialog?.kind === 'rename' ? (
        <Dialog
          open
          onClose={() => setDialog(null)}
          title={dialog.kind === 'save' ? t('audienceTab.saveTitle') : t('audienceTab.renameTitle')}
          description={
            dialog.kind === 'save'
              ? t('audienceTab.saveDescription')
              : t('audienceTab.renameDescription')
          }
          actions={
            <>
              <Button
                variant="secondary"
                size="card"
                onClick={() => setDialog(null)}
                disabled={busy}
                label={t('wizard.cancel')}
              />
              <Button
                variant="primary"
                size="card"
                onClick={() =>
                  dialog.kind === 'save' ? confirmSave() : confirmRename(dialog.segment)
                }
                disabled={busy || segmentName.trim().length === 0}
                label={
                  busy
                    ? t('wizard.saving')
                    : dialog.kind === 'save'
                      ? t('audienceTab.saveSegment')
                      : t('audienceTab.rename')
                }
              />
            </>
          }
        >
          <div {...stylex.props(styles.dialogBody)}>
            <Field label={t('audienceTab.segmentNameLabel')}>
              <Input
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                placeholder={t('audienceTab.segmentNamePlaceholder')}
                maxLength={120}
                autoFocus
              />
            </Field>
          </div>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete') {
            confirmDelete(dialog.segment);
          }
        }}
        title={t('audienceTab.deleteTitle')}
        description={
          dialog?.kind === 'delete'
            ? t('audienceTab.deleteMessage', { name: dialog.segment.name })
            : ''
        }
        confirmLabel={t('audienceTab.delete')}
        cancelLabel={t('wizard.cancel')}
        confirmVariant="destructive"
        loading={busy}
      />
    </div>
  );
}
