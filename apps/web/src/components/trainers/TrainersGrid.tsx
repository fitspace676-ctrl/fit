import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { TrainerCard as TrainerCardModel } from '@fit/types';
import { TrainerCard } from './TrainerCard';

// Astryx migration (T11), now on the portal kit: the responsive grid is authored in compiled StyleX
// over the Fit brand tokens — no Tailwind utilities.

const styles = stylex.create({
  grid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
});

export interface TrainersGridProps {
  trainers: TrainerCardModel[];
}

/**
 * Responsive card grid for the trainers index: one column on phones, two on
 * tablets, three on desktop. Stateless — the parent supplies the (already
 * filtered) trainers.
 */
export function TrainersGrid({ trainers }: TrainersGridProps) {
  const t = useTranslations('trainers');

  return (
    <ul aria-label={t('grid.label')} {...stylex.props(styles.grid)}>
      {trainers.map((trainer) => (
        <li key={trainer.id}>
          <TrainerCard trainer={trainer} />
        </li>
      ))}
    </ul>
  );
}
