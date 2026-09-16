// @fit/mobile — the classes filter sheet (`mobile-classes.tsx:441-529`).
//
// Two wrapped chip groups and two buttons. Copy is `classes.filters` (D10):
// `member.classes` has no filter block at all, and the top-level one carries all
// thirteen keys including both "all …" options.
//
// ---------------------------------------------------------------------------
// THE CHIPS APPLY IMMEDIATELY. THE PRIMARY BUTTON ONLY CLOSES.
//
// That is the artboard's own behaviour, not a simplification: every chip there
// is `onClick={() => setTrainer(t)}` against the page's live state, and the
// footer's "ჩვენება" is `onClick={() => setFiltersOpen(false)}`. Applying live
// is also what makes the header's count badge readable — it moves as you press.
//
// The consequence for copy is that the primary button is a CLOSE, and
// `classes.modal.close` is the real, translated string for that. The artboard's
// own word is "Show", which has no key in either catalogue; inventing one is
// exactly what this stage was told not to do. Flagged in the report.
//
// ---------------------------------------------------------------------------
// THE CATEGORY FACET IS NOT IN HERE.
//
// It is the chip rail on the screen itself, where the artboard puts it, and it
// still counts toward the header badge (`activeFilterCount`). A member who
// narrowed to "Spin" from the rail and forgot has the same problem as one who
// narrowed by trainer, which is why the badge counts all three and the sheet
// only offers the two the rail cannot.

import { View } from 'react-native';
import { Button, Chip, Eyebrow, Sheet, spacing } from '@fit/ui-mobile';

import { useI18n } from '../../providers/I18nProvider';
import { EMPTY_FILTERS, type ClassFacets, type ClassFilterState } from './schedule';

export interface ClassFilterSheetProps {
  open: boolean;
  onClose: () => void;
  /** The options present in the loaded week. */
  facets: ClassFacets;
  filters: ClassFilterState;
  onChange: (next: ClassFilterState) => void;
  testID?: string;
}

/** One wrapped group of single-select chips, with its "all" reset at the head. */
function ChipGroup({
  label,
  allLabel,
  options,
  value,
  onSelect,
  testID,
}: {
  label: string;
  allLabel: string;
  options: readonly string[];
  value: string | null;
  onSelect: (next: string | null) => void;
  testID: string;
}) {
  return (
    <View style={{ gap: spacing[3] }}>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Chip
          label={allLabel}
          selected={value === null}
          onPress={() => {
            onSelect(null);
          }}
          size="sm"
          // ==================================================================
          // `quiet` + `accent`, NOT the defaults. `chip.tsx` documents this
          // exact pair and this exact case: the default `surface` tone is
          // `backgroundCard`, which inside a sheet is the SAME ink-900 the
          // panel is painted with — so an unselected chip had no chip at all
          // and six trainer and location names floated as bare grey text. One
          // surface higher (`quiet` = ink-800) is the sheet's card step, and
          // the accent fill is free here because the lime membership block is
          // not on screen behind a sheet.
          // ==================================================================
          tone="quiet"
          selectedFill="accent"
          testID={`${testID}-all`}
        />
        {options.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={value === option}
            onPress={() => {
              // Pressing the selected chip clears it — the artboard has no
              // deselect, but a single-select group with no way back to "all"
              // except a separate chip is one tap longer for no reason, and
              // `accessibilityState.selected` already announces the toggle.
              onSelect(value === option ? null : option);
            }}
            size="sm"
            tone="quiet"
            selectedFill="accent"
            testID={`${testID}-${option}`}
          />
        ))}
      </View>
    </View>
  );
}

/** The filter sheet. Single-instance per screen — see `Sheet`'s own header. */
export function ClassFilterSheet({
  open,
  onClose,
  facets,
  filters,
  onChange,
  testID = 'classes-filters',
}: ClassFilterSheetProps) {
  const { t } = useI18n();

  return (
    <Sheet
      testID={testID}
      open={open}
      onClose={onClose}
      title={t('classes.filters.groupLabel')}
      closeAccessibilityLabel={t('classes.modal.close')}
      // A FRAGMENT, NOT A `<View style={{flexDirection:'row'}}>`.
      //
      // `Sheet` already lays its footer slot out as a row (see its own footer
      // block). Nesting a second row inside it made the two buttons children of
      // a CONTENT-WIDTH box, so `flexBasis: 0` resolved against nothing and both
      // collapsed to their padding: "ფილტრების გასუფთავება" rendered as an empty
      // 40×44 grey square and "დახურვა" as a bare checkmark.
      // `components/shop/price-changed-sheet.tsx` has the correct shape.
      footer={
        <>
          <Button
            label={t('classes.filters.clear')}
            onPress={() => {
              onChange(EMPTY_FILTERS);
            }}
            variant="secondary"
            style={{ flexGrow: 1, flexBasis: 0 }}
            testID={`${testID}-clear`}
          />
          <Button
            label={t('classes.modal.close')}
            onPress={onClose}
            icon="check"
            style={{ flexGrow: 1, flexBasis: 0 }}
            testID={`${testID}-apply`}
          />
        </>
      }
    >
      <View style={{ gap: spacing[6] }}>
        <ChipGroup
          label={t('classes.filters.trainer')}
          allLabel={t('classes.filters.allTrainers')}
          options={facets.trainers}
          value={filters.trainer}
          onSelect={(trainer) => {
            onChange({ ...filters, trainer });
          }}
          testID={`${testID}-trainer`}
        />
        <ChipGroup
          label={t('classes.filters.location')}
          allLabel={t('classes.filters.allLocations')}
          options={facets.locations}
          value={filters.location}
          onSelect={(location) => {
            onChange({ ...filters, location });
          }}
          testID={`${testID}-location`}
        />
      </View>
    </Sheet>
  );
}
