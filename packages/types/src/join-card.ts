import type { GymJoinCardCopy, GymJoinCardSettings } from './gym-settings';

/** The built-in join-card copy in one language: what `auth.join` translates to. */
export interface JoinCardDefaults {
  /** The heading when no gym is in scope. */
  title: string;
  /** The heading with the gym's name, as a `{gym}` template. */
  titleNamed: string;
  subtitle: string;
  benefits: string[];
  cta: string;
}

/** The join card exactly as the sign-in screen renders it. */
export interface ResolvedJoinCard {
  title: string;
  subtitle: string;
  benefits: string[];
  cta: string;
}

/** Replace `{gym}` with the name, or drop it (and the space before it) when there is none. */
function fillGym(template: string, gymName: string | null): string {
  return gymName
    ? template.replaceAll('{gym}', gymName)
    : template.replace(/\s*\{gym\}/g, '').trim();
}

/**
 * The join card the visitor sees: each line the gym wrote for THIS language, and
 * the built-in translation for every line it left `null`. `null` when the gym
 * has hidden the card.
 *
 * Resolved here rather than API-side because the defaults are the portal's own
 * translations, the API stores what the gym wrote and nothing else.
 */
export function resolveJoinCard(
  card: GymJoinCardSettings,
  locale: string,
  defaults: JoinCardDefaults,
  gymName: string | null,
): ResolvedJoinCard | null {
  if (card.hidden) {
    return null;
  }
  const copy: GymJoinCardCopy | null = locale === 'ka' || locale === 'en' ? card[locale] : null;
  const fallbackTitle = gymName ? defaults.titleNamed : defaults.title;
  return {
    title: fillGym(copy?.title ?? fallbackTitle, gymName),
    subtitle: copy?.subtitle ?? defaults.subtitle,
    benefits: copy?.benefits ?? defaults.benefits,
    cta: copy?.cta ?? defaults.cta,
  };
}
