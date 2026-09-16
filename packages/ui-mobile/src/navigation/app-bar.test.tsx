// `AppBar` — the title block, and the one thing it used to get wrong.
//
// The header is also the screen's single `role="header"`, so a title that
// truncates is the screen losing its name, not a cosmetic clip.

import { render, screen } from '@testing-library/react-native';

import { AppBar } from './app-bar';

/** RNTL types a host node's props as `any`; narrow the one prop read here. */
function lines(node: unknown): number | undefined {
  return (node as { props?: { numberOfLines?: number } }).props?.numberOfLines;
}

describe('AppBar', () => {
  it('announces its title as the screen header', () => {
    render(<AppBar title="მაღაზია" testID="bar" />);
    expect(screen.getByRole('header')).toHaveTextContent('მაღაზია');
  });

  // ==========================================================================
  // WAS `numberOfLines={1}`. The join funnel's step 4 shipped
  // "გადახედვა და გად…" — the screen's own name, cut, at 28px extrabold.
  // ==========================================================================
  it('lets a long title take a second line rather than truncating it', () => {
    render(<AppBar title="გადახედვა და გადახდა" />);
    expect(lines(screen.getByRole('header'))).toBe(2);
  });

  it('still allows one line where a taller header would break the chrome', () => {
    render(<AppBar title="გადახედვა და გადახდა" titleLines={1} />);
    expect(lines(screen.getByRole('header'))).toBe(1);
  });

  // `titleVariant` is the answer where the DESIGN wants a smaller title (home's
  // greeting), not where the box wants to be bigger. Both still exist.
  it('keeps the section step available for home’s greeting', () => {
    render(<AppBar title="კეთილი დაბრუნება" titleVariant="section" />);
    expect(screen.getByRole('header')).toBeTruthy();
  });
});
