import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Choose through the public listbox, including fields rendered in a portal. */
export async function chooseOption(
  user: UserEvent,
  trigger: HTMLElement,
  option: string | RegExp,
): Promise<void> {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
}

/** Read the native form value belonging to a ComboboxField trigger. */
export function selectedValue(trigger: HTMLElement): string {
  const select = trigger.parentElement?.querySelector('select');
  if (!select) throw new Error('Expected a ComboboxField trigger with a native select sibling');
  return select.value;
}
