'use client';

// @fit/admin — AI Agent chat (Phase 1: shell + streaming transcript).
//
// A right-edge launcher button that opens a side panel styled after the console
// sidebar (the same `--color-background-surface` panel, `--radius-container`
// corners, floating margin, and high shadow). Inside sits an Astryx `ChatLayout`
// transcript with a composer; turns stream in over NDJSON from
// `/api/agent/chat` via `useAgentChat`.
//
// The panel is the operator's copilot: the transcript, tool-call chrome, and
// streaming plumbing are driven by the Claude/Gemini + MCP runtime — the agent
// reads and edits every part of the fitness admin through MCP tools, and this
// panel shows each action. A model selector lets the operator switch between the
// configured providers (cheapest first).

import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { ChatLayout } from '@astryxdesign/core/Chat';
import { ChatMessageList } from '@astryxdesign/core/Chat';
import { ChatMessage } from '@astryxdesign/core/Chat';
import { ChatMessageBubble } from '@astryxdesign/core/Chat';
import { ChatComposer } from '@astryxdesign/core/Chat';
import { ChatToolCalls } from '@astryxdesign/core/Chat';
import { Markdown } from '@astryxdesign/core/Markdown';
import { Icon } from '@/components/ui';
import { useAgentChat } from './use-agent-chat';
import { newSessionId, sessionTitle, useSessions, type AgentSessionMeta } from './use-sessions';
import type { ChatAttachment } from './types';

/** Upload limits — keep the model's token cost (and the operator's bill) bounded. */
const MAX_FILES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT =
  'image/*,application/pdf,text/plain,text/csv,application/json,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,' +
  '.csv,.txt,.json,.xlsx,.xls';

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

const styles = stylex.create({
  // Right-edge launcher — a floating pill that echoes the sidebar surface.
  launcher: {
    position: 'fixed',
    insetBlockEnd: '1.5rem',
    insetInlineEnd: '1.5rem',
    zIndex: 45,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minHeight: '3rem',
    paddingInline: '1rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    boxShadow: 'var(--shadow-high)',
    cursor: 'pointer',
    fontFamily: 'var(--font-family-body)',
    fontSize: '0.875rem',
    fontWeight: 650,
    transition:
      'transform var(--duration-fast) var(--ease-standard), opacity var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)',
    transform: {
      default: 'translateY(0)',
      ':hover': 'translateY(-2px)',
    },
  },
  launcherHidden: {
    opacity: 0,
    pointerEvents: 'none',
    transform: 'translateY(1rem) scale(0.96)',
  },
  launcherIcon: {
    width: '1.25rem',
    height: '1.25rem',
    color: 'var(--color-accent)',
  },
  // Scrim behind the panel — subtle, closes on click.
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 48,
    backgroundColor: 'color-mix(in srgb, var(--color-background-body) 40%, transparent)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity var(--duration-medium) var(--ease-standard)',
  },
  scrimOpen: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  // The floating panel — mirrors the sidebar's surface + margin + radius.
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
    transition: 'transform var(--duration-medium) var(--ease-standard)',
  },
  panelOpen: {
    transform: 'translateX(0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    paddingInline: '1rem',
    paddingBlock: '0.875rem',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  headerBadge: {
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  headerBadgeIcon: {
    width: '1.125rem',
    height: '1.125rem',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    lineHeight: 1.2,
  },
  headerSubtitle: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  headerButton: {
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    cursor: 'pointer',
  },
  headerButtonActive: {
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  headerButtonIcon: {
    width: '1rem',
    height: '1rem',
  },
  // Saved-session history list.
  sessionList: {
    listStyle: 'none',
    margin: 0,
    padding: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '0.25rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
  },
  sessionOpen: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    padding: '0.5rem 0.625rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'transparent',
    textAlign: 'start',
    cursor: 'pointer',
  },
  sessionTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  sessionTime: {
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  sessionDelete: {
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'transparent',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-red)',
    },
    cursor: 'pointer',
  },
  // Composer footer attach button, inline in the input.
  attachBtn: {
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
    flexShrink: 0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: {
      default: 'var(--color-background-body)',
      ':hover': 'var(--color-overlay-hover)',
    },
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    cursor: 'pointer',
  },
  attachIcon: {
    width: '1rem',
    height: '1rem',
  },
  // Attachment chips, shown in the composer drawer above the input.
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    maxWidth: '100%',
    paddingInlineStart: '0.5rem',
    paddingInlineEnd: '0.25rem',
    paddingBlock: '0.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    fontSize: '0.75rem',
  },
  chipName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '10rem',
  },
  chipRemove: {
    display: 'grid',
    placeItems: 'center',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  },
  chipRemoveIcon: {
    width: '0.75rem',
    height: '0.75rem',
  },
  attachWarn: {
    fontSize: '0.6875rem',
    color: 'var(--color-text-red)',
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  hidden: {
    display: 'none',
  },
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
    borderColor: 'var(--color-accent)',
    backgroundColor: 'color-mix(in srgb, var(--color-background-surface) 88%, transparent)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    color: 'var(--color-text-accent)',
    pointerEvents: 'none',
  },
  dropIcon: {
    width: '2rem',
    height: '2rem',
  },
  dropText: {
    fontSize: '0.9375rem',
    fontWeight: 650,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    height: '100%',
    paddingInline: '2rem',
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
  },
  emptyIcon: {
    width: '2rem',
    height: '2rem',
    color: 'var(--color-accent)',
  },
  emptyTitle: {
    fontSize: '0.9375rem',
    fontWeight: 650,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    fontSize: '0.8125rem',
    lineHeight: 1.5,
  },
  errorBar: {
    marginInline: '1rem',
    marginBlockEnd: '0.5rem',
    padding: '0.5rem 0.75rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-error-muted)',
    color: 'var(--color-text-red)',
    fontSize: '0.75rem',
  },
});

