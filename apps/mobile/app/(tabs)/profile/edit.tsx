// `/profile/edit` — the member's own name and phone. `PATCH /me/profile`.
//
// ===========================================================================
// WHY A ROUTE AND NOT A SHEET OFF THE PROFILE HEADER.
//
// Two reasons, and the first one is structural rather than a matter of taste.
//
//   1. **`/profile` already owns its one sheet.** `Sheet` is single-instance
//      per screen — two `Modal`s whose `visible` overlaps for even one frame
//      flash black on iOS — and `app/(tabs)/profile/index.tsx` mounts
//      `FreezeSheet`. An edit sheet there would be the second, and the rule
//      the package states ("hold ONE `sheet: <name> | null`") would have had to
//      be threaded through a screen that has no other reason to know about it.
//
//   2. **A form wants a screen.** Three fields, a keyboard that covers the
//      bottom third, per-field error text, and a Save that has to stay
//      reachable while the keyboard is up. `goals.tsx` solved exactly that with
//      `Screen`'s `footer`, and this screen is deliberately the same shape:
//      AppBar + back, sections above, one plate with the note and the button
//      pinned below. Mirroring it was the brief; inventing a second form idiom
//      is how a codebase ends up with two.
//
// ---------------------------------------------------------------------------
// SAVE IS LIVE, NEVER DISABLED — `goals.tsx`'s rule, and for its reason.
//
// A disabled `Button` swallows its own press, so the handler never runs and
// nothing on screen ever says what is wrong. So the button stays pressable and
// an invalid press turns the explanation ON (`showErrors`), which is also what
// `app/(join)/checkout.tsx` does. The one thing that *is* refused silently is a
// second press while `busy` — `Button` already swallows that.
//
// ---------------------------------------------------------------------------
// "NOTHING CHANGED" IS A STATE, NOT A NO-OP.
//
// `profilePatch` returns `null` when the draft equals the server's record, and
// the footer says so instead of firing an empty `.strict()` PATCH. That empty
// body is a legal 200 that writes nothing, so the member would get a "Profile
// saved" toast for a save that did not happen — which is indistinguishable, to
// them, from one that did.
//
// ---------------------------------------------------------------------------
// EMAIL IS SHOWN AND IS NOT EDITABLE, AND IT SAYS SO.
//
// `updateMeProfileSchema` is `{ name?, phone? }` and `.strict()`: an `email`
// key is a 400. The web portal renders an email input anyway, drops the value
// before the request, and shows a success toast — see `profile-form.ts`. A
// disabled field with the reason under it is the honest version of the same
// row, and it is worth keeping rather than dropping because the email is the
// member's sign-in identity and the commonest thing they come here to check.
//
// ---------------------------------------------------------------------------
// `member.goals.signIn`'s ARGUMENT APPLIES HERE TOO: this route is `auth`
// (`ROUTE_POLICY` has `'(tabs)/profile': 'auth'`, matched by longest prefix),
// so `resolveRedirect` sends a signed-out visitor to `/login?next=…` before the
// component mounts. There is deliberately no signed-out branch below.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppBar,
  Button,
  EmptyState,
  IconButton,
  InlineNote,
  Screen,
  Skeleton,
  Surface,
  TextField,
  layout,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { sectionPhase } from '../../../components/home/section';
import {
  NAME_MAX,
  PHONE_MAX,
  draftErrors,
  isValidDraft,
  profileErrorKey,
  profilePatch,
  toDraft,
  type ProfileDraft,
} from '../../../components/profile/profile-form';
import { useMyProfile } from '../../../hooks/queries/useAccount';
import { useUpdateMyProfile } from '../../../hooks/mutations/useAccountMutations';
import { useGymId } from '../../../hooks/useActiveGym';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

