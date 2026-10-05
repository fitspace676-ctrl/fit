import { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureCard, type FeatureCardProps } from './feature-card';

const copy = {
  feature: 'classes',
  title: 'კლასები',
  description: 'კლასების განრიგი და დეტალები.',
  illustrationAlt: 'ჯგუფური ვარჯიში და კალენდარი',
} satisfies Pick<FeatureCardProps, 'feature' | 'title' | 'description' | 'illustrationAlt'>;

afterEach(() => vi.unstubAllEnvs());

describe('FeatureCard', () => {
  it('lets a member-facing feature be toggled with the keyboard', async () => {
    function Example() {
      const [checked, setChecked] = useState(true);
      return <FeatureCard {...copy} checked={checked} onChange={setChecked} />;
    }
    const user = userEvent.setup();
    render(<Example />);
    const toggle = screen.getByRole('switch', { name: copy.title });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(copy.description)).toBeVisible();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('prevents changes while saving', async () => {
    const onChange = vi.fn();
    render(<FeatureCard {...copy} checked disabled onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: copy.title });
    expect(toggle).toBeDisabled();
    await userEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['/admin', ''])('loads its localized illustration beneath basePath "%s"', (basePath) => {
    vi.stubEnv('NEXT_PUBLIC_ADMIN_BASE_PATH', basePath);
    render(<FeatureCard {...copy} checked onChange={vi.fn()} />);
    const image = screen.getByRole('img', { name: copy.illustrationAlt });
    expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain(
      `url=${basePath}/app-settings/classes.webp`,
    );
  });
});
