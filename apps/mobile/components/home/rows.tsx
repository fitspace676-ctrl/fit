// @fit/mobile — the rows Home draws under its four list sections.
//
// Thin adapters, one per section: a wire shape in, a `@fit/ui-mobile`
// component out, with every string coming from `member.home` (D10). Nothing
// here fetches, routes or decides a phase — that is the screen's job — and
// nothing here formats money or a time without going through `@fit/i18n`,
// because `Intl` has no Georgian locale data and is banned by lint.
//
// ---------------------------------------------------------------------------
// THE ONE THING WORTH READING TWICE.
//
// `ListRow`, `ProductRow` and `PersonRow` each collapse to a SINGLE
// accessibility node, so anything visible inside them that carries information
// — a status pill, a price, a waitlist position — has to be in the row's
// `accessibilityLabel` as well, or a screen-reader user never hears it. Every
// row below spells its whole sentence out for that reason, not for verbosity.

import { ListRow, PersonRow, Pill, ProductRow } from '@fit/ui-mobile';
import type {
  MemberBookingHistoryEntry,
  MemberServiceSession,
  ProductSummary,
  ServiceCard,
  TrainerCard,
} from '@fit/types';
import { View } from 'react-native';

import { formatMoney } from '../services/money';
import { formatDayHeading, formatTime } from '../services/date-format';
import { trainerInitials } from '../trainers/trainer-filters';
import { useI18n } from '../../providers/I18nProvider';

/** One of the member's upcoming bookings. */
export function UpcomingBookingRow({
  entry,
  onPress,
  testID,
}: {
  entry: MemberBookingHistoryEntry;
  onPress: () => void;
  testID: string;
}) {
  const { t, locale } = useI18n();
  const instance = entry.classInstance;

  const when = `${formatDayHeading(locale, instance.startsAt)} · ${formatTime(locale, instance.startsAt)}`;
  const status =
    entry.status === 'WAITLIST'
      ? t('member.home.waitlist', { position: entry.waitlistPosition ?? 1 })
      : t('member.home.confirmed');

  return (
    <ListRow
      testID={testID}
      icon="calendar"
      title={instance.title}
      hint={when}
      onPress={onPress}
      // The pill is inside the row's one node, so the status is repeated here.
      accessibilityLabel={`${instance.title}, ${when}, ${status}`}
      trailing={
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <Pill tone={entry.status === 'WAITLIST' ? 'quiet' : 'booked'} size="sm">
            {status}
          </Pill>
        </View>
      }
    />
  );
}

/** The member's next booked PT session — one row, and no way to release it. */
export function NextSessionRow({
  session,
  onPress,
  testID,
}: {
  session: MemberServiceSession;
  onPress: () => void;
  testID: string;
}) {
  const { t, locale } = useI18n();

  const when = `${formatDayHeading(locale, session.startsAt)} · ${formatTime(locale, session.startsAt)}`;
  const meta = [when, session.serviceName, session.staffName].filter((p) => p !== '').join(' · ');

  return (
    <ListRow
      testID={testID}
      icon="dumbbell"
      title={t('member.home.nextSession')}
      hint={meta}
      onPress={onPress}
      accessibilityLabel={`${t('member.home.nextSession')}, ${meta}`}
    />
  );
}

/**
 * One of the gym's services.
 *
 * The row navigates; it does not book. `services/[id]` is `auth-soft` and owns
 * the slot picker, and a member who taps a service on Home has not yet chosen a
 * time — there is nothing here to book *with*.
 */
export function ServiceRow({
  service,
  onPress,
  testID,
}: {
  service: ServiceCard;
  onPress: () => void;
  testID: string;
}) {
  const { locale } = useI18n();
  const price = formatMoney(service.priceMinor, service.currency, locale);
  const meta = [service.staff.name, price].filter((p) => p !== '').join(' · ');

  return (
    <ListRow
      testID={testID}
      icon="dumbbell"
      title={service.name}
      hint={meta}
      onPress={onPress}
      accessibilityLabel={`${service.name}, ${meta}`}
    />
  );
}

/**
 * One product on the shop rail.
 *
 * `ProductRow` requires a SPOKEN price separate from the printed one — "from 89
 * lari", not "eight nine comma zero zero lari sign" — and this is the only place
 * in the app that can compose it, because it is the only place that knows the
 * locale AND the currency. The two strings are the same here (the formatter
 * already writes a readable amount) but the prop stays explicit rather than
 * defaulted, so a future "from {price}" prefix cannot silently reach the
 * screen reader as a symbol soup.
 */
/**
 * The width of one card on Home's shop rail.
 *
 * Wide enough for a two-line product name beside its price, narrow enough that
 * the next card peeks in at the right edge on a 390pt screen — which is what
 * tells a member the row scrolls at all.
 */
export const SHOP_CARD_WIDTH = 240;

export function ShopRailRow({
  product,
  onPress,
  testID,
}: {
  product: ProductSummary;
  onPress: () => void;
  testID: string;
}) {
  const { locale } = useI18n();
  const price = formatMoney(product.priceAmount, product.currency, locale);

  return (
    <ProductRow
      testID={testID}
      // A fixed width because the rail is a horizontal `ScrollView`: its
      // content container lays children out in a row, where a card with no
      // width of its own collapses to its text and the cards come out ragged.
      style={{ width: SHOP_CARD_WIDTH }}
      name={product.name}
      price={price}
      priceAccessibilityLabel={price}
      onPress={onPress}
    />
  );
}

/**
 * One of the gym's trainers.
 *
 * ===========================================================================
 * THERE IS NO "MY TRAINER", AND THIS ROW STOPPED PRETENDING THERE IS.
 *
 * The section this row sits in used to be headed `member.home.yourTrainer`
 * ("Your trainer") over the FIRST trainer of a roster ordered by name — the API
 * models no member↔trainer relationship at all, so "your" was a claim nothing
 * on the wire supports. The section is now `member.home.trainers` over the first
 * three, which is what the roster actually is: the gym's coaches, as a teaser
 * for `/trainers`.
 *
 * THE WHOLE ROW IS THE CONTROL, and it opens the coach's SHEET rather than
 * navigating. `PersonRow`'s two shapes are mutually exclusive by type — a row
 * that is a button containing a button gives a screen-reader user two stops that
 * do different things — and the sheet is not a preview of a screen: there is no
 * `/trainers/:id` any more, so `components/classes/trainer-sheet.tsx` IS the
 * profile (hero, bio, facts, schedule, reviews). `member.home.bookSession` goes
 * with the old shape — there was never a booking route behind that button.
 */
export function TrainerRow({
  trainer,
  onPress,
  accessibilityLabel,
  testID,
}: {
  trainer: TrainerCard;
  /** Open this trainer's sheet. The row announces once, under the label below. */
  onPress: () => void;
  /**
   * REQUIRED by `PersonRow`'s pressable shape — "Trainers, Ana Gelashvili".
   * Composed by the caller, because the noun is copy and the name is data.
   */
  accessibilityLabel: string;
  testID: string;
}) {
  const meta = [trainer.headline, ...trainer.specialties.slice(0, 2)]
    .filter((part) => part !== '')
    .join(' · ');

  return (
    <PersonRow
      testID={testID}
      name={trainer.name}
      {...(meta === '' ? {} : { meta })}
      initials={trainerInitials(trainer.name)}
      {...(trainer.avatarUrl === null ? {} : { avatarSource: { uri: trainer.avatarUrl } })}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
