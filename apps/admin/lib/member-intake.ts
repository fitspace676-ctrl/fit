// @fit/admin — Add-Member drawer helpers.

/**
 * Compose the single `name` the API stores from the drawer's first-name and
 * (optional, UI-only) surname inputs. Both are trimmed; empty parts are dropped
 * so `("Ana", "")` → `"Ana"` and `("Ana", "Beridze")` → `"Ana Beridze"`.
 */
export function composeName(name: string, surname: string): string {
  return [name.trim(), surname.trim()].filter(Boolean).join(' ');
}
