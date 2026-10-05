'use client';

import Image from 'next/image';
import * as stylex from '@stylexjs/stylex';
import { Card, Switch } from '@fit/ui-kit';
import type { MobileAppFeature } from '@fit/types';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    height: '100%',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  illustration: {
    display: 'block',
    width: '100%',
    height: 'auto',
    aspectRatio: '8 / 5',
    objectFit: 'contain',
    transitionProperty: 'filter, opacity',
    transitionDuration: '180ms',
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' },
  },
  illustrationOff: { filter: 'grayscale(1)', opacity: 0.4 },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    flexGrow: 1,
    padding: '1.25rem',
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
  },
  toggle: { width: 'auto', flexShrink: 0, paddingBlock: 0, gap: 0 },
  description: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
});

export interface FeatureCardProps {
  feature: MobileAppFeature;
  title: string;
  description: string;
  illustrationAlt: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function FeatureCard({
  feature,
  title,
  description,
  illustrationAlt,
  checked,
  disabled = false,
  onChange,
}: FeatureCardProps) {
  const basePath = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '/admin';

  return (
    <Card padding="none" clip xstyle={styles.card}>
      <Image
        src={`${basePath}/app-settings/${feature}.webp`}
        alt={illustrationAlt}
        width={640}
        height={400}
        sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
        {...stylex.props(styles.illustration, !checked && styles.illustrationOff)}
      />
      <div {...stylex.props(styles.content)}>
        <div {...stylex.props(styles.heading)}>
          <h3 {...stylex.props(styles.title)}>{title}</h3>
          <Switch
            label={title}
            hideLabel
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            xstyle={styles.toggle}
          />
        </div>
        <p {...stylex.props(styles.description)}>{description}</p>
      </div>
    </Card>
  );
}
