// One service in the catalogue, with a schedule that expands under it.
//
// Ported from `apps/web/src/components/services/ServiceCard.tsx`. Copy family:
// the top-level `services` namespace (D10 — there is no `member.services`).
//
// TWO THINGS THAT LOOK LIKE STYLE AND ARE NOT:
//
//   1. The card is NOT one big pressable. It carries two controls — the
//      schedule disclosure and "Book a session" — and a card that is itself a
//      button containing two buttons gives a screen-reader user three stops
//      that do different things and no way to tell which is which. The same
//      rule `PersonRow` states in its own header.
//
//   2. The schedule disclosure states its own next action IN ITS LABEL —
//      "When it runs" / "Hide dates", which the catalogue carries as two
//      separate strings for exactly this. `Button` takes no
//      `accessibilityState`, so the label IS the state here; the panel appearing
//      directly beneath a control whose label just changed is what a screen
//      reader announces. (An `expanded` state on `Button` is a `ui-mobile`
//      change and is flagged in C3b's report rather than forked locally.)

import { View } from 'react-native';
import type { ServiceCard as ServiceCardModel } from '@fit/types';
import { Avatar, Button, Heading, Money, Pill, Surface, Text, spacing } from '@fit/ui-mobile';

import { formatMoney } from './money';
import { ServiceScheduleBlock } from './service-schedule';
import { trainerInitials } from '../trainers/trainer-filters';
import { useI18n } from '../../providers/I18nProvider';

/** The staff portrait on a catalogue card. */
const CARD_AVATAR = 48;

export interface ServiceCardBlockProps {
  service: ServiceCardModel;
  /** Is this card's schedule panel open? At most one per screen — see the list. */
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** `YYYY-MM-DD` in the device's calendar. Injected so tests can pin it. */
  today?: string;
}

/**
 * The display name of a service.
 *
 * A PERSONAL_TRAINING service's stored `name` is generated from its trainer and
 * is not what the member should read; the catalogue carries `services.ptTitle`
 * for exactly that. A CUSTOM service's name is the gym's own words.
 *
 * Exported because the detail screen titles itself the same way, and two
 * screens deriving the same title separately is two screens that can disagree.
 */
export function serviceTitle(
  service: Pick<ServiceCardModel, 'type' | 'name' | 'staff'>,
  ptTitle: (staff: string) => string,
): string {
  return service.type === 'PERSONAL_TRAINING' ? ptTitle(service.staff.name) : service.name;
}

export function ServiceCardBlock({
  service,
  expanded,
  onToggle,
  onOpen,
  today,
}: ServiceCardBlockProps) {
  const { t, locale } = useI18n();

  const title = serviceTitle(service, (staff) => t('services.ptTitle', { staff }));
  const price = formatMoney(service.priceMinor, service.currency, locale);
  const meta = [
    t('services.card.with', { staff: service.staff.name }),
    t('services.card.minutes', { count: service.durationMinutes }),
  ].join(' · ');

  return (
    <Surface tone="card" padding={4} radius={26} testID={`service-card-${service.id}`}>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Avatar
            size={CARD_AVATAR}
            initials={trainerInitials(service.staff.name)}
            {...(service.staff.photoUrl ? { source: { uri: service.staff.photoUrl } } : {})}
          />
          <View style={{ flex: 1, gap: spacing[1] }}>
            {/* `level={4}` — a card title, not the screen's title. The ordered
                header list for the list screen is therefore
                [screen title, …one per card]. */}
            <Heading level={4} numberOfLines={2}>
              {title}
            </Heading>
            <Text variant="caption" color="textSecondary">
              {meta}
            </Text>
          </View>
          <Pill tone={service.type === 'PERSONAL_TRAINING' ? 'accent' : 'outline'} size="sm">
            {t(`services.type.${service.type}`)}
          </Pill>
        </View>

        {service.description !== '' ? (
          <Text variant="bodySmall" color="textSecondary">
            {service.description}
          </Text>
        ) : null}

        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
          // ONE node: "45,00 ₾" and "per session" are one fact, and split they
          // announce as a bare number followed by an orphan phrase.
          accessible
          accessibilityLabel={`${price} ${t('services.card.perSession')}`}
        >
          <Money accessibilityLabel={price} variant="monoBody">
            {price}
          </Money>
          <Text variant="caption" color="textSecondary">
            {t('services.card.perSession')}
          </Text>
        </View>

        <Button
          label={expanded ? t('services.card.hideSchedule') : t('services.card.showSchedule')}
          variant="secondary"
          size="md"
          icon="clock"
          onPress={onToggle}
          testID={`service-schedule-toggle-${service.id}`}
        />

        {expanded ? (
          <ServiceScheduleBlock
            schedule={service.schedule}
            {...(today !== undefined ? { today } : {})}
            testID={`service-schedule-${service.id}`}
          />
        ) : null}

        <Button
          label={t('services.card.bookSession')}
          // The label alone is identical on every card in the list; the hint
          // says which service this one books.
          accessibilityHint={title}
          fullWidth
          onPress={onOpen}
          testID={`service-open-${service.id}`}
        />
      </View>
    </Surface>
  );
}
