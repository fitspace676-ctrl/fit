'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PlatformMessages } from '@fit/i18n/platform';
import type { FeaturePageCopy } from '@/data/feature-pages';
import { FlowBackground } from '@/components/ui/flow-background';
import { COVER_SURFACE } from './cover-surface';
import { Reveal } from '@/components/ui/scroll-reveal';
import { cn } from '@/lib/utils';
import { messageList } from '@/lib/messages';
import { getFeatures } from '@/data/features';
import { Link } from '@/src/i18n/navigation';
import { useLeadCta } from './lead-cta-context';
import { Aurora, Btn, CtaMark, I, Icon, MarketingFooter, MarketingNav } from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore - feature page, "Editorial" template
   The long-form /features/<slug> page. Reads one `FeaturePageCopy` record:
   a full-bleed photo hero under a brand-blue overlay with the chapter index
   along its foot, the intro set as a pull-quote, the feature blocks as a
   numbered index (sticky number + title on the left, copy, a figure of the
   real product and the notes scrolling on the right), the plan note, and a
   closing photo band that bookends the hero.

   The product figures are not part of the copy record: they live in
   `FIGURES` below, keyed by slug, one per block; their captions and the text
   on the illustrative product slices come from `features.editorial` in the
   catalogue. A page with no entry there still renders, just without figures.
   ──────────────────────────────────────────────────────────────────────── */

/* ── product imagery ─────────────────────────────────────────────────── */

/** Named crops keep screenshot coordinates out of the figure compositions. */
type Shot = { light: string; dark: string; w: number; h: number };
const SHOTS = {
  phone: { light: '/hero/app-light.webp', dark: '/hero/app-dark.webp', w: 360, h: 780 },
  members: { light: '/tour/members-light.webp', dark: '/tour/members-dark.webp', w: 1600, h: 1000 },
};
const CROPS = {
  memberPlans: [374, 284, 1196, 156],
  // the card's own edges, 1px in, so no screen background shows at the corners
  membership: [20, 347, 320, 237],
} satisfies Record<string, [number, number, number, number]>;
type Layer = {
  shot: Shot;
  crop?: keyof typeof CROPS;
  frame: 'card' | 'pill' | 'phone' | 'browser';
  url?: string;
  radius?: string;
  className: string;
};
type SliceKind =
  | 'billing'
  | 'brand'
  | 'schedule'
  | 'booking'
  | 'waitlist'
  | 'training'
  | 'checkin'
  | 'sale'
  | 'history'
  | 'shop'
  | 'notifications'
  | 'location'
  | 'dashboard'
  | 'reports'
  | 'roles'
  | 'ask'
  | 'insight'
  | 'suggest'
  | 'aiAccess';
/** A figure's composition; its caption is `editorial.figures.<slug>.<index>` in the catalogue. */
type Figure = { layers?: Layer[]; slice?: SliceKind };
const FIGURES: Record<string, Figure[]> = {
  'member-portal': [
    {
      layers: [
        {
          shot: SHOTS.phone,
          crop: 'membership',
          frame: 'card',
          // the card's ~25px corners, as a share of the 320x237 crop
          radius: 'rounded-[8.5%/11.5%]',
          className: 'left-[8%] top-[34%] w-[48%] z-20',
        },
        {
          shot: SHOTS.members,
          crop: 'memberPlans',
          frame: 'card',
          className: 'right-[5%] top-[9%] w-[82%] z-10',
        },
      ],
    },
    { slice: 'booking' },
    { slice: 'billing' },
    { slice: 'brand' },
  ],
  'booking-scheduling': [
    { slice: 'schedule' },
    { slice: 'booking' },
    { slice: 'waitlist' },
    { slice: 'training' },
  ],
  'reception-pos': [
    { slice: 'checkin' },
    { slice: 'sale' },
    { slice: 'history' },
    { slice: 'shop' },
  ],
  'mobile-app': [
    { slice: 'brand' },
    { slice: 'booking' },
    { slice: 'billing' },
    { slice: 'notifications' },
    { slice: 'location' },
  ],
  'analytics-reporting': [
    { slice: 'dashboard' },
    { slice: 'reports' },
    { slice: 'roles' },
    { slice: 'ask' },
  ],
  'ai-assistant': [
    { slice: 'ask' },
    { slice: 'insight' },
    { slice: 'suggest' },
    { slice: 'aiAccess' },
  ],
};

