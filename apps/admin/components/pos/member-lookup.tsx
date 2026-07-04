'use client';

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import {
  lookupPosMembersAction,
  resolvePosMemberByQrAction,
  type PosMemberRow,
} from '@/app/(dashboard)/pos/actions';
import { Card, Icon } from '@/components/ui';

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

/**
 * Member lookup + QR scan (top of the right column). A debounced search over the
 * gym roster (name / phone / email) drops down up to ten matches; picking one
 * attaches the sale to that member. A "Scan QR" button opens the device camera
 * and decodes the member's check-in QR via the Web Barcode Detection API (with a
 * graceful message where it isn't supported). Walk-in is the default — no member
 * is required to sell.
 *
 * State (the attached member) lives in the cart store via the `selectedMember` /
 * `onSelect` props the board threads through, so the cart and lookup never drift.
 */
export function MemberLookup({
  searchRef,
  selectedMember,
  onSelect,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  selectedMember: PosMemberRow | null;
  onSelect: (member: PosMemberRow | null) => void;
}) {
  const t = useTranslations('admin.pos.member');
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

  function pick(member: PosMemberRow): void {
    onSelect(member);
    setQuery('');
    setResults([]);
    if (searchRef.current) {
      searchRef.current.value = '';
    }
  }

  /** Tear down the camera stream and leave scan mode. */
  function stopScan(): void {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanState('idle');
  }

  // Always release the camera when the component unmounts.
  useEffect(() => stopScan, []);

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
              onSelect(result.data);
            } else if (result.ok) {
              setError(t('noMatch'));
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
      setError(t('cameraError'));
    }
  }

  if (selectedMember) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-brand-200 bg-brand-50 px-3 py-2 dark:border-brand-500/30 dark:bg-brand-500/10">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
            {selectedMember.name}
          </p>
          <p className="truncate text-xs text-ink-500 dark:text-ink-400">
            {selectedMember.phone ?? selectedMember.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="shrink-0 rounded-btn px-2 py-1 text-xs font-medium text-ink-600 hover:bg-white dark:text-ink-300 dark:hover:bg-white/10"
        >
          {t('remove')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="pos-member-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <input
            ref={searchRef}
            id="pos-member-search"
            type="search"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-11 w-full rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={() => (scanState === 'scanning' ? stopScan() : void startScan())}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-btn border border-ink-200 px-3.5 text-sm font-medium text-ink-700 hover:border-brand-400 hover:text-brand-700 dark:border-white/10 dark:text-ink-200 dark:hover:border-brand-500/60 dark:hover:text-brand-300"
        >
          <Icon name="qr" className="h-4 w-4" sw={2} />
          {scanState === 'scanning' ? t('stopScan') : t('scan')}
        </button>
      </div>

      <p className="text-xs text-ink-400">{t('walkIn')}</p>

      {error ? (
        <Card
          role="alert"
          className="flex items-center gap-2 p-3 text-xs text-danger-700 dark:text-danger-300"
        >
          <Icon name="info" className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Card>
      ) : null}

      {scanState === 'unsupported' ? (
        <Card className="flex items-center gap-2 p-3 text-xs text-warning-800 dark:text-warning-200">
          <Icon name="info" className="h-4 w-4 shrink-0" />
          <span>{t('scanUnsupported')}</span>
        </Card>
      ) : null}

      {scanState === 'scanning' ? (
        <div className="overflow-hidden rounded-card border border-ink-200 dark:border-white/10">
          <video ref={videoRef} className="h-40 w-full bg-black object-cover" muted playsInline />
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul className="max-h-56 overflow-y-auto rounded-card border border-ink-200 dark:border-white/10">
          {results.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => pick(member)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-ink-100 px-3 py-2 text-left last:border-b-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
              >
                <span className="text-sm font-medium text-ink-900 dark:text-white">
                  {member.name}
                </span>
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  {member.phone ?? member.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
