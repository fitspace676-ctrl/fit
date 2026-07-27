'use client';

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  createPosMemberAction,
  lookupPosMembersAction,
  type PosMemberRow,
} from '@/app/(dashboard)/pos/actions';
import { Card } from '@astryxdesign/core/Card';
import { Btn, Icon } from '@/components/ui';

/** Debounce (ms) before a keystroke fires a new member lookup. */
const LOOKUP_DEBOUNCE_MS = 250;

const styles = stylex.create({
  selectedChip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  infoCol: {
    minWidth: 0,
  },
  selectedName: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  selectedContact: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  removeBtn: {
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.5rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-primary)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-surface)',
    },
    cursor: 'pointer',
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  searchRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  searchWrap: {
    position: 'relative',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
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
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: 0,
    fontSize: '0.875rem',
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
  walkInRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  addNewBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    flexShrink: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    cursor: 'pointer',
  },
  addNewIcon: { width: '0.875rem', height: '0.875rem' },
  newForm: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  newField: {
    height: '2.5rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
  },
  newActions: { display: 'flex', gap: '0.5rem' },
  walkIn: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  alertCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  alertIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  alertText: {
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
  warningCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-warning)',
    backgroundColor: 'var(--color-warning-muted)',
  },
  warningIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-warning)',
  },
  warningText: {
    fontSize: '0.75rem',
    color: 'var(--color-warning)',
  },
  resultList: {
    maxHeight: '14rem',
    overflowY: 'auto',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
  },
  resultItem: {
    borderTopWidth: {
      default: '1px',
      ':first-child': '0',
    },
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  resultBtn: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.125rem',
    borderWidth: 0,
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    textAlign: 'left',
    cursor: 'pointer',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  resultName: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  resultContact: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Member lookup (top of the right column). A debounced search over the gym roster
 * (name / phone / email) drops down up to ten matches; picking one attaches the sale
 * to that member. Someone with no record yet can be registered on the spot — see
 * {@link NewMemberForm} — which is what makes a membership sellable to a walk-in.
 * Walk-in is otherwise the default: no member is required to sell.
 *
 * State (the attached member) lives in the cart store via the `selectedMember` /
 * `onSelect` props the board threads through, so the cart and lookup never drift.
 */
export function MemberLookup({
  searchRef,
  selectedMember,
  onSelect,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  selectedMember: PosMemberRow | null;
  onSelect: (member: PosMemberRow | null) => void;
}) {
  const t = useTranslations('admin.pos.member');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosMemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim() === '') {
      setResults([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const result = await lookupPosMembersAction(query);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setResults(result.data);
        setError(null);
      } else {
        setResults([]);
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function onQueryChange(value: string): void {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => setQuery(value), LOOKUP_DEBOUNCE_MS);
  }

  function pick(member: PosMemberRow): void {
    onSelect(member);
    setQuery('');
    setResults([]);
    if (searchRef.current) {
      searchRef.current.value = '';
    }
  }

  if (selectedMember) {
    return (
      <div {...stylex.props(styles.selectedChip)}>
        <div {...stylex.props(styles.infoCol)}>
          <p {...stylex.props(styles.selectedName)}>{selectedMember.name}</p>
          <p {...stylex.props(styles.selectedContact)}>
            {selectedMember.phone ?? selectedMember.email}
          </p>
        </div>
        <button type="button" onClick={() => onSelect(null)} {...stylex.props(styles.removeBtn)}>
          {t('remove')}
        </button>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.searchRow)}>
        <div {...stylex.props(styles.searchWrap)}>
          <label htmlFor="pos-member-search" {...stylex.props(styles.srOnly)}>
            {t('searchLabel')}
          </label>
          <input
            ref={searchRef}
            id="pos-member-search"
            type="search"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('searchPlaceholder')}
            {...stylex.props(styles.searchInput)}
          />
        </div>
      </div>

      <div {...stylex.props(styles.walkInRow)}>
        <p {...stylex.props(styles.walkIn)}>{t('walkIn')}</p>
        <button
          type="button"
          onClick={() => {
            setAddingMember((open) => !open);
            setError(null);
          }}
          {...stylex.props(styles.addNewBtn)}
        >
          <Icon name="plus" {...stylex.props(styles.addNewIcon)} sw={2} />
          {addingMember ? 'Cancel' : 'Add new member'}
        </button>
      </div>

      {addingMember ? (
        <NewMemberForm
          onCreated={(member) => {
            setAddingMember(false);
            pick(member);
          }}
          onError={setError}
        />
      ) : null}

      {error ? (
        <Card variant="default" padding={0} role="alert" xstyle={styles.alertCard}>
          <Icon name="info" {...stylex.props(styles.alertIcon)} />
          <span {...stylex.props(styles.alertText)}>{error}</span>
        </Card>
      ) : null}

      {results.length > 0 ? (
        <ul {...stylex.props(styles.resultList)}>
          {results.map((member) => (
            <li key={member.id} {...stylex.props(styles.resultItem)}>
              <button
                type="button"
                onClick={() => pick(member)}
                {...stylex.props(styles.resultBtn)}
              >
                <span {...stylex.props(styles.resultName)}>{member.name}</span>
                <span {...stylex.props(styles.resultContact)}>{member.phone ?? member.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Register a member without leaving the till.
 *
 * Only what a sale needs — name, email, phone — because the operator has a queue
 * behind them; the rest of the profile is filled in later from the member's page.
 * The created member is handed straight back and attached to the sale in progress,
 * which is the whole point: a walk-in who wants a membership becomes a member and
 * the sale continues in one step.
 */
function NewMemberForm({
  onCreated,
  onError,
}: {
  onCreated: (member: PosMemberRow) => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    onError(null);
    setSaving(true);
    const result = await createPosMemberAction({ name, email, phone });
    setSaving(false);
    if (result.ok) {
      onCreated(result.data);
    } else {
      onError(result.error);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} {...stylex.props(styles.newForm)}>
      <input
        type="text"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Full name"
        aria-label="New member name"
        autoComplete="off"
        {...stylex.props(styles.newField)}
      />
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        aria-label="New member email"
        autoComplete="off"
        {...stylex.props(styles.newField)}
      />
      <input
        type="tel"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="Phone (optional)"
        aria-label="New member phone"
        autoComplete="off"
        {...stylex.props(styles.newField)}
      />
      <div {...stylex.props(styles.newActions)}>
        <Btn type="submit" v="primary" size="sm" disabled={saving}>
          {saving ? 'Creating…' : 'Create & attach'}
        </Btn>
      </div>
    </form>
  );
}