export default function EditProfileScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';

  const query = useMyProfile();
  const save = useUpdateMyProfile();

  const profile = query.data?.profile;

  /** `null` is "not seeded from the server yet", distinct from "seeded and emptied". */
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Seed ONCE per arrival of a payload, and never over an edit in progress — a
  // background refetch landing mid-sentence must not discard what is being
  // typed. `goals.tsx` makes the same call for the same reason.
  useEffect(() => {
    if (profile === undefined) return;
    setDraft((current) => current ?? toDraft(profile));
  }, [profile]);

  const phase = sectionPhase(query, online);
  const current = draft ?? toDraft(profile);

  const errors = useMemo(() => draftErrors(current, profile), [current, profile]);
  const valid = isValidDraft(current, profile);
  const patch = useMemo(() => profilePatch(current, profile), [current, profile]);

  const update = useCallback((field: keyof ProfileDraft, value: string) => {
    setDraft((existing) => ({ ...(existing ?? { name: '', phone: '' }), [field]: value }));
  }, []);

  const retry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile(scoped) });
  }, [queryClient, scoped]);

  const submit = useCallback(() => {
    if (patch === null || !valid || save.isPending) return;
    save.mutate(patch, {
      onSuccess: (response) => {
        // Re-seed from the server's answer, so a trimmed name is what the
        // member ends up looking at rather than what they typed. The hook has
        // already written this response into the cache and invalidated behind
        // it; nothing here calls `.refetch()`.
        setDraft(toDraft(response.profile));
        setShowErrors(false);
        toast.success(t('member.profile.saved'));
      },
      onError: (error: unknown) => {
        // By `code`, never by status.
        toast.error(t(profileErrorKey(error)));
      },
    });
  }, [patch, valid, save, toast, t]);

  /** The Save press, whatever state the form is in. See the header. */
  const attemptSave = useCallback(() => {
    if (patch !== null && valid) submit();
    else setShowErrors(true);
  }, [patch, valid, submit]);

  /**
   * The one sentence under the button, or none.
   *
   * Ordered by what the member can act on: a field that would be refused beats
   * "nothing has changed", because the second is only true *because* of the
   * first when both are present.
   */
  const note = !showErrors
    ? null
    : errors.name === 'cleared'
      ? t('member.profile.mobile.edit.nameRequired')
      : errors.name === 'tooLong'
        ? t('member.profile.mobile.edit.nameTooLong', { max: NAME_MAX })
        : errors.phone === 'tooLong'
          ? t('member.profile.mobile.edit.phoneTooLong', { max: PHONE_MAX })
          : patch === null
            ? t('member.profile.mobile.edit.noChanges')
            : null;

  return (
    <Screen
      testID="profile-edit-screen"
      header={
        <AppBar
          eyebrow={t('member.profile.eyebrow')}
          title={t('member.profile.mobile.menu.profile')}
          subtitle={t('member.profile.mobile.edit.subtitle')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="profile-edit-back"
            />
          }
        />
      }
      footer={
        // Only once there is a form to save. An error or a skeleton with a
        // permanently dead "Save" stuck under it offers a control that cannot
        // do anything — `goals.tsx` makes the same call for its empty state.
        phase === 'ready' ? (
          <Surface
            testID="profile-edit-footer"
            tone="card"
            radius="container"
            padding={4}
            style={{ gap: spacing[2] }}
          >
            {note === null ? null : (
              <InlineNote testID="profile-edit-note" icon="info">
                {note}
              </InlineNote>
            )}
            <Button
              testID="profile-edit-save"
              label={t('member.profile.save')}
              busyLabel={t('member.profile.saving')}
              busy={save.isPending}
              // LIVE, always — see the header. `busy` is not `disabled`.
              fullWidth
              onPress={attemptSave}
            />
          </Surface>
        ) : undefined
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="profile-edit-offline" />}

        {phase === 'loading' ? (
          <View
            testID="profile-edit-loading"
            accessible
            accessibilityLabel={t('member.profile.mobile.edit.loading')}
            style={{ gap: spacing[3] }}
          >
            <Skeleton height={84} radius={22} />
            <Skeleton height={84} radius={22} />
            <Skeleton height={84} radius={22} />
          </View>
        ) : null}

        {phase === 'error' ? (
          <EmptyState
            testID="profile-edit-error"
            icon="info"
            title={t('member.profile.mobile.edit.error')}
            action={{
              label: t('member.profile.mobile.edit.retry'),
              onPress: retry,
              variant: 'secondary',
              icon: 'refresh',
              testID: 'profile-edit-retry',
            }}
          />
        ) : null}

        {phase === 'ready' ? (
          <Surface tone="card" padding={4} radius={22}>
            <View style={{ gap: spacing[4] }} testID="profile-edit-form">
              <TextField
                testID="profile-edit-name"
                label={t('member.profile.mobile.edit.name')}
                placeholder={t('member.profile.namePlaceholder')}
                value={current.name}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                maxLength={NAME_MAX}
                {...(showErrors && errors.name !== null
                  ? {
                      error:
                        errors.name === 'cleared'
                          ? t('member.profile.mobile.edit.nameRequired')
                          : t('member.profile.mobile.edit.nameTooLong', { max: NAME_MAX }),
                    }
                  : {})}
                onChangeText={(value) => {
                  update('name', value);
                }}
              />

              <TextField
                testID="profile-edit-phone"
                label={t('member.profile.fields.phone')}
                hint={t('member.profile.mobile.edit.phoneHint')}
                value={current.phone}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={PHONE_MAX}
                {...(showErrors && errors.phone !== null
                  ? { error: t('member.profile.mobile.edit.phoneTooLong', { max: PHONE_MAX }) }
                  : {})}
                onChangeText={(value) => {
                  update('phone', value);
                }}
              />

              {/* Read-only, and it says why. `.strict()` makes an `email` key a
                  400, so there is no request this field could produce. */}
              <TextField
                testID="profile-edit-email"
                label={t('member.profile.fields.email')}
                hint={t('member.profile.mobile.edit.emailLocked')}
                value={profile?.email ?? ''}
                disabled
              />
            </View>
          </Surface>
        ) : null}
      </View>
    </Screen>
  );
}
