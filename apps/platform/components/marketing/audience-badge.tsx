'use client';

import { useTranslations } from 'next-intl';
import type { AudiencePage } from '@/data/built-for';
import { cn } from '@/lib/utils';
import { Icon } from './icons';

/**
 * The audience label on a dark brand panel (the homepage stack cards and the
 * /built-for hero): the audience icon in a white disc with a soft brand glow,
 * then its name, on a frosted pill with a light top edge.
 */
export function AudienceBadge({
  audience,
  cover = false,
}: {
  audience: Pick<AudiencePage, 'name' | 'icon'>;
  cover?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex w-fit shrink-0 items-center gap-2.5 overflow-hidden rounded-pill py-1 pl-1 pr-4 ring-1 ring-inset ring-white/25 backdrop-blur-md',
        cover
          ? 'bg-[#102B43]/25 shadow-[0_10px_30px_-12px_rgba(16,43,67,0.7)]'
          : 'bg-gradient-to-r from-white/[0.22] to-white/[0.06] shadow-[0_10px_30px_-12px_rgba(2,11,46,0.7)]',
      )}
    >
      {/* light catching the top edge */}
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white',
          cover
            ? 'shadow-[0_0_0_4px_rgba(127,179,200,0.18),0_4px_14px_-4px_rgba(47,120,150,0.8)]'
            : 'shadow-[0_0_0_4px_rgba(124,196,255,0.18),0_4px_14px_-4px_rgba(26,127,214,0.8)]',
        )}
      >
        <Icon
          d={audience.icon}
          c={cn('h-4 w-4', cover ? 'text-[#2F7896]' : 'text-brand-700')}
          sw={2}
        />
      </span>
      <span
        className={cn(
          'text-white',
          cover
            ? 'text-xs font-mono uppercase tracking-[0.12em]'
            : 'text-sm font-semibold tracking-tight',
        )}
      >
        {audience.name}
      </span>
    </span>
  );
}

/**
 * A slice of the product on a dark brand panel: one of the audience's own stats
 * (the same figure the panel's stat strip prints) on a card with a live bar
 * chart, and the win-back notification that the automation sends. Crisp product
 * surfaces rather than decoration. The bars are illustrative motion, not data:
 * they carry no numbers. Decorative for assistive tech; hidden on narrow
 * screens, where the copy needs the width.
 */
export function AudienceEmblem({
  audience,
  cover = false,
}: {
  audience: Pick<AudiencePage, 'icon' | 'stats'>;
  cover?: boolean;
}) {
  const t = useTranslations('common.emblem');
  // Lead with a percentage when the audience has one; it reads best on a chart.
  const stat = audience.stats.find((x) => x.value.includes('%')) ?? audience.stats[0];
  if (!stat) return null;
  const bars = [42, 50, 46, 58, 55, 64, 61, 70, 68, 78, 84, 92];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-10 top-1/2 hidden w-[19rem] -translate-y-[62%] select-none md:block lg:right-14"
    >
      {/* stat card */}
      <div
        className={cn(
          'rounded-2xl p-5 text-ink-900 ring-1 ring-black/5',
          cover
            ? 'bg-[#F4F8FA] shadow-[0_30px_60px_-24px_rgba(16,43,67,0.65)]'
            : 'bg-white shadow-[0_30px_60px_-24px_rgba(2,11,46,0.65)]',
        )}
      >
        <div className="font-display text-4xl font-black tracking-tight">{stat.value}</div>
        <p className="mt-1 text-xs leading-snug text-ink-500">{stat.label}</p>
        <div className="mt-4 flex h-16 items-end gap-1.5">
          {bars.map((h, i) => (
            <span
              key={i}
              className={`flex-1 origin-bottom rounded-[3px] motion-safe:animate-[bar-pulse_2.8s_ease-in-out_infinite] ${
                cover
                  ? i === bars.length - 1
                    ? 'bg-[#2F7896]'
                    : 'bg-[#7FB3C8]/70'
                  : i === bars.length - 1
                    ? 'bg-brand-500'
                    : 'bg-brand-100'
              }`}
              style={{ height: `${h}%`, animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>

      {/* notification */}
      <div
        className={cn(
          '-ml-10 mt-3 flex w-[17.5rem] items-center gap-3 rounded-xl p-3 text-ink-900 ring-1 ring-black/5 backdrop-blur motion-safe:animate-[toast-in_0.6s_cubic-bezier(0.22,1,0.36,1)_0.6s_both]',
          cover
            ? 'bg-[#F4F8FA]/95 shadow-[0_24px_48px_-20px_rgba(16,43,67,0.7)]'
            : 'bg-white/95 shadow-[0_24px_48px_-20px_rgba(2,11,46,0.7)]',
        )}
      >
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
            cover ? 'bg-[#BED9E3]/60 text-[#1F4A72]' : 'bg-brand-50 text-brand-700',
          )}
        >
          <Icon d={audience.icon} c="h-[18px] w-[18px]" sw={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight">{t('winBackSent')}</span>
          <span className="block truncate text-xs text-ink-500">{t('automationNow')}</span>
        </span>
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse',
            cover ? 'bg-[#2F7896]' : 'bg-success-500',
          )}
        />
      </div>
    </div>
  );
}
