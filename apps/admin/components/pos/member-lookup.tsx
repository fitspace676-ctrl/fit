'use client';

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  lookupPosMembersAction,
  resolvePosMemberByQrAction,
  type PosMemberRow,
} from '@/app/(dashboard)/pos/actions';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';

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

const styles = stylex.create({
  selectedChip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  infoCol: {
    minWidth: 0,
  },
  selectedName: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  selectedContact: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  removeBtn: {
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-surface)',
    },
    cursor: 'pointer',
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  searchRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  searchWrap: {
    position: 'relative',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  searchInput: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  scanBtn: {
    display: 'inline-flex',
    height: '2.75rem',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
    },
    backgroundColor: 'transparent',
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
    cursor: 'pointer',
  },
  scanIcon: {
    width: '1rem',
    height: '1rem',
  },
  walkIn: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  alertCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  alertIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  alertText: {
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
  warningCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-warning)',
    backgroundColor: 'var(--color-warning-muted)',
  },
  warningIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-warning)',
  },
  warningText: {
    fontSize: '0.75rem',
    color: 'var(--color-warning)',
  },
  videoFrame: {
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  video: {
    height: '10rem',
    width: '100%',
    backgroundColor: '#000',
    objectFit: 'cover',
  },
  resultList: {
    maxHeight: '14rem',
    overflowY: 'auto',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  resultItem: {
    borderTopWidth: {
      default: '1px',
      ':first-child': '0',
    },
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  resultBtn: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.125rem',
    borderWidth: 0,
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    textAlign: 'left',
    cursor: 'pointer',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  resultName: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  resultContact: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

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
      <div {...stylex.props(styles.selectedChip)}>
        <div {...stylex.props(styles.infoCol)}>
          <p {...stylex.props(styles.selectedName)}>{selectedMember.name}</p>
          <p {...stylex.props(styles.selectedContact)}>
            {selectedMember.phone ?? selectedMember.email}
          </p>
        </div>
        <button type="button" onClick={() => onSelect(null)} {...stylex.props(styles.removeBtn)}>
          {t('remove')}
        </button>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.searchRow)}>
        <div {...stylex.props(styles.searchWrap)}>
          <label htmlFor="pos-member-search" {...stylex.props(styles.srOnly)}>
            {t('searchLabel')}
          </label>
          <input
            ref={searchRef}
            id="pos-member-search"
            type="search"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('searchPlaceholder')}
            {...stylex.props(styles.searchInput)}
          />
        </div>
        <button
          type="button"
          onClick={() => (scanState === 'scanning' ? stopScan() : void startScan())}
          {...stylex.props(styles.scanBtn)}
        >
          <Icon name="qr" {...stylex.props(styles.scanIcon)} sw={2} />
          {scanState === 'scanning' ? t('stopScan') : t('scan')}
        </button>
      </div>

      <p {...stylex.props(styles.walkIn)}>{t('walkIn')}</p>

      {error ? (
        <Card variant="default" padding={0} role="alert" xstyle={styles.alertCard}>
          <Icon name="info" {...stylex.props(styles.alertIcon)} />
          <span {...stylex.props(styles.alertText)}>{error}</span>
        </Card>
      ) : null}

      {scanState === 'unsupported' ? (
        <Card variant="default" padding={0} xstyle={styles.warningCard}>
          <Icon name="info" {...stylex.props(styles.warningIcon)} />
          <span {...stylex.props(styles.warningText)}>{t('scanUnsupported')}</span>
        </Card>
      ) : null}

      {scanState === 'scanning' ? (
        <div {...stylex.props(styles.videoFrame)}>
          <video ref={videoRef} {...stylex.props(styles.video)} muted playsInline />
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul {...stylex.props(styles.resultList)}>
          {results.map((member) => (
            <li key={member.id} {...stylex.props(styles.resultItem)}>
              <button
                type="button"
                onClick={() => pick(member)}
                {...stylex.props(styles.resultBtn)}
              >
                <span {...stylex.props(styles.resultName)}>{member.name}</span>
                <span {...stylex.props(styles.resultContact)}>{member.phone ?? member.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
