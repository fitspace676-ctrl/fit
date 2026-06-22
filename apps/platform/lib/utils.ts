/**
 * `cn` — class-name combiner used by registry/magicui components.
 *
 * A dependency-free clsx-style merge: accepts strings and conditional maps
 * (`{ "flex-row": !vertical }`) and joins the truthy classes. The project has
 * no Tailwind class conflicts to resolve in these primitives, so a full
 * clsx + tailwind-merge stack isn't pulled in.
 */
type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
    } else {
      for (const [key, val] of Object.entries(input)) {
        if (val) out.push(key);
      }
    }
  }
  return out.join(' ');
}
