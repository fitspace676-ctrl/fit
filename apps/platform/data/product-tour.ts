import type { PlatformMessages } from '@fit/i18n/platform';
import type { MessageReader } from '@/lib/messages';

/* ────────────────────────────────────────────────────────────────────────
   FormaCore - product tour scenes
   The homepage's tabbed tour of the staff console and the member portal. Each
   scene is a real screen recording of the seeded demo gym, in
   `public/tour/<clip>-<light|dark>[-m].{mp4,webp}` (`-m` is the half-size phone cut), made by
   `node apps/e2e/scripts/record-product-tour.mjs`. Re-run that after a UI change
   so the tour keeps showing the product as it is.

   The scene copy (pill label, title, body) lives in the `tour` area of the
   platform catalogue under `scenes.<id>`; the clip, frame and address stay here.
   ──────────────────────────────────────────────────────────────────────── */

export type TourScene = {
  id: string;
  /** Pill label. */
  label: string;
  title: string;
  body: string;
  /** Clip base name in /public/tour. */
  clip: string;
  /** The recording's device frame on the card: a browser window or a phone. */
  frame: 'browser' | 'phone';
  /** Address shown in the browser window's bar. */
  url?: string;
};

type SceneCopy = PlatformMessages['tour']['scenes'];

type TourSceneMeta = Omit<TourScene, 'label' | 'title' | 'body' | 'id'> & { id: keyof SceneCopy };

export const TOUR_SCENE_META: readonly TourSceneMeta[] = [
  { id: 'dashboard', clip: 'dashboard', frame: 'browser', url: 'app.formacore.io/admin' },
  { id: 'members', clip: 'members', frame: 'browser', url: 'app.formacore.io/admin/members' },
  { id: 'schedule', clip: 'schedule', frame: 'browser', url: 'app.formacore.io/admin/classes' },
  { id: 'reports', clip: 'reports', frame: 'browser', url: 'app.formacore.io/admin/reports' },
  { id: 'portal', clip: 'portal', frame: 'browser', url: 'yourgym.formacore.io/member/classes' },
];

/**
 * The tour's scenes, in order, with their copy read from the `tour` area:
 * pass `useTranslations('tour')` or `getTranslations('tour')`.
 */
export function getTourScenes(t: MessageReader): TourScene[] {
  const scenes = t.raw('scenes') as SceneCopy;
  return TOUR_SCENE_META.map((meta) => ({ ...meta, ...scenes[meta.id] }));
}
