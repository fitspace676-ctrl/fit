import { getGymConsoleColor } from '@/lib/active-gym';
import { consoleThemeCss } from '@/lib/console-theme';

/**
 * The gym's console colour as a `<style>` rule, or nothing when it chose none
 * (or no gym is in scope) and the default stays. A server component, so the
 * colour is in the first paint rather than flashing in after load.
 *
 * Rendered by the root layout with the HOST's slug, which is what reaches the
 * sign-in page: there is no session there yet, but `downtown.<root>/admin/login`
 * already names the gym. The dashboard layout covers the bare-host case (local
 * dev) from the session's slug.
 */
export async function ConsoleThemeStyle({ slug }: { slug: string | null }) {
  const css = consoleThemeCss(await getGymConsoleColor(slug));
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;
}
