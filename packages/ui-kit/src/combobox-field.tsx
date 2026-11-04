'use client';

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';
import {
  FieldShell,
  fieldSkin,
  type FieldSize,
  type SelectOption,
  type SelectOptionGroup,
} from './field';
import { focus, text } from './tokens';
import { useDismissable } from './use-dismissable';

export interface ComboboxLabels {
  search: string;
  empty: string;
}

/**
 * A single-value select with the native select's form and ChangeEvent contract.
 * Keep value/defaultValue, name, required and onChange unchanged when migrating
 * from SelectField. The forwarded ref points to the native select.
 */
export interface ComboboxFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'className' | 'style' | 'id' | 'children' | 'size'
> {
  label: string;
  labelHidden?: boolean;
  size?: FieldSize;
  options: readonly (SelectOption | SelectOptionGroup)[];
  startIcon?: ReactNode;
  hint?: string;
  invalid?: boolean;
  placeholder?: string;
  xstyle?: StyleXStyles;
  labels: ComboboxLabels;
  /** 'auto' shows search when there are more than seven options. */
  searchable?: boolean | 'auto';
  ref?: Ref<HTMLSelectElement>;
}

const styles = stylex.create({
  wrap: { position: 'relative', display: 'block' },
  native: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    pointerEvents: 'none',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    textAlign: 'start',
    cursor: 'pointer',
  },
  chrome: { height: '2.5rem', fontSize: '0.875rem' },
  value: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  secondary: { color: 'var(--color-text-secondary)' },
  panel: {
    position: 'fixed',
    zIndex: 70,
    boxSizing: 'border-box',
    maxWidth: 'calc(100vw - 16px)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    color: 'var(--color-text-primary)',
    boxShadow: 'var(--shadow-high)',
    padding: '0.5rem',
  },
  list: { listStyle: 'none', padding: 0, margin: 0, outline: 'none' },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 0.75rem',
    borderRadius: 'var(--radius-inner)',
    cursor: 'pointer',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
  },
  active: { backgroundColor: 'var(--color-overlay-hover)' },
  disabled: {
    color: 'var(--color-text-disabled)',
    cursor: 'not-allowed',
    backgroundColor: 'transparent',
  },
  heading: { padding: '0.75rem' },
  search: { marginBottom: '0.5rem' },
});

function isGroup(item: SelectOption | SelectOptionGroup): item is SelectOptionGroup {
  return 'options' in item;
}

