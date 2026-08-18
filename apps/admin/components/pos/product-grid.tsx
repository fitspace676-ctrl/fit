'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { formatPrice } from '@/app/(dashboard)/shop/format-price';
import { UNCATEGORISED_FILTER, type MemberKind } from '@fit/types';
import {
  fetchPosCategoriesAction,
  fetchPosMembersAction,
  fetchPosMembershipsAction,
  searchPosProductsAction,
  type PosCategoryRow,
  type PosMemberRow,
  type PosMembershipRow,
  type PosProductRow,
} from '@/app/(dashboard)/pos/actions';
import { Badge, Card, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';

/** Debounce (ms) before a keystroke fires a new product search. */
const SEARCH_DEBOUNCE_MS = 200;

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    gap: '1rem',
  },
  searchWrap: {
    position: 'relative',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  searchInput: {
    height: '3rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: 0,
    fontSize: '1rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  scrollArea: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
  },
  empty: {
    margin: 0,
    paddingInline: '0.25rem',
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    display: 'grid',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gap: '0.75rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 640px)': 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  tile: {
    display: 'flex',
    height: '100%',
    width: '100%',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.75rem',
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'color, background-color, border-color, box-shadow',
    transitionDuration: '150ms',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
  },
  tileMedia: {
    aspectRatio: '1 / 1',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
  },
  tileImg: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  tileInitial: {
    display: 'flex',
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    color: 'var(--color-text-disabled)',
  },
  tileName: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  tilePrice: {
    marginTop: 'auto',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  tabs: { display: 'flex', gap: '0.5rem' },
  // The shelves scroll sideways rather than wrapping: a gym with a dozen of them
  // would otherwise push the tiles themselves off a tablet screen.
  shelves: {
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto',
    paddingBottom: '0.125rem',
    scrollbarWidth: 'thin',
  },
  shelf: {
    flexShrink: 0,
    height: '2rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-pill, 999px)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
    },
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  shelfActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
    color: 'var(--color-text-primary)',
  },
  tab: {
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  tabActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
    color: 'var(--color-text-primary)',
  },
  // A membership tile has no image, so it leads with the name and carries a
  // duration badge instead of the product tile's media block.
  membershipTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.5rem',
    width: '100%',
  },
  // ── The members table ──────────────────────────────────────────────────────
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.8125rem',
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: 'var(--color-background-surface)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '0.625rem',
    paddingBlock: '0.5rem',
    textAlign: 'left',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  // The whole row is the target — at a counter, a tap has to land somewhere large.
  memberRow: {
    cursor: 'pointer',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  memberRowActive: {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
  },
  td: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '0.625rem',
    paddingBlock: '0.5rem',
    // The member cell is two lines tall and the rest are one, so every cell is
    // centred against the row rather than sitting on its top edge.
    verticalAlign: 'middle',
    color: 'var(--color-text-primary)',
  },
  memberName: {
    fontWeight: 600,
  },
  memberEmail: {
    display: 'block',
    fontSize: '0.6875rem',
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  memberMuted: {
    color: 'var(--color-text-secondary)',
  },
  // The badges live in a span inside the cell, never on the cell itself: a `td`
  // told to be a flex container stops being a table cell, which is what pulled the
  // status column off the row's baseline and drew its divider at its own height.
  statusWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    whiteSpace: 'nowrap',
  },
  attachedTag: {
    display: 'inline-block',
    borderRadius: 'var(--radius-pill, 999px)',
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  durationBadge: {
    flexShrink: 0,
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    borderRadius: 'var(--radius-pill, 999px)',
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
});

/**
 * The panels the till's left column switches between: the two catalogues it sells
 * from, and the member roster it attaches a sale to.
 */
type Catalogue = 'memberships' | 'products' | 'members';

/**
 * Visual treatment per standing, matching the members roster's own pill so the
 * two screens never disagree about what green means: green for a paying member,
 * slate for a guest, amber for someone lapsed.
 */
const KIND_TONES: Record<MemberKind, BadgeTone> = {
  MEMBER: 'positive',
  GUEST: 'neutral',
  INACTIVE: 'pending',
};

/** The tab strip, in the order the counter uses them. */
const TABS: ReadonlyArray<{ value: Catalogue; label: string }> = [
  { value: 'memberships', label: 'Memberships' },
  { value: 'products', label: 'Products' },
  { value: 'members', label: 'Members' },
];

/**
 * The POS catalogue (left column): what a gym sells across the counter —
 * **Memberships** (its active subscription plans) and **Products** (the shop's
 * stock) — plus **Members**, who it is selling to. Tapping a tile adds that line to
 * the cart; tapping a member attaches the sale to them.
 *
 * The member table earns its place next to the cart's own lookup rather than
 * duplicating it: the lookup answers "find this person I am being told about" and
 * stays empty until something is typed, while the table opens on the roster, which
 * is what an operator needs when the customer's name is not what they can spell.
 * Both write to the same attachment, so a sale never has two ideas of its member.
 *
 * Products are searched server-side, debounced, and reload as the operator types,
 * narrowed to whichever shelf is selected. The shelf row is what makes a large
 * catalogue usable at the counter: the grid only shows one page of tiles, and an
 * operator who cannot spell what the customer is holding has nothing to type.
 * Memberships are a handful of rows, so they load once and filter in memory — a
 * round-trip per keystroke would be wasted on a list that fits on screen.
 *
 * Selling a membership enrols the attached member on that plan, which is why the
 * cart refuses to complete one without a member; the tile itself stays tappable so
 * the operator can build the sale and attach the member in either order.
 *
 * The `searchRef` is owned by the board so the `F1` hotkey can focus the box
 * without this component knowing about the keymap.
 */
export function ProductGrid({
  searchRef,
  onAdd,
  onAddMembership,
  onSelectMember,
  selectedMemberId,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  onAdd: (product: PosProductRow) => void;
  onAddMembership: (membership: PosMembershipRow) => void;
  /** Attach the sale to this member — the same handler the cart's lookup calls. */
  onSelectMember: (member: PosMemberRow) => void;
  /** Who the sale is attached to, so the table can mark them. */
  selectedMemberId: string | null;
}) {
  const t = useTranslations('admin.pos.products');
  const [catalogue, setCatalogue] = useState<Catalogue>('memberships');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<PosProductRow[]>([]);
  const [memberships, setMemberships] = useState<PosMembershipRow[]>([]);
  const [categories, setCategories] = useState<PosCategoryRow[]>([]);
  const [members, setMembers] = useState<PosMemberRow[]>([]);
  /** The selected shelf — a category id, {@link UNCATEGORISED_FILTER}, or `''` for all. */
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The gym's plans change rarely and are few, so they are fetched once.
  useEffect(() => {
    let cancelled = false;
    void fetchPosMembershipsAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setMemberships(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Shelves change about as often as the plans do — fetched once, alongside them.
  // A failure here is left silent: the filter row simply does not appear, and the
  // till still sells. Losing the whole catalogue over a missing chip row would be
  // the worse trade at a counter with a customer waiting.
  useEffect(() => {
    let cancelled = false;
    void fetchPosCategoriesAction().then((result) => {
      if (!cancelled && result.ok) setCategories(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shownMemberships = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return memberships;
    return memberships.filter((plan) => plan.name.toLowerCase().includes(needle));
  }, [memberships, query]);

  // Run the search whenever the (debounced) query or the selected shelf changes,
  // including the initial empty query that populates the grid on mount.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await searchPosProductsAction(query, categoryId);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setProducts(result.data);
        setError(null);
      } else {
        setProducts([]);
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, categoryId]);

  // The roster is only fetched while its tab is open — a till that spends the day
  // on Products has no reason to carry a member list it is not showing. It then
  // re-runs per (debounced) keystroke, like the product search.
  useEffect(() => {
    if (catalogue !== 'members') {
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const result = await fetchPosMembersAction(query);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setMembers(result.data);
        setError(null);
      } else {
        setMembers([]);
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [catalogue, query]);

  function onSearchChange(value: string): void {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => setQuery(value), SEARCH_DEBOUNCE_MS);
  }

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.searchWrap)}>
        <label htmlFor="pos-product-search" {...stylex.props(styles.srOnly)}>
          {catalogue === 'members' ? t('searchMembersLabel') : t('searchLabel')}
        </label>
        <input
          ref={searchRef}
          id="pos-product-search"
          type="search"
          onChange={(event) => onSearchChange(event.target.value)}
          // One box serves whichever panel is showing, so it has to say which — a
          // box promising products while a member list is under it reads as broken.
          placeholder={
            catalogue === 'members' ? t('searchMembersPlaceholder') : t('searchPlaceholder')
          }
          {...stylex.props(styles.searchInput)}
        />
      </div>

      <div {...stylex.props(styles.tabs)} role="tablist" aria-label="Catalogue">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={catalogue === tab.value}
            onClick={() => setCatalogue(tab.value)}
            {...stylex.props(styles.tab, catalogue === tab.value && styles.tabActive)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shelves belong to the product catalogue, so they only show with it — and
          only once the gym has any, since a lone "All" chip filters nothing. */}
      {catalogue === 'products' && categories.length > 0 ? (
        <div {...stylex.props(styles.shelves)} role="group" aria-label={t('categoryLabel')}>
          {[
            { id: '', name: t('allCategories') },
            ...categories,
            { id: UNCATEGORISED_FILTER, name: t('uncategorised') },
          ].map((shelf) => (
            <button
              key={shelf.id || 'all'}
              type="button"
              aria-pressed={categoryId === shelf.id}
              onClick={() => setCategoryId(shelf.id)}
              {...stylex.props(styles.shelf, categoryId === shelf.id && styles.shelfActive)}
            >
              {shelf.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <Card padding="none" role="alert" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span {...stylex.props(styles.errorText)}>{error}</span>
        </Card>
      ) : null}

      {catalogue === 'memberships' ? (
        <div {...stylex.props(styles.scrollArea)}>
          {shownMemberships.length === 0 ? (
            <p {...stylex.props(styles.empty)}>
              {memberships.length === 0
                ? 'No active membership plans to sell yet.'
                : 'No memberships match that.'}
            </p>
          ) : (
            <ul {...stylex.props(styles.grid)}>
              {shownMemberships.map((plan) => (
                <li key={plan.id}>
                  <button
                    type="button"
                    onClick={() => onAddMembership(plan)}
                    {...stylex.props(styles.tile)}
                  >
                    <span {...stylex.props(styles.membershipTop)}>
                      <span {...stylex.props(styles.tileName)}>{plan.name}</span>
                      <span {...stylex.props(styles.durationBadge)}>{plan.durationLabel}</span>
                    </span>
                    <span {...stylex.props(styles.tilePrice)}>
                      {formatPrice(plan.priceAmount, plan.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : catalogue === 'products' ? (
        <div {...stylex.props(styles.scrollArea)}>
          {products.length === 0 && !isPending && !error ? (
            // "Nothing matches what you typed" would be a lie when nothing was
            // typed and the shelf is simply empty of active products.
            <p {...stylex.props(styles.empty)}>
              {categoryId && !query.trim() ? t('emptyShelf') : t('empty')}
            </p>
          ) : (
            <ul {...stylex.props(styles.grid)}>
              {products.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(product)}
                    {...stylex.props(styles.tile)}
                  >
                    <div {...stylex.props(styles.tileMedia)}>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" {...stylex.props(styles.tileImg)} />
                      ) : (
                        <div {...stylex.props(styles.tileInitial)}>
                          {product.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span {...stylex.props(styles.tileName)}>{product.name}</span>
                    <span {...stylex.props(styles.tilePrice)}>
                      {formatPrice(product.priceAmount, product.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div {...stylex.props(styles.scrollArea)}>
          {members.length === 0 && !isPending && !error ? (
            <p {...stylex.props(styles.empty)}>{t('membersEmpty')}</p>
          ) : (
            <table {...stylex.props(styles.table)}>
              <caption {...stylex.props(styles.srOnly)}>{t('membersTableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col" {...stylex.props(styles.th)}>
                    {t('membersColumnName')}
                  </th>
                  <th scope="col" {...stylex.props(styles.th)}>
                    {t('membersColumnPhone')}
                  </th>
                  <th scope="col" {...stylex.props(styles.th)}>
                    {t('membersColumnPlan')}
                  </th>
                  <th scope="col" {...stylex.props(styles.th)}>
                    {t('membersColumnStatus')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const attached = member.id === selectedMemberId;
                  return (
                    <tr
                      key={member.id}
                      // A row, not a button in a cell: the operator is aiming at a
                      // person, and the whole line is what they see as that person.
                      role="button"
                      tabIndex={0}
                      aria-pressed={attached}
                      onClick={() => onSelectMember(member)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectMember(member);
                        }
                      }}
                      {...stylex.props(styles.memberRow, attached && styles.memberRowActive)}
                    >
                      <td {...stylex.props(styles.td)}>
                        <span {...stylex.props(styles.memberName)}>{member.name}</span>
                        <span {...stylex.props(styles.memberEmail)}>{member.email}</span>
                      </td>
                      <td {...stylex.props(styles.td, !member.phone && styles.memberMuted)}>
                        {member.phone ?? '-'}
                      </td>
                      <td {...stylex.props(styles.td, !member.planName && styles.memberMuted)}>
                        {member.planName ?? '-'}
                      </td>
                      <td {...stylex.props(styles.td)}>
                        <span {...stylex.props(styles.statusWrap)}>
                          <MemberStanding member={member} />
                          {attached ? (
                            <span {...stylex.props(styles.attachedTag)}>
                              {t('membersAttached')}
                            </span>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A member's standing at a glance.
 *
 * A suspended account wins over the derived standing, because the two can point
 * opposite ways: suspending someone does not cancel their subscription, so the
 * standing alone would show a plain green "Member" for a person the gym has
 * deliberately locked out — the one row where the badge has to be right.
 */
function MemberStanding({ member }: { member: PosMemberRow }) {
  const t = useTranslations('admin.pos.products');
  const kinds = useTranslations('admin.members.kind');

  if (member.status === 'SUSPENDED') {
    return <Badge tone="danger" label={t('membersSuspended')} />;
  }
  return <Badge tone={KIND_TONES[member.kind]} label={kinds(member.kind)} />;
}
