'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  AUTOMATION_CONDITION_FIELDS,
  OPERATORS_BY_TYPE,
  automationConditionsSchema,
  type AutomationCondition,
  type AutomationCatalogResponse,
} from '@fit/types';
import { Button, Field, FieldGroup, SelectField } from '@fit/ui-kit';

export type BuilderCatalog = Pick<
  AutomationCatalogResponse,
  'conditionFields' | 'conditionOptions' | 'timings'
>;

const styles = stylex.create({
  rows: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-element)',
  },
  hint: { margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  error: { margin: 0, fontSize: '0.75rem', color: 'var(--color-error)' },
});

export function ConditionBuilder({
  conditions,
  catalog,
  onChange,
}: {
  conditions: AutomationCondition[];
  catalog: BuilderCatalog;
  onChange: (conditions: AutomationCondition[]) => void;
}) {
  const t = useTranslations('admin.automation');
  function replace(index: number, condition: AutomationCondition) {
    onChange(conditions.map((entry, i) => (i === index ? condition : entry)));
  }
  return (
    <FieldGroup label={t('form.conditions')}>
      <div {...stylex.props(styles.rows)}>
        {conditions.length === 0 && (
          <p {...stylex.props(styles.hint)}>{t('form.conditionsEmpty')}</p>
        )}
        {conditions.map((condition, index) => {
          const meta = AUTOMATION_CONDITION_FIELDS.find((field) => field.key === condition.field)!;
          const empty = condition.operator === 'is_empty' || condition.operator === 'is_not_empty';
          const multiple = condition.operator === 'in' || condition.operator === 'not_in';
          const source = meta.optionsSource;
          const options =
            meta.enumValues?.map((value) => ({
              value,
              label: t(`conditionValues.${meta.key}.${value}`),
            })) ??
            (source === 'tags'
              ? catalog.conditionOptions.tags.map((value) => ({ value, label: value }))
              : source
                ? catalog.conditionOptions[source].map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))
                : []);
          // Retain saved IDs/tags when their catalog entry has been removed or the catalog is unavailable.
          const saved = Array.isArray(condition.value)
            ? condition.value
            : typeof condition.value === 'string'
              ? [condition.value]
              : [];
          if (!meta.enumValues)
            for (const value of saved) {
              if (value && !options.some((option) => option.value === value))
                options.push({ value, label: value });
            }
          return (
            <div key={index}>
              {index > 0 && <p {...stylex.props(styles.hint)}>{t('form.conditionsAnd')}</p>}
              <div {...stylex.props(styles.row)}>
                <SelectField
                  label={t('form.conditionsField')}
                  value={condition.field}
                  onChange={(e) => {
                    const field = AUTOMATION_CONDITION_FIELDS.find(
                      (entry) => entry.key === e.target.value,
                    )!;
                    replace(index, {
                      field: field.key,
                      operator: OPERATORS_BY_TYPE[field.type][0]!,
                    });
                  }}
                  options={(['member', 'subscription'] as const).map((group) => ({
                    label: t(`conditionGroups.${group}`),
                    options: AUTOMATION_CONDITION_FIELDS.filter(
                      (field) => field.group === group,
                    ).map((field) => ({
                      value: field.key,
                      label: t(`conditionFields.${field.key}`),
                    })),
                  }))}
                />
                <SelectField
                  label={t('form.conditionsOperator')}
                  value={condition.operator}
                  onChange={(e) =>
                    replace(index, {
                      field: condition.field,
                      operator: e.target.value as AutomationCondition['operator'],
                    })
                  }
                  options={OPERATORS_BY_TYPE[meta.type].map((operator) => ({
                    value: operator,
                    label: t(`conditionOperators.${operator}`),
                  }))}
                />
                {!empty &&
                  (meta.type === 'number' || meta.type === 'date' ? (
                    <Field
                      label={t('form.conditionsValue')}
                      type="number"
                      value={typeof condition.value === 'number' ? condition.value : ''}
                      onChange={(e) =>
                        replace(index, {
                          ...condition,
                          value: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  ) : meta.type === 'list' && catalog.conditionOptions.tags.length === 0 ? (
                    <Field
                      label={t('form.conditionsValue')}
                      value={typeof condition.value === 'string' ? condition.value : ''}
                      onChange={(e) => replace(index, { ...condition, value: e.target.value })}
                    />
                  ) : (
                    <SelectField
                      label={t('form.conditionsValue')}
                      multiple={multiple}
                      placeholder={multiple ? undefined : t('form.conditionsChoose')}
                      value={
                        multiple
                          ? Array.isArray(condition.value)
                            ? condition.value
                            : []
                          : typeof condition.value === 'string'
                            ? condition.value
                            : ''
                      }
                      onChange={(e) =>
                        replace(index, {
                          ...condition,
                          value: multiple
                            ? Array.from(e.target.selectedOptions, (option) => option.value)
                            : e.target.value,
                        })
                      }
                      options={options}
                    />
                  ))}
                <Button
                  variant="secondary"
                  size="inline"
                  label={t('form.conditionsRemove')}
                  onClick={() => onChange(conditions.filter((_, i) => i !== index))}
                />
              </div>
            </div>
          );
        })}
        {!automationConditionsSchema.safeParse(conditions).success && (
          <p role="alert" {...stylex.props(styles.error)}>
            {t('errors.conditionsInvalid')}
          </p>
        )}
        <Button
          variant="secondary"
          size="card"
          disabled={conditions.length >= 10}
          label={t('form.conditionsAdd')}
          onClick={() => onChange([...conditions, { field: 'member_gender', operator: 'eq' }])}
        />
      </div>
    </FieldGroup>
  );
}
