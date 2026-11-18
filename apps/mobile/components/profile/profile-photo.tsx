import { useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Text, spacing, useToast } from '@fit/ui-mobile';
import { useI18n } from '../../providers/I18nProvider';
import {
  useRemoveProfilePhoto,
  useUploadProfilePhoto,
} from '../../hooks/mutations/useProfilePhotoMutations';
import { InvalidProfilePhotoTypeError } from '../../lib/api/profile-photo';
import { trainerInitials } from '../trainers/trainer-filters';

export function ProfilePhoto({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const upload = useUploadProfilePhoto();
  const remove = useRemoveProfilePhoto();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    previous: string | null | undefined;
    url: string | null;
  } | null>(null);
  const visibleUrl = preview && preview.previous === photoUrl ? preview.url : photoUrl;

  async function change(pick: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      if (pick) {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (result.canceled || !result.assets[0]) return;
        const saved = await upload.mutateAsync(result.assets[0]);
        setPreview({ previous: photoUrl, url: saved.photoUrl });
      } else {
        const saved = await remove.mutateAsync();
        setPreview({ previous: photoUrl, url: saved.photoUrl });
      }
    } catch (error) {
      toast.error(
        t(
          error instanceof InvalidProfilePhotoTypeError
            ? 'member.profile.photo.invalidType'
            : 'member.profile.photo.error',
        ),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function openMenu() {
    if (locked.current) return;
    Alert.alert(t('member.profile.photo.manage'), undefined, [
      {
        text: t('member.profile.photo.choose'),
        onPress: () => {
          void change(true);
        },
      },
      ...(visibleUrl
        ? [
            {
              text: t('member.profile.photo.remove'),
              style: 'destructive' as const,
              onPress: () => {
                void change(false);
              },
            },
          ]
        : []),
      { text: t('member.profile.photo.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <View style={{ gap: spacing[2], alignItems: 'center' }}>
      <Pressable
        testID="profile-photo-manage"
        accessibilityRole="button"
        accessibilityLabel={t('member.profile.photo.manage')}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={openMenu}
      >
        <Avatar
          size={72}
          ring="accent"
          initials={trainerInitials(name)}
          {...(visibleUrl ? { source: { uri: visibleUrl } } : {})}
          testID="profile-avatar"
        />
      </Pressable>
      {busy ? (
        <Text
          variant="bodySmall"
          color="textSecondary"
          accessibilityLiveRegion="polite"
          testID="profile-photo-progress"
        >
          {t('member.profile.photo.saving')}
        </Text>
      ) : null}
    </View>
  );
}