/** The illustrative product slices' text, as it sits in the catalogue. */
type SliceCopy = PlatformMessages['features']['editorial']['slices'];

function ProductSlice({
  kind,
  bookingPage = false,
  receptionPage = false,
  mobilePage = false,
  analyticsPage = false,
  aiPage = false,
}: {
  kind: SliceKind;
  bookingPage?: boolean;
  receptionPage?: boolean;
  mobilePage?: boolean;
  analyticsPage?: boolean;
  aiPage?: boolean;
}) {
  const t = useTranslations('features.editorial');
  const locale = useLocale();
  const georgianBooking = locale === 'ka' && bookingPage;
  const georgianReception = locale === 'ka' && receptionPage;
  const georgianMobile = locale === 'ka' && mobilePage;
  const georgianAnalytics = locale === 'ka' && analyticsPage;
  const georgianAi = locale === 'ka' && aiPage;
  const brand = t.raw(
    mobilePage ? 'mobileApp.brand' : 'brand',
  ) as PlatformMessages['features']['editorial']['brand'];
  if (kind === 'brand')
    return (
      <div className="relative mx-auto w-full max-w-[34rem] sm:min-h-[25rem]">
        <div className="absolute right-[6%] top-0 hidden w-[33%] sm:block">
          <FigureLayer layer={{ shot: SHOTS.phone, frame: 'phone', className: 'relative' }} />
        </div>
        <div className="relative z-20 rounded-2xl bg-panel p-6 text-fg shadow-2xl sm:top-14 sm:w-[60%]">
          <p className="font-mono text-xs uppercase tracking-widest text-faint">{brand.title}</p>
          <div className="mt-5 flex items-center gap-3">
            <img src="/FormaCore-icon.png" width={44} height={44} alt="" className="rounded-xl" />
            <div>
              <p className="font-semibold">{georgianMobile ? brand.fileLabel : brand.file}</p>
              <p className="text-xs text-muted">{georgianMobile ? brand.file : brand.fileLabel}</p>
            </div>
          </div>
          <p className="mt-5 text-sm font-semibold">{brand.colour}</p>
          <div className="mt-3 flex gap-3">
            {['#E0483E', '#1A7FD6', '#12B76A', '#151926'].map((color) => (
              <span
                key={color}
                className="h-7 w-7 rounded-full ring-1 ring-overlay/15"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <p className="mt-5 text-sm font-semibold">{brand.covers}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['member-portal', 'booking-scheduling', 'mobile-app'].map((slug) => (
              <img
                key={slug}
                src={`/features/${slug}-hero.webp`}
                alt=""
                width={96}
                height={64}
                className="aspect-[3/2] w-full rounded-lg object-cover"
              />
            ))}
          </div>
        </div>
      </div>
    );
  const slices = t.raw('slices') as SliceCopy;
  const bookingSlices = t.raw(
    'bookingScheduling.slices',
  ) as PlatformMessages['features']['editorial']['bookingScheduling']['slices'];
  const receptionSlices = t.raw(
    'receptionPos.slices',
  ) as PlatformMessages['features']['editorial']['receptionPos']['slices'];
  const mobileSlices = t.raw(
    'mobileApp.slices',
  ) as PlatformMessages['features']['editorial']['mobileApp']['slices'];
  const analyticsSlices = t.raw(
    'analyticsReporting.slices',
  ) as PlatformMessages['features']['editorial']['analyticsReporting']['slices'];
  const aiSlices = t.raw(
    'aiAssistant.slices',
  ) as PlatformMessages['features']['editorial']['aiAssistant']['slices'];
  const data =
    aiPage && kind in aiSlices
      ? aiSlices[kind as keyof typeof aiSlices]
      : analyticsPage && kind in analyticsSlices
        ? analyticsSlices[kind as keyof typeof analyticsSlices]
        : mobilePage && kind in mobileSlices
          ? mobileSlices[kind as keyof typeof mobileSlices]
          : receptionPage && kind in receptionSlices
            ? receptionSlices[kind as keyof typeof receptionSlices]
            : bookingPage && kind in bookingSlices
              ? bookingSlices[kind as keyof typeof bookingSlices]
              : slices[kind];
  const columns = 'columns' in data ? messageList(data.columns as Record<string, string>) : [];
  const rows = messageList(data.rows).map((row) => messageList(row));
  return (
    <div className="mx-auto w-full max-w-[34rem] overflow-hidden rounded-2xl bg-panel text-fg shadow-[0_30px_60px_-24px_rgba(2,11,46,0.75)]">
      <div className="border-b border-overlay/10 p-5 sm:p-7">
        <p className="font-mono text-[11px] uppercase tracking-widest text-faint">{data.eyebrow}</p>
        <p className="mt-3 font-display text-2xl font-bold sm:text-3xl">{data.title}</p>
      </div>
      <div className="px-5 sm:px-7">
        {(georgianBooking || georgianReception) && columns.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-overlay/10 py-3 text-xs text-faint">
            {columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
        )}
        {rows.map(([label = '', detail = '', value = ''], rowIndex) => (
          <div
            key={label + detail}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-overlay/10 py-4 text-sm last:border-0"
          >
            {georgianAi ? (
              <>
                {label && <span className="w-full font-medium">{label}</span>}
                <p className="w-full text-muted">{detail}</p>
                {kind !== 'ask' && value && (
                  <span className="rounded-md bg-brand-500/10 px-2 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                    {value}
                  </span>
                )}
              </>
            ) : georgianAnalytics ? (
              <>
                <span className="font-medium">{label}</span>
                {kind === 'dashboard' || kind === 'reports' ? (
                  <span className="text-muted">{[detail, value].join(' · ')}</span>
                ) : (
                  <div className="w-full text-muted">
                    <p>{detail}</p>
                    {kind !== 'ask' && value && <p>{value}</p>}
                  </div>
                )}
              </>
            ) : georgianMobile && (kind !== 'booking' || rowIndex === 0) ? (
              <>
                <span className="font-medium">
                  {kind === 'location'
                    ? [label, detail, value].join(' · ')
                    : kind === 'booking'
                      ? [label, detail].join(' · ')
                      : kind === 'notifications' && rowIndex === 0
                        ? [label, detail].join(' ')
                        : label}
                </span>
                {kind !== 'location' && (
                  <span className="text-muted">
                    {kind === 'billing' || (kind === 'notifications' && rowIndex > 0)
                      ? [detail, value].join(' · ')
                      : value}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-muted">
                  {georgianBooking && kind === 'waitlist' && rowIndex === 2 ? null : label}
                </span>
                <span className="font-medium">{detail}</span>
                <span
                  className={cn(
                    value &&
                      'rounded-md bg-brand-500/10 px-2 py-1 text-xs font-semibold text-brand-700 dark:text-brand-300',
                  )}
                >
                  {value}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-start gap-3 border-t border-overlay/10 bg-brand-500/5 p-5 text-sm text-strong sm:px-7">
        <Icon d={I.bell} c="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        {(georgianMobile || georgianAnalytics) &&
        'noteTitle' in data &&
        typeof data.noteTitle === 'string' ? (
          <div>
            <p className="font-semibold">{data.noteTitle}</p>
            <p>{data.note}</p>
          </div>
        ) : (
          data.note
        )}
      </div>
    </div>
  );
}

/** A crop of a shot at its own aspect ratio, light and dark swapped by the `.dark` class. */
function Slice({ shot, crop }: { shot: Shot; crop?: Layer['crop'] }) {
  const [x, y, cw, ch] = crop ? CROPS[crop] : [0, 0, shot.w, shot.h];
  const img: CSSProperties = {
    position: 'absolute',
    maxWidth: 'none',
    width: `${(shot.w / cw) * 100}%`,
    left: `${(-x / cw) * 100}%`,
    top: `${(-y / ch) * 100}%`,
  };
  return (
    <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${cw} / ${ch}` }}>
      {(['light', 'dark'] as const).map((theme) => (
        <img
          key={theme}
          src={shot[theme]}
          alt=""
          width={shot.w}
          height={shot.h}
          loading="lazy"
          decoding="async"
          draggable={false}
          style={img}
          className={cn(
            'h-auto select-none',
            theme === 'light' ? 'dark:hidden' : 'hidden dark:block',
          )}
        />
      ))}
    </div>
  );
}

function FigureLayer({ layer, secondary = false }: { layer: Layer; secondary?: boolean }) {
  const slice = <Slice shot={layer.shot} crop={layer.crop} />;
  const shadow = 'shadow-[0_30px_60px_-24px_rgba(2,11,46,0.75)]';
  let framed: ReactNode;
  if (layer.frame === 'phone') {
    framed = (
      <div
        className={cn(
          'rounded-[14%/6.5%] bg-gradient-to-br from-[#3a3f47] via-[#15171b] to-[#2c3037] p-[3%] ring-1 ring-inset ring-white/20',
          shadow,
        )}
      >
        <div className="relative overflow-hidden rounded-[11%/5%] bg-black">
          {slice}
          <span className="absolute left-1/2 top-[1.4%] h-[2.6%] w-[28%] -translate-x-1/2 rounded-full bg-black" />
        </div>
      </div>
    );
  } else if (layer.frame === 'browser') {
    framed = (
      <div className={cn('overflow-hidden rounded-xl bg-[#0b1630] ring-1 ring-white/20', shadow)}>
        <div className="flex h-8 items-center gap-3 border-b border-white/10 bg-white/[0.08] px-3.5">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57] ring-1 ring-inset ring-black/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E] ring-1 ring-inset ring-black/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840] ring-1 ring-inset ring-black/15" />
          </span>
          {layer.url && (
            <span className="truncate rounded-md bg-white/10 px-3 py-0.5 font-mono text-[10px] text-white/70 sm:text-[11px]">
              {layer.url}
            </span>
          )}
        </div>
        {slice}
      </div>
    );
  } else {
    framed = (
      <div
        className={cn(
          'overflow-hidden ring-1 ring-black/5 dark:ring-white/10',
          layer.frame === 'pill'
            ? 'rounded-pill'
            : (layer.radius ?? 'rounded-[clamp(0.5rem,1.6vw,1rem)]'),
          shadow,
        )}
      >
        {slice}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'sm:absolute',
        layer.className,
        secondary
          ? 'hidden sm:block'
          : 'relative max-sm:!left-auto max-sm:!top-auto max-sm:!w-full',
      )}
    >
      {framed}
    </div>
  );
}

/** The deep-blue plate a figure's layers sit on, with its numbered caption. */
function FigurePlate({
  figure,
  caption,
  n,
  bookingPage,
  receptionPage,
  mobilePage,
  analyticsPage,
  aiPage,
}: {
  figure: Figure;
  caption: string;
  n: string;
  bookingPage?: boolean;
  receptionPage?: boolean;
  mobilePage?: boolean;
  analyticsPage?: boolean;
  aiPage?: boolean;
}) {
  const t = useTranslations('features.editorial');
  return (
    <figure>
      <div className="relative isolate p-5 sm:p-8 sm:min-h-[25rem] overflow-hidden rounded-[1.25rem] bg-[linear-gradient(150deg,#071a45_0%,#0a3a86_55%,#1570BF_100%)] ring-1 ring-inset ring-white/10 sm:rounded-[1.75rem]">
        {/* a hairline grid, the blueprint the product slices sit on */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_30%_20%,black,transparent_75%)]"
        />
        {figure.slice ? (
          <ProductSlice
            kind={figure.slice}
            bookingPage={bookingPage}
            receptionPage={receptionPage}
            mobilePage={mobilePage}
            analyticsPage={analyticsPage}
            aiPage={aiPage}
          />
        ) : (
          <div className="sm:aspect-[16/11]">
            {figure.layers?.map((layer, i) => (
              <FigureLayer key={i} layer={layer} secondary={i > 0} />
            ))}
          </div>
        )}
      </div>
      <figcaption className="mt-4 flex items-baseline gap-3 text-sm leading-snug text-faint">
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">
          {t(
            aiPage
              ? 'aiAssistant.fig'
              : analyticsPage
                ? 'analyticsReporting.fig'
                : mobilePage
                  ? 'mobileApp.fig'
                  : 'fig',
            {
              n,
            },
          )}
        </span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/* ── small pieces ────────────────────────────────────────────────────── */

const pad = (i: number): string => String(i + 1).padStart(2, '0');

/** The three plans a feature note lists; labels at `editorial.tiers.<id>`. */
const TIERS = [
  { id: 'studio', plan: 'Studio' },
  { id: 'club', plan: 'Club' },
  { id: 'core', plan: 'Core' },
] as const;

function PricingLink({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const t = useTranslations('features.editorial');
  return (
    <Link
      href="/pricing"
      className={cn(
        'group inline-flex h-[3.25rem] items-center gap-2 rounded-btn px-4 text-[15px] font-semibold outline-none focus-visible:ring-4',
        onDark
          ? 'text-white hover:bg-white/10 focus-visible:ring-white/30'
          : 'text-fg hover:bg-overlay/[0.06] focus-visible:ring-overlay/30',
        className,
      )}
    >
      {t('seePricing')}
      <span className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none">
        <Icon d={I.arrow} c="h-[18px] w-[18px]" />
      </span>
    </Link>
  );
}

/** The gym photo under the brand overlay, shared by the hero and the closing band. */
function PhotoBackdrop({ src, settle }: { src: string; settle: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-[#061433]">
      <img
        src={src}
        alt=""
        width={1080}
        height={675}
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-transform duration-[2400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          settle ? 'scale-100' : 'scale-[1.08] motion-reduce:scale-100',
        )}
      />
      <div className="absolute inset-0 bg-[#0B5CC4] mix-blend-color" />
      {/* deep navy on the type side, opening to sky blue */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(3,12,38,0.95)_0%,rgba(5,26,74,0.88)_36%,rgba(11,74,160,0.62)_70%,rgba(26,127,214,0.42)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(3,12,38,0.9)_0%,rgba(3,12,38,0)_45%)]" />
    </div>
  );
}

/* ── the page ────────────────────────────────────────────────────────── */

export function FeaturePageEditorial({ page }: { page: FeaturePageCopy }) {
  const t = useTranslations('features');
  const tCommon = useTranslations('common');
  const openLead = useLeadCta();
  const figures = FIGURES[page.slug] ?? [];
  // Icon, panel gradient and highlights come from the feature's nav entry.
  const feature = getFeatures(t).find((f) => f.slug === page.slug);
  const bookingPage = page.slug === 'booking-scheduling';
  const receptionPage = page.slug === 'reception-pos';
  const mobilePage = page.slug === 'mobile-app';
  const analyticsPage = page.slug === 'analytics-reporting';
  const aiPage = page.slug === 'ai-assistant';
  const editorialPage = bookingPage || receptionPage || mobilePage || analyticsPage || aiPage;
  const editorialKey = aiPage
    ? 'aiAssistant'
    : analyticsPage
      ? 'analyticsReporting'
      : mobilePage
        ? 'mobileApp'
        : receptionPage
          ? 'receptionPos'
          : 'bookingScheduling';
  const georgianEditorial = useLocale() === 'ka' && editorialPage;
  const highlights = editorialPage
    ? messageList(t.raw(`editorial.${editorialKey}.highlights`) as Record<string, string>)
    : feature?.highlights;
  const inside = editorialPage
    ? t(`editorial.${editorialKey}.inside`)
    : t('editorial.inside', { name: page.eyebrow });
  const parts = editorialPage
    ? t(`editorial.${editorialKey}.parts`, { count: page.blocks.length })
    : t('editorial.parts', { count: page.blocks.length });

  // Each block's reading progress, drawn as a hairline under its sticky title.
  const blockRefs = useRef<(HTMLElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const vh = window.innerHeight;
      blockRefs.current.forEach((el, i) => {
        const bar = barRefs.current[i];
        if (!el || !bar) return;
        const r = el.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (vh * 0.55 - r.top) / Math.max(1, r.height - vh * 0.2)));
        bar.style.transform = `scaleX(${p})`;
      });
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="relative overflow-x-clip bg-surface font-sans text-fg antialiased selection:bg-brand-500/30">
      <Aurora />
      <MarketingNav active="features" />

      {/* ── hero: the landing's cover card over drifting light and waves ── */}
      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10 pt-12 lg:pt-16 pb-12">
        <div
          className="relative isolate overflow-hidden rounded-[2rem] p-7 ring-1 ring-inset ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.65)] sm:p-10 md:p-14"
          style={COVER_SURFACE}
        >
          <FlowBackground />

          <div className="relative">
            <h1 className="max-w-3xl font-display text-3xl font-black leading-[1.03] tracking-tight text-white sm:text-4xl md:text-[3.25rem]">
              {page.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
              {page.subline}
            </p>

            <div className="mt-7 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={() => openLead('demo')}
                className="inline-flex h-11 items-center gap-2 rounded-btn bg-white px-5 text-sm font-semibold text-neutral-900 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] transition hover:bg-white/90 active:bg-white/80"
              >
                {tCommon('cta.bookFreeDemo')}
              </button>
              <PricingLink onDark className="max-sm:-ml-4" />
            </div>

            {highlights && (
              <ul className="mt-10 flex flex-wrap gap-2.5">
                {highlights.map((h) => (
                  <li
                    key={h}
                    className="inline-flex items-center gap-2 rounded-pill bg-white/10 py-2 pl-2.5 pr-4 text-sm font-medium text-white ring-1 ring-inset ring-white/20"
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-brand-700">
                      <Icon d={I.check} c="h-3 w-3" sw={3} />
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="relative">
        {/* ── intro: the pull-quote ── */}
        <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 py-24 lg:px-10 lg:py-36">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-9 lg:col-start-4">
              <Reveal delay={80}>
                <blockquote className="relative font-display text-[clamp(2.125rem,5.2vw,4.5rem)] font-black leading-[1] tracking-[-0.03em] text-fg">
                  <span
                    aria-hidden
                    className="absolute -top-[0.08em] right-full mr-[0.12em] hidden text-brand-500 lg:block"
                  >
                    &ldquo;
                  </span>
                  {page.intro.headline}
                </blockquote>
              </Reveal>
              <Reveal delay={160}>
                <div className="mt-10 grid gap-6 lg:mt-14 lg:grid-cols-9">
                  <p
                    className={cn(
                      (bookingPage || georgianEditorial) && 'whitespace-pre-line',
                      'text-lg leading-relaxed text-muted first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:font-display first-letter:text-[4.25rem] first-letter:font-black first-letter:leading-[0.8] first-letter:text-brand-600 dark:first-letter:text-brand-300 lg:col-span-7 lg:col-start-3 lg:text-xl',
                    )}
                  >
                    {page.intro.body}
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── the feature index ── */}
        <section
          aria-label={inside}
          className="relative z-10 mx-auto w-full max-w-[1180px] px-6 lg:px-10"
        >
          <div className="flex items-end justify-between gap-6 pb-6">
            <h2 className="font-display text-2xl font-black tracking-tight sm:text-3xl">
              {inside}
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-faint">
              {parts}
            </span>
          </div>

          {page.blocks.map((b, i) => {
            const n = pad(i);
            const figure = figures[i];
            return (
              <article
                key={b.title}
                id={`feature-${n}`}
                ref={(el) => {
                  blockRefs.current[i] = el;
                }}
                className="grid scroll-mt-8 gap-8 border-t border-overlay/15 py-14 lg:grid-cols-12 lg:gap-12 lg:py-24"
              >
                {/* sticky number + title */}
                <div className="lg:col-span-4">
                  <div className="lg:sticky lg:top-12">
                    <div className="flex items-end gap-5 lg:block">
                      <span className="font-display text-[clamp(4.5rem,10vw,9.5rem)] font-black leading-[0.78] tracking-[-0.05em] text-brand-600 dark:text-brand-300">
                        {n}
                      </span>
                      <div className="pb-1 lg:mt-8 lg:pb-0">
                        <h3 className="font-display text-xl font-extrabold leading-tight tracking-tight sm:text-2xl">
                          {b.title}
                        </h3>
                      </div>
                    </div>
                    <span className="mt-6 hidden h-px w-full max-w-[16rem] overflow-hidden bg-overlay/15 lg:block">
                      <span
                        ref={(el) => {
                          barRefs.current[i] = el;
                        }}
                        className="block h-full w-full origin-left scale-x-0 bg-brand-500"
                      />
                    </span>
                  </div>
                </div>

                {/* copy, figure, notes */}
                <div className="min-w-0 lg:col-span-8">
                  <Reveal>
                    <h4 className="max-w-[22ch] font-display text-[clamp(1.875rem,3.6vw,3.125rem)] font-black leading-[1.02] tracking-[-0.025em]">
                      {b.headline}
                    </h4>
                    <p
                      className={cn(
                        'mt-6 max-w-[60ch] text-base leading-relaxed text-muted sm:text-lg',
                        (mobilePage || analyticsPage || aiPage) &&
                          georgianEditorial &&
                          'whitespace-pre-line',
                      )}
                    >
                      {b.body}
                    </p>
                  </Reveal>

                  {figure && (
                    <Reveal delay={80} className="mt-10 lg:mt-12">
                      <FigurePlate
                        figure={figure}
                        bookingPage={bookingPage}
                        receptionPage={receptionPage}
                        mobilePage={mobilePage}
                        analyticsPage={analyticsPage}
                        aiPage={aiPage}
                        caption={t(`editorial.figures.${page.slug}.${i}`)}
                        n={n}
                      />
                    </Reveal>
                  )}

                  <Reveal delay={120}>
                    <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-3">
                      {b.bullets.map((point) => (
                        <li key={point} className="border-t border-overlay/15 pt-4">
                          <p className="text-[15px] leading-relaxed text-strong">{point}</p>
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                </div>
              </article>
            );
          })}
        </section>

        {/* ── the plan note ── */}
        <section className="relative z-10 mx-auto w-full max-w-[1180px] px-6 py-20 lg:px-10 lg:py-28">
          <Reveal>
            <div className="rounded-[1.75rem] bg-[linear-gradient(135deg,#071a45,#0a3a86)] p-6 text-white sm:p-10 lg:p-14">
              <div className="grid gap-10 lg:grid-cols-2">
                <div>
                  <h2 className="font-display text-3xl font-black leading-tight sm:text-4xl">
                    {page.plan.headline}
                  </h2>
                  <p
                    className={cn(
                      'mt-5 text-base leading-relaxed text-white/80',
                      (bookingPage || georgianEditorial) && 'whitespace-pre-line',
                    )}
                  >
                    {page.plan.body}
                  </p>
                  <PricingLink onDark className="-ml-4 mt-4" />
                </div>
                {page.plans && (
                  <ul className="grid content-center gap-3">
                    {georgianEditorial && (
                      <li className="text-lg font-semibold">
                        {t(`editorial.${editorialKey}.planLabel`)}
                      </li>
                    )}
                    {TIERS.map((tier) => {
                      const included = page.plans?.includes(tier.plan);
                      return (
                        <li
                          key={tier.id}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-xl p-5',
                            included
                              ? 'bg-white text-ink-900'
                              : 'bg-white/5 text-white/60 ring-1 ring-inset ring-white/15',
                          )}
                        >
                          <span className="font-display text-xl font-bold">
                            {t(`editorial.tiers.${tier.id}`)}
                          </span>
                          <span className="flex items-center gap-2 text-xs font-semibold">
                            <Icon d={included ? I.check : I.minus} c="h-4 w-4" />
                            {included ? t('editorial.included') : t('editorial.notIncluded')}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </Reveal>
        </section>
      </div>

      {/* ── closing band: the photo again, bookending the hero ── */}
      <section className="relative z-10 px-3 pb-16 sm:px-6 lg:pb-24">
        <Reveal>
          <div className="relative isolate mx-auto max-w-[1400px] overflow-hidden rounded-[1.5rem] text-white sm:rounded-[2rem]">
            <PhotoBackdrop src={page.heroImage} settle />
            <CtaMark />
            <div className="relative mx-auto max-w-[1180px] px-6 py-20 sm:px-10 lg:px-16 lg:py-28">
              <img
                src="/FormaCore-icon.png"
                alt=""
                width={64}
                height={64}
                className="h-11 w-11 rounded-xl shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)]"
              />
              <h2 className="mt-8 max-w-[18ch] font-display text-[clamp(2.25rem,5.4vw,4.5rem)] font-black leading-[0.98] tracking-[-0.03em]">
                {page.footerCta.headline}
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
                {page.footerCta.subline}
              </p>
              <div className="mt-9 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                <Btn v="onBlue" size="lg" icon={I.arrow} onClick={() => openLead('demo')}>
                  {tCommon('cta.bookFreeDemo')}
                </Btn>
                <PricingLink onDark className="max-sm:-ml-4" />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <MarketingFooter />
    </div>
  );
}

export default FeaturePageEditorial;
