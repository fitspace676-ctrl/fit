import type {
  AutomationActionType,
  AutomationCondition,
  AutomationDraft,
  AutomationTriggerType,
} from '@fit/types';
import { TRIGGER_META, triggerNeedsDays } from './automation-meta';
import { timingOffset, timingState, validTiming, type TimingState } from './timing-field';

/** The builder's controlled form state: inputs as the browser hands them over. */
export interface FormState extends TimingState {
  name: string;
  triggerType: AutomationTriggerType | '';
  days: string;
  conditions: AutomationCondition[];
  actionType: AutomationActionType;
  subject: string;
  body: string;
  active: boolean;
}

/**
 * The form as a partial rule for the AI assistant: only the fields the operator
 * has actually filled in, so a refinement edits what is there instead of
 * inventing values for blanks.
 */
export function formToDraft(form: FormState): AutomationDraft {
  const draft: AutomationDraft = {};
  const name = form.name.trim();
  if (name) draft.name = name;
  if (form.triggerType !== '') {
    draft.triggerType = form.triggerType;
    const days = Number.parseInt(form.days, 10);
    if (triggerNeedsDays(form.triggerType) && days >= 1) draft.triggerConfig = { days };
  }
  // The untouched default ("immediately", no trigger yet) is not a choice the
  // operator made, so it is left for the assistant to decide.
  if (validTiming(form)) {
    const offset = timingOffset(form);
    if (offset !== '0d' || form.triggerType !== '') draft.timingOffset = offset;
  }
  if (form.conditions.length > 0) draft.conditions = form.conditions;
  draft.actionType = form.actionType;
  const body = form.body.trim();
  if (body) {
    const subject = form.subject.trim();
    draft.actionConfig = {
      body,
      ...(form.actionType === 'email' && subject ? { subject } : {}),
    };
  }
  draft.active = form.active;
  return draft;
}

/**
 * Apply an assistant draft to the form. Only the fields the draft carries are
 * changed; everything else the operator typed stays. The same invariants the
 * builder enforces by hand hold here too: a new trigger resets a stale day
 * count, an event trigger cannot fire "before", and a gym-recipient trigger is
 * email-only with no member conditions.
 */
export function applyDraftToForm(form: FormState, draft: AutomationDraft): FormState {
  const next: FormState = { ...form };
  if (draft.name !== undefined) next.name = draft.name;

  if (draft.triggerType !== undefined) {
    if (draft.triggerType !== form.triggerType) next.days = '';
    next.triggerType = draft.triggerType;
  }
  if (draft.triggerConfig?.days !== undefined) next.days = String(draft.triggerConfig.days);

  const trigger = next.triggerType;
  const meta = trigger !== '' ? TRIGGER_META.get(trigger) : undefined;
  const event = meta?.kind === 'event';
  // Re-derive the timing when the draft sets it, or when a new trigger may have
  // made the current one impossible (an event trigger has no "before").
  if (draft.timingOffset !== undefined) {
    Object.assign(next, timingState(draft.timingOffset, event));
  } else if (draft.triggerType !== undefined && validTiming(form)) {
    Object.assign(next, timingState(timingOffset(form), event));
  }

  if (draft.conditions !== undefined) next.conditions = draft.conditions;
  if (draft.actionType !== undefined) next.actionType = draft.actionType;
  if (draft.actionConfig !== undefined) {
    next.body = draft.actionConfig.body;
    next.subject = draft.actionConfig.subject ?? '';
  }
  if (draft.active !== undefined) next.active = draft.active;

  if (meta?.recipient === 'gym') {
    next.actionType = 'email';
    next.conditions = [];
  }
  return next;
}
