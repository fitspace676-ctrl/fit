'use client';

// @fit/admin — AI Agent chat panel.
//
// A launcher pill (also ⌘J / Ctrl+J) opens a floating side panel: a header with
// the agent's state, a Chat | History segment, the Astryx `ChatLayout`
// transcript and a composer. Turns stream in over NDJSON from `/api/agent/chat`
// via `useAgentChat`; the tool-call chrome lives in `tool-calls.tsx`.
//
// The look follows the FormaCore console: warm ink monochrome, with the gym's
// accent on the launcher, the agent badge, the primary actions (send, approve)
// and the live-status dot; the operator's own messages are inverted ink blocks.
// Every colour is a theme token, so the panel follows the gym's chosen accent
// and the console into dark mode.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { ChatLayout } from '@astryxdesign/core/Chat';
import { ChatMessageList } from '@astryxdesign/core/Chat';
import { ChatMessage } from '@astryxdesign/core/Chat';
import { ChatMessageBubble } from '@astryxdesign/core/Chat';
import { ChatComposer } from '@astryxdesign/core/Chat';
import { AgentToolCalls } from './tool-calls';
import { messageParts, prefixConsoleLinks } from './chat-state';
import { Markdown } from '@astryxdesign/core/Markdown';
import { Icon, Btn, Input, Modal, ConfirmDialog } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { useAgentChat } from './use-agent-chat';
import { newSessionId, sessionTitle, useSessions, type AgentSessionMeta } from './use-sessions';
import type { ChatAttachment } from './types';
import { createDateTimeFormat } from '@fit/i18n';

/** Upload limits — keep the model's token cost (and the operator's bill) bounded. */
const MAX_FILES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
/**
 * All files together. Base64 grows them by a third, and the API takes 25 MB of
 * JSON per turn — four 5 MB files would be refused outright.
 */
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

/** Decoded size of a base64 attachment. */
const attachmentBytes = (a: ChatAttachment) => Math.floor((a.data.length * 3) / 4);
const ACCEPT =
  'image/*,application/pdf,text/plain,text/csv,application/json,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,' +
  '.csv,.txt,.json,.xlsx,.xls';

/** Starter prompts on the empty screen, grouped by the agent's tool domains. */
const STARTERS: { id: 'members' | 'classes' | 'sales'; icon: IconName; prompts: string[] }[] = [
  { id: 'members', icon: 'users', prompts: ['first', 'second'] },
  { id: 'classes', icon: 'calendar', prompts: ['first'] },
  { id: 'sales', icon: 'card', prompts: ['first', 'second'] },
];

/** Read a File to a base64 attachment (strips the `data:…;base64,` prefix). */
function readAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: result.slice(result.indexOf(',') + 1),
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

