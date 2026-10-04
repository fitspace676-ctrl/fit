import type { Metadata } from 'next';
import BuiltForHub from '@/components/marketing/built-for-hub';

/**
 * "Built For" hub (`formacore.io/built-for`): every business type FormaCore is
 * built for, each linking to its own /built-for/<slug> page. Reached from the
 * homepage's "See all" and the nav.
 */
export const metadata: Metadata = {
  title: 'Built For - FormaCore',
  description:
    'Gym and studio software for fitness clubs, training and yoga studios, CrossFit, martial arts, swimming and dance schools, padel and tennis clubs.',
};

export default function Page() {
  return <BuiltForHub />;
}
