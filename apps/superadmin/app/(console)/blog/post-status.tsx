import * as stylex from '@stylexjs/stylex';
import type { BlogPostVisibility } from '@fit/types';
import { Badge } from '@fit/ui-kit';
import { VISIBILITY } from './shared';

const styles = stylex.create({
  pill: { borderRadius: '999px' },
  scheduled: {
    backgroundColor: 'var(--ops-white)',
    boxShadow: 'inset 0 0 0 1px var(--ops-ink-200)',
  },
  dot: {
    width: '0.375rem',
    height: '0.375rem',
    borderRadius: '50%',
    backgroundColor: 'currentColor',
  },
});

export function PostStatus({ visibility }: { visibility: BlogPostVisibility }) {
  return (
    <Badge
      label={VISIBILITY[visibility].label}
      tone={VISIBILITY[visibility].tone}
      icon={<span aria-hidden="true" {...stylex.props(styles.dot)} />}
      xstyle={[styles.pill, visibility === 'scheduled' && styles.scheduled]}
    />
  );
}
