import { useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboarding } from '../hooks/useOnboarding';
import { useTranslation } from '../providers';

// The three first-run slides. `key` indexes into the `onboarding.*` i18n group;
// the glyph is a lightweight stand-in for per-slide illustration art.
const SLIDES = [
  { key: 'classes', glyph: '🗓' },
  { key: 'qr', glyph: '▦' },
  { key: 'shop', glyph: '🛍' },
] as const;

// First-run onboarding: a 3-slide, horizontally swipeable intro to classes, QR
// check-in, and the shop. Reaching the end (or tapping Skip) marks onboarding
// complete in SecureStore via `useOnboarding().complete()`; the root guard then
// routes the user into the app and never shows these screens again.
export default function OnboardingScreen() {
  const t = useTranslation();
  const { complete } = useOnboarding();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const finish = (): void => {
    // Fire-and-forget: the guard reacts to the flag flipping; a SecureStore
    // write failing shouldn't trap the user on the intro.
    void complete();
  };

  const onNext = (): void => {
    if (isLast) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  const renderSlide = ({ item }: ListRenderItemInfo<(typeof SLIDES)[number]>) => (
    <View style={{ width }} className="flex-1 items-center justify-center gap-6 p-gutter">
      <Text className="text-7xl">{item.glyph}</Text>
      <Text className="text-center text-3xl font-bold tracking-tight text-white">
        {t(`onboarding.${item.key}.title`)}
      </Text>
      <Text className="max-w-xs text-center text-base text-brand-200">
        {t(`onboarding.${item.key}.body`)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-brand-950">
      <View className="flex-row justify-end p-gutter">
        <Pressable testID="onboarding-skip" accessibilityRole="button" onPress={finish} hitSlop={8}>
          <Text className="text-base font-medium text-brand-300">{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      />

      <View className="gap-6 p-gutter">
        <View className="flex-row justify-center gap-2">
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              className={`h-2 rounded-full ${
                i === index ? 'w-6 bg-brand-400' : 'w-2 bg-brand-700'
              }`}
            />
          ))}
        </View>

        <Pressable
          testID="onboarding-next"
          accessibilityRole="button"
          onPress={onNext}
          className="w-full items-center rounded-card bg-brand-500 px-6 py-3"
        >
          <Text className="text-base font-medium text-white">
            {isLast ? t('onboarding.getStarted') : t('onboarding.next')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
