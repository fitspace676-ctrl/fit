'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Banner } from '@fit/ui-kit';
import { GymActions, type ActionableGym } from '../../gym-actions';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
});

/**
 * The detail screen's action strip. A client island because the actions are, and
 * because the error they can produce has to land somewhere on this screen —
 * everything else about the gym is server-rendered.
 */
export function GymHeaderActions({ gym }: { gym: ActionableGym }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div {...stylex.props(styles.stack)}>
      <GymActions gym={gym} onError={setError} size="card" />
      {error ? <Banner tone="error">{error}</Banner> : null}
    </div>
  );
}