export function AgentChat() {
  const t = useTranslations('admin.agent');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { messages, isStreaming, error, send, stop, reset, loadTranscript } = useAgentChat();
  const { sessions, save: saveSession, remove: removeSession, load: loadSession } = useSessions();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachWarn, setAttachWarn] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Nested elements fire dragenter/dragleave; count them so the overlay doesn't flicker.
  const dragDepth = useRef(0);

  const close = useCallback(() => setOpen(false), []);

  // Persist the current session whenever a turn settles (not mid-stream).
  useEffect(() => {
    if (isStreaming || messages.length === 0) return;
    if (!sessionIdRef.current) sessionIdRef.current = newSessionId();
    saveSession({
      id: sessionIdRef.current,
      title: sessionTitle(messages) || t('untitled'),
      messages,
    });
  }, [messages, isStreaming, saveSession, t]);

  // Start a fresh conversation (keeps the old one saved in history).
  const startNewChat = useCallback(() => {
    sessionIdRef.current = null;
    reset();
    setShowHistory(false);
  }, [reset]);

  // Resume a saved session — fetch its transcript, then load it.
  const openSession = useCallback(
    async (session: AgentSessionMeta) => {
      const msgs = await loadSession(session.id);
      if (!msgs) return;
      sessionIdRef.current = session.id;
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
        reset();
      }
    },
    [removeSession, reset],
  );

  /** Short localized timestamp for a session row. */
  const formatTime = useCallback(
    (ts: string): string =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ts)),
    [locale],
  );

  // Read picked files into base64 attachments, enforcing the count/size caps.
  const onFilesPicked = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setAttachWarn('');
      const picked = Array.from(fileList);
      const accepted: ChatAttachment[] = [];
      let rejected = false;
      for (const file of picked) {
        if (file.size > MAX_BYTES) {
          rejected = true;
          continue;
        }
        if (attachments.length + accepted.length >= MAX_FILES) {
          rejected = true;
          break;
        }
        accepted.push(await readAttachment(file));
      }
      if (accepted.length) setAttachments((prev) => [...prev, ...accepted]);
      if (rejected) setAttachWarn(t('attachLimit', { max: MAX_FILES }));
    },
    [attachments.length, t],
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
      // Model is chosen server-side (cheapest available) — no selector in the UI.
      send(value, undefined, attachments.length ? attachments : undefined);
      setAttachments([]);
      setAttachWarn('');
    },
    [send, attachments],
  );

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={t('open')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        {...stylex.props(styles.launcher, open && styles.launcherHidden)}
      >
        <Icon name="spark" {...stylex.props(styles.launcherIcon)} />
        <span>{t('launcher')}</span>
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
          <span {...stylex.props(styles.headerBadge)} aria-hidden>
            <Icon name="spark" {...stylex.props(styles.headerBadgeIcon)} />
          </span>
          <span {...stylex.props(styles.headerText)}>
            <span {...stylex.props(styles.headerTitle)}>{t('title')}</span>
            <span {...stylex.props(styles.headerSubtitle)}>{t('subtitle')}</span>
          </span>
          <button
            type="button"
            aria-label={t('history')}
            aria-pressed={showHistory}
            onClick={() => setShowHistory((v) => !v)}
            {...stylex.props(styles.headerButton, showHistory && styles.headerButtonActive)}
          >
            <Icon name="clock" {...stylex.props(styles.headerButtonIcon)} />
          </button>
          <button
            type="button"
            aria-label={t('newChat')}
            onClick={startNewChat}
            {...stylex.props(styles.headerButton)}
          >
            <Icon name="plus" {...stylex.props(styles.headerButtonIcon)} />
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={t('close')}
            onClick={close}
            {...stylex.props(styles.headerButton)}
          >
            <Icon name="x" {...stylex.props(styles.headerButtonIcon)} />
          </button>
        </header>

        {showHistory ? (
          <div {...stylex.props(styles.body)}>
            {sessions.length === 0 ? (
              <div {...stylex.props(styles.empty)}>
                <Icon name="clock" {...stylex.props(styles.emptyIcon)} />
                <span {...stylex.props(styles.emptyTitle)}>{t('noSessions')}</span>
              </div>
            ) : (
              <ul {...stylex.props(styles.sessionList)}>
                {sessions.map((s) => (
                  <li key={s.id} {...stylex.props(styles.sessionRow)}>
                    <button
                      type="button"
                      onClick={() => void openSession(s)}
                      {...stylex.props(styles.sessionOpen)}
                    >
                      <span {...stylex.props(styles.sessionTitle)}>{s.title || t('untitled')}</span>
                      <span {...stylex.props(styles.sessionTime)}>{formatTime(s.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t('deleteSession')}
                      onClick={() => deleteSession(s.id)}
                      {...stylex.props(styles.sessionDelete)}
                    >
                      <Icon name="trash" {...stylex.props(styles.headerButtonIcon)} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div {...stylex.props(styles.body, showHistory && styles.hidden)}>
          {error && <div {...stylex.props(styles.errorBar)}>{t('error')}</div>}
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
              <ChatComposer
                onSubmit={handleSubmit}
                onStop={stop}
                isStopShown={isStreaming}
                isDisabled={!open}
                placeholder={t('placeholder')}
                footerActions={
                  <button
                    type="button"
                    aria-label={t('attach')}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    {...stylex.props(styles.attachBtn)}
                  >
                    <Icon name="plus" {...stylex.props(styles.attachIcon)} />
                  </button>
                }
                drawer={
                  attachments.length > 0 || attachWarn ? (
                    <div {...stylex.props(styles.chipRow)}>
                      {attachments.map((a, i) => (
                        <span key={`${a.name}-${i}`} {...stylex.props(styles.chip)}>
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
                      {attachWarn && <span {...stylex.props(styles.attachWarn)}>{attachWarn}</span>}
                    </div>
                  ) : undefined
                }
              />
            }
            emptyState={
              <div {...stylex.props(styles.empty)}>
                <Icon name="spark" {...stylex.props(styles.emptyIcon)} />
                <span {...stylex.props(styles.emptyTitle)}>{t('emptyTitle')}</span>
                <span {...stylex.props(styles.emptyHint)}>{t('emptyHint')}</span>
              </div>
            }
          >
            {messages.length > 0 && (
              <ChatMessageList>
                {messages.map((m) => (
                  <ChatMessage key={m.id} sender={m.role}>
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <ChatToolCalls
                        calls={m.toolCalls.map((c) => ({
                          key: c.id,
                          name: c.name,
                          status: c.status,
                          target: c.target,
                          errorMessage: c.errorMessage,
                        }))}
                      />
                    )}
                    <ChatMessageBubble variant={m.role === 'user' ? 'filled' : 'ghost'}>
                      {m.role === 'assistant' ? (
                        <Markdown isStreaming={m.streaming}>{m.content}</Markdown>
                      ) : (
                        m.content
                      )}
                      {m.attachments && m.attachments.length > 0 && (
                        <span {...stylex.props(styles.chipRow)}>
                          {m.attachments.map((name, i) => (
                            <span key={`${name}-${i}`} {...stylex.props(styles.chip)}>
                              <Icon name="pin" {...stylex.props(styles.chipRemoveIcon)} />
                              <span {...stylex.props(styles.chipName)}>{name}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </ChatMessageBubble>
                  </ChatMessage>
                ))}
              </ChatMessageList>
            )}
          </ChatLayout>
        </div>
      </aside>
    </>
  );
}