export function ComboboxField({
  label,
  labelHidden = false,
  size = 'field',
  options,
  startIcon,
  hint,
  invalid = false,
  placeholder,
  xstyle,
  labels,
  searchable = 'auto',
  ref,
  value,
  defaultValue,
  disabled,
  autoFocus,
  onChange,
  onInvalid,
  onBlur,
  ...nativeProps
}: ComboboxFieldProps) {
  const id = useId();
  const listboxId = `${id}-listbox`;
  const nativeRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(true);
  useImperativeHandle(ref, () => nativeRef.current!, []);
  const flat = options.flatMap((item) => (isGroup(item) ? [...item.options] : [item]));
  const [localValue, setLocalValue] = useState(() =>
    String(
      defaultValue ?? (placeholder ? '' : (flat.find((option) => !option.disabled)?.value ?? '')),
    ),
  );
  const selected = value === undefined ? localValue : String(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>();
  const [position, setPosition] = useState<CSSProperties>({
    left: 8,
    top: 8,
    width: 240,
    maxHeight: 320,
  });
  const typeahead = useRef({ value: '', time: 0 });
  const hasSearch = searchable === true || (searchable === 'auto' && flat.length > 7);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = options.flatMap((item): (SelectOption | SelectOptionGroup)[] => {
    if (!isGroup(item)) return item.label.toLocaleLowerCase().includes(needle) ? [item] : [];
    const children = item.options.filter(
      (option) =>
        item.label.toLocaleLowerCase().includes(needle) ||
        option.label.toLocaleLowerCase().includes(needle),
    );
    return children.length ? [{ ...item, options: children }] : [];
  });
  const enabled = filtered
    .flatMap((item) => (isGroup(item) ? [...item.options] : [item]))
    .filter((option) => !option.disabled);
  const activeValue = enabled.some((option) => option.value === active)
    ? active
    : enabled[0]?.value;
  const optionId = (optionValue: string) =>
    `${id}-option-${flat.findIndex((option) => option.value === optionValue)}`;
  const activeId = activeValue === undefined ? undefined : optionId(activeValue);

  useDismissable({
    open,
    onClose: () => setOpen(false),
    ref: wrapperRef,
    portalRef: panelRef,
    focusRef,
    returnFocusTo: triggerRef,
    restoreFocus,
  });

  // Native defaults and form resets remain authoritative for uncontrolled fields.
  useEffect(() => {
    const select = nativeRef.current;
    if (!select) return;
    if (value === undefined) setLocalValue(select.value);
    const reset = () => {
      queueMicrotask(() => {
        if (value === undefined) setLocalValue(select.value);
        setOpen(false);
      });
    };
    select.form?.addEventListener('reset', reset);
    return () => select.form?.removeEventListener('reset', reset);
  }, [value, options, placeholder]);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const flip = below < 280 && above > below;
      const maxHeight = Math.max(0, Math.min(320, (flip ? above : below) - 8));
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: flip ? undefined : rect.bottom + 4,
        bottom: flip ? window.innerHeight - rect.top + 4 : undefined,
        width,
        maxHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeId]);

  const show = () => {
    if (disabled) return;
    restoreFocus.current = true;
    setQuery('');
    setActive(
      flat.find((option) => option.value === selected && !option.disabled)?.value ??
        flat.find((option) => !option.disabled)?.value,
    );
    typeahead.current = { value: '', time: 0 };
    setOpen(true);
  };

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    const select = nativeRef.current;
    if (!select) return;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
      select,
      option.value,
    );
    select.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false);
  };

  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Tab') {
      // Start the browser's normal Tab traversal at the field, not at the
      // portal appended to the end of body. Cleanup must not steal that focus.
      restoreFocus.current = false;
      triggerRef.current?.focus();
      setOpen(false);
      return;
    }
    const index = enabled.findIndex((option) => option.value === activeValue);
    let next: SelectOption | undefined;
    if (event.key === 'ArrowDown') next = enabled[(index + 1) % enabled.length];
    else if (event.key === 'ArrowUp') next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled.at(-1);
    else if (event.key === 'Enter') {
      event.preventDefault();
      const option = enabled.find((item) => item.value === activeValue);
      if (option) choose(option);
      return;
    } else if (
      !hasSearch &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = Date.now();
      typeahead.current = {
        value: (now - typeahead.current.time < 500 ? typeahead.current.value : '') + event.key,
        time: now,
      };
      next = enabled.find((option) =>
        option.label.toLocaleLowerCase().startsWith(typeahead.current.value.toLocaleLowerCase()),
      );
    } else return;
    event.preventDefault();
    if (next) setActive(next.value);
  };

  const renderOption = (option: SelectOption) => (
    <li
      key={option.value}
      id={optionId(option.value)}
      role="option"
      aria-selected={selected === option.value}
      aria-disabled={option.disabled || undefined}
      data-active={activeValue === option.value || undefined}
      onPointerMove={() => {
        if (!option.disabled) setActive(option.value);
      }}
      onClick={() => choose(option)}
      {...stylex.props(
        styles.option,
        activeValue === option.value && styles.active,
        option.disabled && styles.disabled,
      )}
    >
      <span {...stylex.props(styles.value)}>{option.label}</span>
      {selected === option.value ? (
        <Icon name="check" aria-hidden {...stylex.props(fieldSkin.glyph)} />
      ) : null}
    </li>
  );

  return (
    <FieldShell
      id={id}
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      invalid={invalid}
      xstyle={xstyle}
    >
      <span ref={wrapperRef} {...stylex.props(styles.wrap)}>
        <select
          {...nativeProps}
          ref={nativeRef}
          value={value}
          defaultValue={defaultValue ?? (placeholder ? '' : undefined)}
          disabled={disabled}
          aria-hidden
          tabIndex={-1}
          onBlur={onBlur}
          onInvalid={(event) => {
            triggerRef.current?.focus();
            onInvalid?.(event);
          }}
          onChange={(event) => {
            setLocalValue(event.target.value);
            onChange?.(event);
          }}
          {...stylex.props(styles.native)}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((item) =>
            isGroup(item) ? (
              <optgroup key={item.label} label={item.label}>
                {item.options.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </option>
            ),
          )}
        </select>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          id={id}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-invalid={invalid || undefined}
          aria-required={nativeProps.required || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onBlur={(event) => {
            if (!panelRef.current?.contains(event.relatedTarget)) {
              nativeRef.current?.dispatchEvent(
                new FocusEvent('focusout', { bubbles: true, relatedTarget: event.relatedTarget }),
              );
            }
          }}
          onClick={() => {
            if (open) setOpen(false);
            else show();
          }}
          onKeyDown={(event) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
              event.preventDefault();
              show();
            }
          }}
          {...stylex.props(
            fieldSkin.base,
            fieldSkin.input,
            focus.ring,
            styles.trigger,
            size === 'chrome' && styles.chrome,
            invalid && fieldSkin.invalid,
            disabled && fieldSkin.disabled,
          )}
        >
          {startIcon ? <span aria-hidden>{startIcon}</span> : null}
          <span
            {...stylex.props(styles.value, !selected && Boolean(placeholder) && styles.secondary)}
          >
            {!selected && placeholder
              ? placeholder
              : flat.find((option) => option.value === selected)?.label}
          </span>
          <Icon name="chevronDown" aria-hidden {...stylex.props(fieldSkin.glyph)} />
        </button>
      </span>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              data-ui-kit-layer
              {...stylex.props(styles.panel)}
              style={position}
              onKeyDown={keyDown}
            >
              {hasSearch ? (
                <input
                  ref={(node) => {
                    focusRef.current = node;
                  }}
                  type="search"
                  role="searchbox"
                  aria-label={labels.search}
                  placeholder={labels.search}
                  aria-controls={listboxId}
                  aria-activedescendant={activeId}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(undefined);
                  }}
                  {...stylex.props(fieldSkin.base, fieldSkin.input, styles.chrome, styles.search)}
                />
              ) : null}
              <ul
                ref={(node) => {
                  if (!hasSearch) focusRef.current = node;
                }}
                role="listbox"
                id={listboxId}
                aria-labelledby={id}
                aria-activedescendant={!hasSearch ? activeId : undefined}
                tabIndex={-1}
                {...stylex.props(styles.list)}
              >
                {filtered.map((item, index) =>
                  isGroup(item) ? (
                    <li key={item.label} role="presentation">
                      <div role="group" aria-labelledby={`${id}-group-${index}`}>
                        <div
                          id={`${id}-group-${index}`}
                          {...stylex.props(text.micro, styles.secondary, styles.heading)}
                        >
                          {item.label}
                        </div>
                        <ul role="presentation" {...stylex.props(styles.list)}>
                          {item.options.map(renderOption)}
                        </ul>
                      </div>
                    </li>
                  ) : (
                    renderOption(item)
                  ),
                )}
              </ul>
              {filtered.length === 0 ? (
                <div {...stylex.props(styles.secondary, styles.heading)}>{labels.empty}</div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </FieldShell>
  );
}
