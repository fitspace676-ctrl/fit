import { describe, it, expect } from 'vitest';
import type { AutomationCondition } from '@fit/types';
import { applyDraftToForm, formToDraft, type FormState } from './draft-form';

const EMPTY: FormState = {
  name: '',
  triggerType: '',
  days: '',
  timingAmount: '0',
  timingUnit: 'd',
  timingDirection: 'now',
  conditions: [],
  actionType: 'push_notification',
  subject: '',
  body: '',
  active: true,
};

const BRANCH: AutomationCondition = {
  field: 'member_branch',
  operator: 'eq',
  value: 'loc-1',
};

describe('applyDraftToForm', () => {
  it('sets every field from a full draft', () => {
    const form = applyDraftToForm(EMPTY, {
      name: 'Expiry reminder',
      triggerType: 'membership_expiring',
      triggerConfig: { days: 5 },
      timingOffset: '-2d',
      conditions: [BRANCH],
      actionType: 'email',
      actionConfig: { subject: 'Renew', body: 'Hi {{member_first_name}}' },
      active: false,
    });
    expect(form).toEqual({
      name: 'Expiry reminder',
      triggerType: 'membership_expiring',
      days: '5',
      timingAmount: '2',
      timingUnit: 'd',
      timingDirection: 'before',
      conditions: [BRANCH],
      actionType: 'email',
      subject: 'Renew',
      body: 'Hi {{member_first_name}}',
      active: false,
    });
  });

  it('turns a negative offset into "now" on an event trigger', () => {
    const form = applyDraftToForm(EMPTY, { triggerType: 'member_joined', timingOffset: '-2d' });
    expect(form.timingDirection).toBe('now');
  });

  it('forces email and no conditions on a gym-recipient trigger', () => {
    const form = applyDraftToForm(
      { ...EMPTY, conditions: [BRANCH] },
      { triggerType: 'product_stock_low', actionType: 'sms', conditions: [BRANCH] },
    );
    expect(form.actionType).toBe('email');
    expect(form.conditions).toEqual([]);
  });

  it('changes only the fields a partial draft carries', () => {
    const start: FormState = {
      ...EMPTY,
      name: 'Keep me',
      triggerType: 'membership_expiring',
      days: '7',
      body: 'Old body',
      subject: 'Old',
      actionType: 'email',
    };
    const form = applyDraftToForm(start, { conditions: [BRANCH] });
    expect(form).toEqual({ ...start, conditions: [BRANCH] });
  });

  it('keeps the day count when the trigger is unchanged, clears it when it changes', () => {
    const start: FormState = { ...EMPTY, triggerType: 'membership_expiring', days: '7' };
    expect(applyDraftToForm(start, { triggerType: 'membership_expiring' }).days).toBe('7');
    expect(applyDraftToForm(start, { triggerType: 'member_joined' }).days).toBe('');
  });
});

describe('formToDraft', () => {
  it('returns only the action type and active flag for an empty form', () => {
    expect(formToDraft(EMPTY)).toEqual({
      actionType: 'push_notification',
      active: true,
    });
  });

  it('returns every field for a filled form', () => {
    expect(
      formToDraft({
        name: '  Expiry reminder ',
        triggerType: 'membership_expiring',
        days: '5',
        timingAmount: '2',
        timingUnit: 'd',
        timingDirection: 'before',
        conditions: [BRANCH],
        actionType: 'email',
        subject: ' Renew ',
        body: ' Hi ',
        active: false,
      }),
    ).toEqual({
      name: 'Expiry reminder',
      triggerType: 'membership_expiring',
      triggerConfig: { days: 5 },
      timingOffset: '-2d',
      conditions: [BRANCH],
      actionType: 'email',
      actionConfig: { body: 'Hi', subject: 'Renew' },
      active: false,
    });
  });
});
