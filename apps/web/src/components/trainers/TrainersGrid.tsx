import { useTranslations } from 'next-intl';
import type { TrainerCard as TrainerCardModel } from '@fit/types';
import { TrainerCard } from './TrainerCard';

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
    <ul
      aria-label={t('grid.label')}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {trainers.map((trainer) => (
        <li key={trainer.id}>
          <TrainerCard trainer={trainer} />
        </li>
      ))}
    </ul>
  );
}