const styles = stylex.create({
  // Launcher — a pill in the gym's accent, with a lighter disc for the spark.
  launcher: {
    position: 'fixed',
    insetBlockEnd: '1.5rem',
    insetInlineEnd: '1.5rem',
    zIndex: 45,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '3rem',
    paddingInlineStart: '0.625rem',
    paddingInlineEnd: '1rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover': 'color-mix(in srgb, var(--color-accent) 88%, var(--color-on-accent))',
    },
    color: 'var(--color-on-accent)',
    boxShadow: 'var(--shadow-high)',
    cursor: 'pointer',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
    fontWeight: 600,
    transition: `transform var(--duration-fast) ${EASE}, opacity var(--duration-fast) ${EASE}`,
    transform: {
      default: 'translateY(0)',
      ':hover': 'translateY(-2px)',
    },
    ':focus-visible': { outline: 'none', boxShadow: 'var(--fc-focus-ring)' },
  },
  launcherHidden: {
    opacity: 0,
    pointerEvents: 'none',
    transform: 'translateY(1rem) scale(0.96)',
  },
  launcherDisc: {
    display: 'grid',
    placeItems: 'center',
    width: '1.75rem',
    height: '1.75rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'color-mix(in srgb, var(--color-on-accent) 18%, transparent)',
    color: 'var(--color-on-accent)',
  },
  launcherIcon: { width: '1rem', height: '1rem' },
  kbd: {
    marginInlineStart: '0.25rem',
    paddingInline: '0.375rem',
    paddingBlock: '0.125rem',
    borderRadius: '0.375rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--color-on-accent) 35%, transparent)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    opacity: 0.75,
  },
  // Scrim behind the panel — subtle, closes on click.
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 48,
    backgroundColor: 'color-mix(in srgb, var(--color-text-primary) 20%, transparent)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    opacity: 0,
    pointerEvents: 'none',
    transition: `opacity var(--duration-medium) ${EASE}`,
  },
  scrimOpen: { opacity: 1, pointerEvents: 'auto' },
  // The floating panel — the console's card surface, radius and margin.
  panel: {
    position: 'fixed',
    insetBlock: '0.5rem',
    insetInlineEnd: '0.5rem',
    zIndex: 49,
    display: 'flex',
    flexDirection: 'column',
    width: 'min(28rem, calc(100vw - 1rem))',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: 'var(--shadow-high)',
    overflow: 'hidden',
    transform: 'translateX(calc(100% + 1rem))',
    transition: `transform var(--duration-medium) ${EASE}`,
  },
  panelOpen: { transform: 'translateX(0)' },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    paddingInline: '1rem',
    paddingBlockStart: '1rem',
    paddingBlockEnd: '0.75rem',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  headerRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  headerBadge: {
    display: 'grid',
    placeItems: 'center',
    width: '2.5rem',
    height: '2.5rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  headerBadgeIcon: { width: '1.25rem', height: '1.25rem' },
  headerText: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    lineHeight: 1.25,
    color: 'var(--color-text-primary)',
  },
  headerStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  statusDot: {
    width: '0.375rem',
    height: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-border-emphasized)',
  },
  statusDotLive: { backgroundColor: 'var(--color-accent)' },
  iconButton: {
    display: 'grid',
    placeItems: 'center',
    width: '2.25rem',
    height: '2.25rem',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--fc-ghost)',
    },
    color: {
      default: 'var(--color-icon-secondary)',
      ':hover': 'var(--color-icon-primary)',
    },
    cursor: 'pointer',
    ':focus-visible': { outline: 'none', boxShadow: 'var(--fc-focus-ring)' },
    ':disabled': { cursor: 'not-allowed', opacity: 0.4 },
  },
  iconButtonActive: {
    backgroundColor: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-primary)',
    },
    color: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-surface)',
    },
  },
  icon16: { width: '1rem', height: '1rem', flexShrink: 0 },
  icon18: { width: '1.125rem', height: '1.125rem', flexShrink: 0 },
  icon14: { width: '0.875rem', height: '0.875rem', flexShrink: 0 },
  // Chat | History segment.
  segment: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    padding: '0.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--fc-ghost)',
  },
  segmentTab: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    height: '2rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'transparent',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: `background-color var(--duration-fast) ${EASE}, box-shadow var(--duration-fast) ${EASE}`,
    ':focus-visible': { outline: 'none', boxShadow: 'var(--fc-focus-ring)' },
  },
  segmentTabOn: {
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    boxShadow: 'var(--shadow-low)',
  },
  body: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  hidden: { display: 'none' },
  // History.
  searchWrap: { paddingInline: '1rem', paddingBlockStart: '0.75rem', paddingBlockEnd: '0.5rem' },
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.5rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus-within': 'var(--color-text-primary)',
    },
    backgroundColor: {
      default: 'var(--fc-tile)',
      ':focus-within': 'var(--color-background-surface)',
    },
    color: 'var(--color-icon-secondary)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.84375rem',
    '::placeholder': { color: 'var(--color-text-disabled)' },
  },
  sessionScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingInline: '0.5rem',
    paddingBlockEnd: '0.75rem',
  },
  sessionList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  groupLabel: {
    margin: 0,
    paddingInline: '0.75rem',
    paddingBlockStart: '1rem',
    paddingBlockEnd: '0.375rem',
    fontSize: '0.71875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  sessionRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    paddingInlineEnd: '0.25rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--fc-tile)',
    },
  },
  sessionRowActive: {
    backgroundColor: {
      default: 'var(--fc-ghost)',
      ':hover': 'var(--fc-ghost)',
    },
  },
  sessionOpen: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1,
    minWidth: 0,
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    textAlign: 'start',
    fontFamily: 'var(--font-family-body)',
    cursor: 'pointer',
    ':focus-visible': { outline: 'none', boxShadow: 'var(--fc-focus-ring)' },
    ':disabled': { cursor: 'not-allowed', opacity: 0.6 },
  },
  sessionTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.84375rem',
    fontWeight: 500,
  },
  sessionTime: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontSize: '0.71875rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  // The "…" button shows while the row is hovered or it has focus, and stays
  // while its menu is open.
  moreHidden: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover')]: 1,
      ':focus-visible': 1,
    },
  },
  moreShown: { opacity: 1 },
  menu: {
    position: 'absolute',
    insetInlineEnd: '0.25rem',
    insetBlockStart: 'calc(100% + 0.25rem)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    minWidth: '12rem',
    width: 'max-content',
    padding: '0.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    boxShadow: 'var(--shadow-high)',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--fc-ghost)',
      ':focus-visible': 'var(--fc-ghost)',
    },
    color: 'var(--color-text-primary)',
    textAlign: 'start',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    outline: 'none',
  },
  menuItemDanger: {
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-red)',
      ':focus-visible': 'var(--color-background-red)',
    },
    color: 'var(--color-text-red)',
  },
  menuIcon: { width: '1rem', height: '1rem', color: 'var(--color-icon-secondary)' },
  menuIconDanger: { color: 'var(--color-icon-red)' },
  // Transcript.
  // The composer floats over the end of the list; this keeps the last card
  // (and the lock hint above the composer) clear of it.
  transcript: { paddingBlockEnd: '8rem' },
  userBubble: {
    borderRadius: '1.125rem',
    borderEndEndRadius: '0.375rem',
    backgroundColor: 'var(--color-text-primary)',
    color: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  agentText: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--color-text-primary)',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem' },
  chipRowEnd: { justifyContent: 'flex-end', marginBlockStart: '0.375rem' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    maxWidth: '14rem',
    paddingInlineStart: '0.5rem',
    paddingInlineEnd: '0.375rem',
    paddingBlock: '0.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--fc-tile)',
    color: 'var(--color-text-primary)',
    fontSize: '0.75rem',
  },
  chipIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
    color: 'var(--color-icon-secondary)',
  },
  chipName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chipRemove: {
    display: 'grid',
    placeItems: 'center',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-border)',
    },
    color: 'var(--color-icon-secondary)',
    cursor: 'pointer',
  },
  chipRemoveIcon: { width: '0.75rem', height: '0.75rem' },
  attachWarn: { fontSize: '0.6875rem', color: 'var(--color-text-red)' },
  // Composer.
  composerWrap: {
    paddingInline: '0.75rem',
    paddingBlockEnd: '0.75rem',
    paddingBlockStart: '0.5rem',
    backgroundColor: 'var(--color-background-surface)',
  },
  lockHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    margin: 0,
    paddingInline: '0.25rem',
    paddingBlockEnd: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  // Astryx's footer row does not shrink its slots, so the hint is capped
  // here — otherwise it pushes the send button past the composer's edge.
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 0,
    maxWidth: 'min(17rem, calc(100vw - 9rem))',
    overflow: 'hidden',
  },
  attachBtn: {
    width: '2rem',
    height: '2rem',
  },
  sendHint: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.6875rem',
    color: 'var(--color-text-disabled)',
  },
  // Error bar above the transcript.
  errorBar: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginInline: '1rem',
    marginBlockStart: '0.75rem',
    padding: '0.625rem 0.75rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-red)',
    color: 'var(--color-text-red)',
    fontSize: '0.8125rem',
    lineHeight: 1.4,
  },
  errorIcon: { width: '1rem', height: '1rem', flexShrink: 0, marginBlockStart: '0.125rem' },
  errorText: { display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 },
  errorNote: { color: 'var(--color-text-secondary)', fontSize: '0.75rem' },
  // Drop-zone overlay shown while a file is dragged over the panel.
  dropOverlay: {
    position: 'absolute',
    inset: '0.5rem',
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-text-primary)',
    backgroundColor: 'color-mix(in srgb, var(--color-background-surface) 90%, transparent)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    color: 'var(--color-text-primary)',
    pointerEvents: 'none',
  },
  dropIcon: { width: '2rem', height: '2rem' },
  dropText: { fontSize: '0.9375rem', fontWeight: 600 },
  // Empty chat.
  // Fills the transcript area so the content starts at the top, as the
  // design has it, rather than centred by the layout.
  empty: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    boxSizing: 'border-box',
    paddingInline: '1.25rem',
    paddingBlockStart: '2rem',
    paddingBlockEnd: '1rem',
  },
  emptyBadge: {
    display: 'grid',
    placeItems: 'center',
    width: '3rem',
    height: '3rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-icon-accent)',
  },
  emptyBadgeIcon: { width: '1.5rem', height: '1.5rem' },
  emptyTitle: {
    marginBlockStart: '0.75rem',
    marginBlockEnd: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    maxWidth: '22rem',
    marginBlockStart: '0.75rem',
    marginBlockEnd: 0,
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  starters: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    marginBlockStart: '1.75rem',
  },
  starterGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  starterLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    margin: 0,
    fontSize: '0.71875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  starterList: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  starter: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    minHeight: '2.75rem',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-text-primary)',
    },
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    textAlign: 'start',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.84375rem',
    cursor: 'pointer',
    transition: `border-color var(--duration-fast) ${EASE}`,
    ':focus-visible': { outline: 'none', boxShadow: 'var(--fc-focus-ring)' },
  },
  starterText: { flex: 1 },
  starterIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    transform: 'rotate(45deg)',
    color: 'var(--color-icon-disabled)',
  },
  approvalNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginBlockStart: '1.5rem',
    marginBlockEnd: 0,
    padding: '0.75rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--fc-tile)',
    fontSize: '0.75rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  approvalNoteIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
    marginBlockStart: '0.125rem',
  },
  emptyHistory: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    minHeight: '12rem',
    color: 'var(--color-text-secondary)',
  },
  emptyHistoryIcon: { width: '1.75rem', height: '1.75rem', color: 'var(--color-icon-disabled)' },
  emptyHistoryText: { fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' },
});

