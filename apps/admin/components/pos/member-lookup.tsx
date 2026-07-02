'use client';

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import {
  lookupPosMembersAction,
  resolvePosMemberByQrAction,
  type PosMemberRow,
} from '@/app/(dashboard)/pos/actions';
import { Avatar, Btn, Icon } from '@/components/ui';
import { PosIcon } from './pos-icons';

/** Debounce (ms) before a keystroke fires a new member lookup. */
const LOOKUP_DEBOUNCE_MS = 250;

/** Minimal shape of the experimental `BarcodeDetector` we rely on for QR scanning. */
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Render a member's initials for the avatar placeholder (no photo yet — T4.3). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** A member avatar — the photo when one exists, initials on the engine gradient otherwise. */
function MemberAvatar({ member, ring = false }: { member: PosMemberRow; ring?: boolean }) {
  if (member.photoUrl) {
    return <Avatar src={member.photoUrl} ring={ring} size="h-10 w-10" />;
  }
  return (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)] font-display text-xs font-bold text-white ${
        ring ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950' : ''
      }`}
    >
      {initialsOf(member.name)}
    </span>
  );
}

/**
 * Member attach for the sale — the member / walk-in row at the head of the cart
 * card, plus the right-hand "Attach member" drawer it opens. The drawer runs a
 * debounced search over the gym roster (name / phone / email, up to ten matches);
 * picking a row attaches the sale to that member. A "Scan QR" button opens the
 * device camera and decodes the member's check-in QR via the Web Barcode
 * Detection API (with a graceful message where it isn't supported). Walk-in is
 * the default — no member is required to sell.
 *
 * State (the attached member) lives in the cart store via the `selectedMember` /
 * `onSelect` props the board threads through, so the cart and lookup never
 * drift; the drawer's `open` state is the board's too, so `F2` / `Esc` work.
 */
export function MemberLookup({
  searchRef,
  selectedMember,
  onSelect,
  open,
  onOpenChange,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  selectedMember: PosMemberRow | null;
  onSelect: (member: PosMemberRow | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosMemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'unsupported'>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (query.trim() === '') {
      setResults([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const result = await lookupPosMembersAction(query);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setResults(result.data);
        setError(null);
      } else {
        setResults([]);
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function onQueryChange(value: string): void {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => setQuery(value), LOOKUP_DEBOUNCE_MS);
  }

  /** Close the drawer (the open-state effect below releases the camera + search). */
  function close(): void {
    onOpenChange(false);
  }

  function pick(member: PosMemberRow): void {
    onSelect(member);
    close();
  }

  /** Tear down the camera stream and leave scan mode. */
  function stopScan(): void {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanState('idle');
  }

  // Always release the camera when the component unmounts.
  useEffect(() => stopScan, []);

  // However the drawer closes (pick, backdrop, the board's Esc), release the
  // camera and reset the search so the next open starts clean.
  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setScanState('idle');
      setQuery('');
      setResults([]);
    }
  }, [open]);

  async function startScan(): Promise<void> {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setScanState('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanState('scanning');
      const detector = new Detector({ formats: ['qr_code'] });
      const video = videoRef.current;
      if (!video) {
        stopScan();
        return;
      }
      video.srcObject = stream;
      await video.play();

      // Poll frames until a QR decodes or the operator cancels.
      const tick = async (): Promise<void> => {
        if (!streamRef.current) {
          return;
        }
        try {
          const codes = await detector.detect(video);
          const raw = codes[0]?.rawValue;
          if (raw) {
            stopScan();
            const result = await resolvePosMemberByQrAction(raw);
            if (result.ok && result.data) {
              pick(result.data);
            } else if (result.ok) {
              setError('Scanned code did not match any member.');
            } else {
              setError(result.error);
            }
            return;
          }
        } catch {
          // Transient decode failure on a frame — keep polling.
        }
        requestAnimationFrame(() => void tick());
      };
      requestAnimationFrame(() => void tick());
    } catch {
      stopScan();
      setError('Could not access the camera.');
    }
  }

  const trimmed = query.trim();

  return (
    <>
      {/* Member / walk-in row at the head of the cart card */}
      <div className="border-b border-ink-200 p-3.5 dark:border-white/10">
        {selectedMember ? (
          <div className="flex items-center gap-3">
            <MemberAvatar member={selectedMember} ring />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                {selectedMember.name}
              </p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                {[selectedMember.planName, selectedMember.phone ?? selectedMember.email]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              aria-label="Remove member"
              className="grid h-8 w-8 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <Icon name="x" className="h-4 w-4" sw={2.2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="flex w-full items-center gap-3 rounded-btn px-1 py-1 text-left transition hover:bg-ink-50 dark:hover:bg-white/5"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-50 text-ink-500 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:text-ink-300 dark:ring-white/10">
              <Icon name="user" className="h-5 w-5" sw={2} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink-900 dark:text-white">Walk-in sale</p>
              <p className="text-xs text-ink-500 dark:text-ink-400">Attach a member →</p>
            </div>
            <PosIcon name="userPlus" className="h-5 w-5 text-brand-400" sw={2} />
          </button>
        )}
      </div>

      {/* Attach-member drawer */}
      {open ? (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Attach member"
        >
          <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={close} />
          <div className="absolute bottom-0 right-0 top-0 w-full max-w-md overflow-y-auto bg-white shadow-[0_0_120px_-20px_rgba(0,0,0,0.9)] ring-1 ring-inset ring-ink-200 dark:bg-ink-900/95 dark:ring-white/10 dark:backdrop-blur-xl">
            <div className="sticky top-0 z-10 border-b border-ink-200 bg-white/90 px-5 pb-4 pt-5 backdrop-blur-xl dark:border-white/10 dark:bg-ink-900/80">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white">
                  Attach member
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Icon name="x" className="h-5 w-5" sw={2.2} />
                </button>
              </div>
              <div className="relative mt-3">
                <label htmlFor="pos-member-search" className="sr-only">
                  Look up a member by name or phone (F2)
                </label>
                <Icon
                  name="search"
                  className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 dark:text-ink-500"
                  sw={2}
                />
                <input
                  ref={searchRef}
                  id="pos-member-search"
                  type="search"
                  autoFocus
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Search by name or phone…"
                  className="h-11 w-full rounded-field bg-ink-50 pl-11 pr-4 text-sm text-ink-900 outline-none ring-1 ring-inset ring-ink-200 transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500"
                />
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Btn
                  v="primary"
                  size="sm"
                  icon="qr"
                  onClick={() => (scanState === 'scanning' ? stopScan() : void startScan())}
                  className="flex-1"
                >
                  {scanState === 'scanning' ? 'Stop' : 'Scan QR'}
                </Btn>
                <Btn
                  v="outline"
                  size="sm"
                  onClick={() => {
                    onSelect(null);
                    close();
                  }}
                  className="flex-1"
                >
                  Walk-in
                </Btn>
              </div>
            </div>

            <div className="space-y-1 p-2.5">
              {error ? (
                <p
                  role="alert"
                  className="px-2.5 py-2 text-xs text-danger-700 dark:text-danger-300"
                >
                  {error}
                </p>
              ) : null}

              {scanState === 'unsupported' ? (
                <p className="px-2.5 py-2 text-xs text-warning-800 dark:text-warning-200">
                  QR scanning isn’t supported on this device/browser. Search by name or phone
                  instead.
                </p>
              ) : null}

              {scanState === 'scanning' ? (
                <div className="overflow-hidden rounded-card ring-1 ring-inset ring-ink-200 dark:ring-white/10">
                  <video
                    ref={videoRef}
                    className="h-40 w-full bg-black object-cover"
                    muted
                    playsInline
                  />
                </div>
              ) : null}

              {results.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-ink-500 dark:text-ink-400">
                    {trimmed === ''
                      ? 'Type a name or phone to find a member.'
                      : `No members match “${trimmed}”.`}
                  </p>
                </div>
              ) : (
                results.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => pick(member)}
                    className="flex w-full items-center gap-3 rounded-card p-2.5 text-left transition hover:bg-ink-50 dark:hover:bg-white/5"
                  >
                    <MemberAvatar member={member} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                        {member.name}
                      </p>
                      <p className="truncate font-mono text-xs text-ink-500 dark:text-ink-400">
                        {member.phone ?? member.email}
                      </p>
                    </div>
                    {member.planName ? (
                      <p className="shrink-0 text-right text-[11px] text-ink-400 dark:text-ink-500">
                        {member.planName}
                      </p>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
