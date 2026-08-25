import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import * as stylex from '@stylexjs/stylex';
import { EmptyState } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Services - FormaCore Admin',
  description: 'The gym’s services — the Commerce destination beside the retail Shop.',
};

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  card: {
    paddingBlock: '3rem',
  },
});

/**
 * Services — the Commerce rail's third destination, beside Shop and POS. The
 * destination exists so the rail, the route guard and the i18n keys are in place;
 * what the page lists and manages is specified separately, so until then it
 * renders an honest empty state rather than placeholder data.
 */
export default function ServicesPage() {
  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Services</h1>
          <p {...stylex.props(styles.subtitle)}>
            The services your gym offers alongside memberships and the shop.
          </p>
        </div>
      </header>

      <Card padding="none" xstyle={styles.card}>
        <EmptyState
          icon="star"
          title="No services yet"
          message="Services will be listed here once the first one is added."
        />
      </Card>
    </div>
  );
}