export function AgentChat() {
  const t = useTranslations('admin.agent');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const {
    messages,
    isStreaming,
    error,
    canRetry,
    send,
    stop,
    reset,
    loadTranscript,
    pendingApprovals,
    decide,
    retry,
  } = useAgentChat();
  const { sessions, save: saveSession, remove: removeSession, load: loadSession } = useSessions();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachWarn, setAttachWarn] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const sessionTitleRef = useRef<string | null>(null);
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<AgentSessionMeta | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Nested elements fire dragenter/dragleave; count them so the overlay doesn't flicker.
  const dragDepth = useRef(0);
  // Render client-only: this panel embeds rich client widgets (Astryx Chat) that
  // aren't worth server-rendering and could hydration-mismatch. Skipping SSR keeps
  // the mismatch off every admin page.
  const [mounted, setMounted] = useState(false);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setMounted(true);
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const locked = pendingApprovals.length > 0;
  const status = isStreaming ? 'working' : locked ? 'waiting' : 'ready';

  // Persist the current session whenever a turn settles (not mid-stream).
  useEffect(() => {
    if (isStreaming || messages.length === 0) return;
    if (!sessionIdRef.current) sessionIdRef.current = newSessionId();
    saveSession({
      id: sessionIdRef.current,
      title: sessionTitleRef.current || sessionTitle(messages) || t('untitled'),
      messages,
    });
  }, [messages, isStreaming, saveSession, t]);

  // Start a fresh conversation (keeps the old one saved in history).
  const startNewChat = useCallback(() => {
    sessionIdRef.current = null;
    sessionTitleRef.current = null;
    reset();
    setDraft('');
    setShowHistory(false);
  }, [reset]);

  // Resume a saved session — fetch its transcript, then load it.
  const openSession = useCallback(
    async (session: AgentSessionMeta) => {
      const msgs = await loadSession(session.id);
      if (!msgs) return;
      sessionIdRef.current = session.id;
      sessionTitleRef.current = session.title;
      loadTranscript(msgs);
      setShowHistory(false);
    },
    [loadSession, loadTranscript],
  );

  // Delete a saved session; if it's the open one, clear the transcript.
  const deleteSession = useCallback(
    (id: string) => {
      removeSession(id);
      if (sessionIdRef.current === id) {
        sessionIdRef.current = null;
        sessionTitleRef.current = null;
        reset();
      }
    },
    [removeSession, reset],
  );

  /** Which history group a session's timestamp falls in. */
  const dateGroup = (timestamp: string) => {
    const date = new Date(timestamp).toDateString();
    const today = new Date();
    if (date === today.toDateString()) return 'today';
    today.setDate(today.getDate() - 1);
    return date === today.toDateString() ? 'yesterday' : 'earlier';
  };
  const filteredSessions = sessions.filter((s) =>
    s.title.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale)),
  );

  /** Time for a session from today, the date for anything older. */
  const formatTime = useCallback(
    (ts: string): string => {
      const date = new Date(ts);
      const today = date.toDateString() === new Date().toDateString();
      return createDateTimeFormat(
        locale,
        today ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' },
      ).format(date);
    },
    [locale],
  );

  // Read picked files into base64 attachments, enforcing the count/size caps.
  const onFilesPicked = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0 || pendingApprovals.length || isStreaming) return;
      setAttachWarn('');
      const picked = Array.from(fileList);
      const accepted: ChatAttachment[] = [];
      let rejected = false;
      let total = attachments.reduce((sum, a) => sum + attachmentBytes(a), 0);
      for (const file of picked) {
        if (file.size > MAX_BYTES || total + file.size > MAX_TOTAL_BYTES) {
          rejected = true;
          continue;
        }
        if (attachments.length + accepted.length >= MAX_FILES) {
          rejected = true;
          break;
        }
        try {
          accepted.push(await readAttachment(file));
          total += file.size;
        } catch {
          rejected = true;
        }
      }
      if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
      if (rejected) setAttachWarn(t('attachLimit', { max: MAX_FILES }));
    },
    [attachments, t, pendingApprovals.length, isStreaming],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Drag-and-drop: accept file drops anywhere on the chat panel.
  const hasFiles = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types).includes('Files');

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      setShowHistory(false);
      void onFilesPicked(e.dataTransfer.files);
    },
    [onFilesPicked],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      if (isStreaming || pendingApprovals.length) return;
      // Model is chosen server-side (cheapest available) — no selector in the UI.
      send(value, undefined, attachments.length ? attachments : undefined);
      setDraft('');
      setAttachments([]);
      setAttachWarn('');
    },
    [send, attachments, isStreaming, pendingApprovals.length],
  );

  // ⌘J / Ctrl+J toggles the panel from anywhere in the console.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Escape closes an open session menu first, then the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (menuFor) setMenuFor(null);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, menuFor]);

  // A click anywhere outside the session menu closes it.
  useEffect(() => {
    if (!menuFor) return;
    const onPointer = (e: PointerEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [menuFor]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  // Client-only (see `mounted` above) — nothing renders on the server, so this
  // panel can never cause a hydration mismatch on an admin page.
  if (!mounted) return null;

  const tabs = [
    { id: 'chat', label: t('chat'), icon: 'spark', on: !showHistory },
    { id: 'history', label: t('history'), icon: 'clock', on: showHistory },
  ] as const;

  const emptyState = (
    <div {...stylex.props(styles.empty)}>
      <span {...stylex.props(styles.emptyBadge)} aria-hidden>
        <Icon name="spark" {...stylex.props(styles.emptyBadgeIcon)} />
      </span>
      <h2 {...stylex.props(styles.emptyTitle)}>{t('emptyTitle')}</h2>
      <p {...stylex.props(styles.emptyHint)}>{t('emptyHint')}</p>
      <div {...stylex.props(styles.starters)}>
        {STARTERS.map((group) => (
          <section key={group.id} {...stylex.props(styles.starterGroup)}>
            <h3 {...stylex.props(styles.starterLabel)}>
              <Icon name={group.icon} {...stylex.props(styles.icon14)} />
              {t(`starters.${group.id}.title`)}
            </h3>
            <div {...stylex.props(styles.starterList)}>
              {group.prompts.map((key) => {
                const prompt = t(`starters.${group.id}.${key}`);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    {...stylex.props(styles.starter)}
                  >
                    <span {...stylex.props(styles.starterText)}>{prompt}</span>
                    <Icon name="arrowUp" {...stylex.props(styles.starterIcon)} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p {...stylex.props(styles.approvalNote)}>
        <Icon name="pencil" {...stylex.props(styles.approvalNoteIcon)} />
        {t('approvalNote')}
      </p>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label={t('open')}
        aria-expanded={open}
        aria-keyshortcuts={isMac ? 'Meta+J' : 'Control+J'}
        onClick={() => setOpen(true)}
        {...stylex.props(styles.launcher, open && styles.launcherHidden)}
      >
        <span {...stylex.props(styles.launcherDisc)} aria-hidden>
          <Icon name="spark" {...stylex.props(styles.launcherIcon)} />
        </span>
        <span>{t('launcher')}</span>
        <kbd {...stylex.props(styles.kbd)} aria-hidden>
          {isMac ? '⌘J' : 'Ctrl J'}
        </kbd>
      </button>

      <div
        aria-hidden={!open}
        onClick={close}
        {...stylex.props(styles.scrim, open && styles.scrimOpen)}
      />

      <aside
        role="dialog"
        aria-modal="false"
        aria-label={t('title')}
        aria-hidden={!open}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        {...stylex.props(styles.panel, open && styles.panelOpen)}
      >
        {dragging && (
          <div {...stylex.props(styles.dropOverlay)} aria-hidden>
            <Icon name="download" {...stylex.props(styles.dropIcon)} />
            <span {...stylex.props(styles.dropText)}>{t('dropHere')}</span>
          </div>
        )}
        <header {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.headerRow)}>
            <span {...stylex.props(styles.headerBadge)} aria-hidden>
              <Icon name="spark" {...stylex.props(styles.headerBadgeIcon)} />
            </span>
            <span {...stylex.props(styles.headerText)}>
              <span {...stylex.props(styles.headerTitle)}>{t('title')}</span>
              <span role="status" {...stylex.props(styles.headerStatus)}>
                <span
                  {...stylex.props(styles.statusDot, status !== 'ready' && styles.statusDotLive)}
                  aria-hidden
                />
                {status === 'working'
                  ? t('statusWorking')
                  : status === 'waiting'
                    ? t('statusWaiting')
                    : t('subtitle')}
              </span>
            </span>
            <button
              type="button"
              aria-label={t('newChat')}
              title={t('newChat')}
              onClick={startNewChat}
              {...stylex.props(styles.iconButton)}
            >
              <Icon name="plus" {...stylex.props(styles.icon18)} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={t('close')}
              title={t('close')}
              onClick={close}
              {...stylex.props(styles.iconButton)}
            >
              <Icon name="x" {...stylex.props(styles.icon18)} />
            </button>
          </div>
          <div role="tablist" aria-label={t('title')} {...stylex.props(styles.segment)}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.on}
                onClick={() => setShowHistory(tab.id === 'history')}
                {...stylex.props(styles.segmentTab, tab.on && styles.segmentTabOn)}
              >
                <Icon name={tab.icon} {...stylex.props(styles.icon14)} />
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {showHistory ? (
          <div role="tabpanel" {...stylex.props(styles.body)}>
            <div {...stylex.props(styles.searchWrap)}>
              <label {...stylex.props(styles.search)}>
                <Icon name="search" {...stylex.props(styles.icon16)} />
                <input
                  aria-label={t('searchSessions')}
                  placeholder={t('searchSessions')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  {...stylex.props(styles.searchInput)}
                />
              </label>
            </div>
            <div {...stylex.props(styles.sessionScroll)}>
              {filteredSessions.length === 0 ? (
                <div {...stylex.props(styles.emptyHistory)}>
                  <Icon name="clock" {...stylex.props(styles.emptyHistoryIcon)} />
                  <span {...stylex.props(styles.emptyHistoryText)}>
                    {t(sessions.length ? 'noSearchResults' : 'noSessions')}
                  </span>
                </div>
              ) : (
                <ul {...stylex.props(styles.sessionList)}>
                  {filteredSessions.map((s, index) => {
                    const active = sessionIdRef.current === s.id;
                    const menuOpen = menuFor === s.id;
                    return (
                      <li key={s.id}>
                        {(index === 0 ||
                          dateGroup(filteredSessions[index - 1]!.updatedAt) !==
                            dateGroup(s.updatedAt)) && (
                          <h3 {...stylex.props(styles.groupLabel)}>{t(dateGroup(s.updatedAt))}</h3>
                        )}
                        <div
                          {...stylex.props(
                            stylex.defaultMarker(),
                            styles.sessionRow,
                            active && styles.sessionRowActive,
                          )}
                        >
                          <button
                            type="button"
                            disabled={isStreaming || sessionBusy}
                            aria-current={active ? 'true' : undefined}
                            onClick={() => void openSession(s)}
                            {...stylex.props(styles.sessionOpen)}
                          >
                            {active ? (
                              <span
                                {...stylex.props(styles.statusDot, styles.statusDotLive)}
                                aria-hidden
                              />
                            ) : null}
                            <span {...stylex.props(styles.sessionTitle)}>
                              {s.title || t('untitled')}
                            </span>
                            <span {...stylex.props(styles.sessionTime)}>
                              {formatTime(s.updatedAt)}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={t('more')}
                            title={t('more')}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            disabled={isStreaming || sessionBusy}
                            onClick={() => setMenuFor(menuOpen ? null : s.id)}
                            {...stylex.props(
                              styles.iconButton,
                              menuOpen ? styles.moreShown : styles.moreHidden,
                              menuOpen && styles.iconButtonActive,
                            )}
                          >
                            <Icon name="more" {...stylex.props(styles.icon18)} />
                          </button>
                          {menuOpen ? (
                            <div ref={menuRef} role="menu" {...stylex.props(styles.menu)}>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setMenuFor(null);
                                  setRenaming(s);
                                  setRenameTitle(s.title);
                                }}
                                {...stylex.props(styles.menuItem)}
                              >
                                <Icon name="pencil" {...stylex.props(styles.menuIcon)} />
                                {t('rename')}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setMenuFor(null);
                                  setDeleting(s.id);
                                }}
                                {...stylex.props(styles.menuItem, styles.menuItemDanger)}
                              >
                                <Icon
                                  name="trash"
                                  {...stylex.props(styles.menuIcon, styles.menuIconDanger)}
                                />
                                {t('deleteSession')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        <div role="tabpanel" {...stylex.props(styles.body, showHistory && styles.hidden)}>
          {error && (
            <div role="alert" {...stylex.props(styles.errorBar)}>
              <Icon name="alert" {...stylex.props(styles.errorIcon)} />
              <span {...stylex.props(styles.errorText)}>
                {error}
                {!canRetry && <span {...stylex.props(styles.errorNote)}>{t('retryUnsafe')}</span>}
              </span>
              {canRetry && (
                <Btn size="sm" v="outline" disabled={isStreaming} onClick={retry}>
                  {t('retry')}
                </Btn>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              void onFilesPicked(e.target.files);
              e.target.value = '';
            }}
          />
          <ChatLayout
            density="compact"
            composer={
              <div {...stylex.props(styles.composerWrap)}>
                {locked ? (
                  <p {...stylex.props(styles.lockHint)}>
                    <span {...stylex.props(styles.statusDot, styles.statusDotLive)} aria-hidden />
                    {t('lockedHint')}
                  </p>
                ) : null}
                <ChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSubmit={handleSubmit}
                  onStop={stop}
                  isStopShown={isStreaming}
                  isDisabled={!open || locked}
                  placeholder={t('placeholder')}
                  footerActions={
                    <span {...stylex.props(styles.footer)}>
                      <button
                        type="button"
                        aria-label={t('attach')}
                        title={t('attach')}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isStreaming || locked}
                        {...stylex.props(styles.iconButton, styles.attachBtn)}
                      >
                        <Icon name="paperclip" {...stylex.props(styles.icon18)} />
                      </button>
                      <span {...stylex.props(styles.sendHint)}>{t('sendHint')}</span>
                    </span>
                  }
                  drawer={
                    attachments.length > 0 || attachWarn ? (
                      <div {...stylex.props(styles.chipRow)}>
                        {attachments.map((a, i) => (
                          <span key={`${a.name}-${i}`} {...stylex.props(styles.chip)}>
                            <Icon name="file" {...stylex.props(styles.chipIcon)} />
                            <span {...stylex.props(styles.chipName)}>{a.name}</span>
                            <button
                              type="button"
                              aria-label={t('removeAttachment')}
                              onClick={() => removeAttachment(i)}
                              {...stylex.props(styles.chipRemove)}
                            >
                              <Icon name="x" {...stylex.props(styles.chipRemoveIcon)} />
                            </button>
                          </span>
                        ))}
                        {attachWarn && (
                          <span {...stylex.props(styles.attachWarn)}>{attachWarn}</span>
                        )}
                      </div>
                    ) : undefined
                  }
                />
              </div>
            }
            emptyState={emptyState}
          >
            {messages.length > 0 && (
              <ChatMessageList xstyle={styles.transcript} isStreaming={isStreaming}>
                {messages.map((m) => (
                  <ChatMessage key={m.id} sender={m.role}>
                    {m.role === 'assistant' ? (
                      messageParts(m).map((part, index) =>
                        part.kind === 'tools' ? (
                          <AgentToolCalls
                            key={index}
                            calls={part.calls}
                            busy={isStreaming}
                            decide={decide}
                          />
                        ) : (
                          <ChatMessageBubble key={index} variant="ghost" xstyle={styles.agentText}>
                            <Markdown isStreaming={m.streaming}>
                              {prefixConsoleLinks(
                                part.text,
                                process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '',
                              )}
                            </Markdown>
                          </ChatMessageBubble>
                        ),
                      )
                    ) : (
                      <>
                        {m.content ? (
                          <ChatMessageBubble variant="filled" xstyle={styles.userBubble}>
                            {m.content}
                          </ChatMessageBubble>
                        ) : null}
                        {m.attachments && m.attachments.length > 0 && (
                          <span {...stylex.props(styles.chipRow, styles.chipRowEnd)}>
                            {m.attachments.map((name, i) => (
                              <span key={`${name}-${i}`} {...stylex.props(styles.chip)}>
                                <Icon name="file" {...stylex.props(styles.chipIcon)} />
                                <span {...stylex.props(styles.chipName)}>{name}</span>
                              </span>
                            ))}
                          </span>
                        )}
                      </>
                    )}
                  </ChatMessage>
                ))}
              </ChatMessageList>
            )}
          </ChatLayout>
        </div>
      </aside>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteSession(deleting);
          setDeleting(null);
        }}
        title={t('deleteSession')}
        message={t('deleteConfirm')}
        confirmLabel={t('deleteSession')}
        cancelLabel={t('cancel')}
        danger
      />
      <Modal
        open={renaming !== null}
        onClose={() => {
          if (!sessionBusy) setRenaming(null);
        }}
        title={t('rename')}
        footer={
          <Btn
            disabled={sessionBusy || !renameTitle.trim()}
            onClick={() => {
              if (!renaming) return;
              setSessionBusy(true);
              setSessionError(false);
              void loadSession(renaming.id)
                .then((saved) => {
                  if (!saved) {
                    setSessionError(true);
                    return;
                  }
                  const title = renameTitle.trim();
                  if (sessionIdRef.current === renaming.id) sessionTitleRef.current = title;
                  saveSession({ id: renaming.id, title, messages: saved });
                  setRenaming(null);
                })
                .finally(() => setSessionBusy(false));
            }}
          >
            {t('save')}
          </Btn>
        }
      >
        <Input
          aria-label={t('sessionTitle')}
          value={renameTitle}
          onChange={(e) => setRenameTitle(e.target.value)}
        />
        {sessionError && <p role="alert">{t('error')}</p>}
      </Modal>
    </>
  );
}
