// `/profile/goals` — the member's training targets. `member.goals` (16 keys).
//
// ===========================================================================
// A "SAVE" SCREEN, BECAUSE `PUT /me/goals` IS A REPLACE.
//
// The body IS the new set — a goal missing from the array is deleted, and
// `{ goals: [] }` clears them all. There is no per-goal route. So the whole set
// is edited locally and written back in one request, and Save is disabled until
// every row would be accepted (`components/goals/goal-editor.ts`), so the member
// meets a greyed button rather than a 400 they cannot read.
//
// The server caps the set at 8; `member.goals.add` disappears at that point
// rather than offering a ninth row the write would reject.
//
// ---------------------------------------------------------------------------
// `member.goals.signIn` GOES UNREAD, DELIBERATELY.
//
// This route is `auth` (`ROUTE_POLICY` has `goals: 'auth'` and
// `'(tabs)/profile': 'auth'`), so `resolveRedirect` sends a signed-out visitor
// to `/login?next=…` before the component mounts. A signed-out branch here
// would be unreachable code guarding against a state the router already owns —
// which is exactly the kind of dead defence that hides a real routing bug.
//
// ---------------------------------------------------------------------------
// THE MUTATION WRITES THROUGH **AND** INVALIDATES. That is
// `useAccountMutations.ts`'s decision, not this screen's: the write-through
// stops the form showing the old value on the frame the request resolves, and
// the invalidation catches a server-side normalisation (a trimmed label, a
// defaulted `unit`). Nothing here calls `.refetch()`.

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppBar,
  Button,
  EmptyState,
  IconButton,
  InlineNote,
  ProgressBar,
  Screen,
  Skeleton,
  Surface,
  Text,
  TextField,
  layout,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import {
  MAX_GOALS,
  draftErrors,
  emptyGoal,
  goalFraction,
  isValidSet,
  toDrafts,
  toPayload,
  type GoalDraft,
} from '../../../components/goals/goal-editor';
import { GOALS_PENDING_COPY, PROFILE_PENDING_COPY } from '../../../components/home/pending-copy';
import { sectionPhase } from '../../../components/home/section';
import { useMyGoals } from '../../../hooks/queries/useAccount';
import { useReplaceMyGoals } from '../../../hooks/mutations/useAccountMutations';
import { useGymId } from '../../../hooks/useActiveGym';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

export default function GoalsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';

  const goals = useMyGoals();
  const save = useReplaceMyGoals();

  const [drafts, setDrafts] = useState<GoalDraft[] | null>(null);
  /**
   * Has the member pressed Save on a set the server would refuse?
   *
   * ===========================================================================
   * A DISABLED BUTTON CANNOT EXPLAIN ITSELF, SO SAVE IS NOT DISABLED.
   *
   * `emptyGoal()` starts with a blank `target` and `isValidDraft` requires a
   * positive one, so "Add goal" produced a row that made Save dead on arrival —
   * and a disabled `Button` swallows its own press, so the handler never ran and
   * nothing on the screen ever said why. `app/(join)/checkout.tsx` reasons about
   * this exact class in as many words ("press Continue and I will show you what
   * is missing" cannot work through a disabled control) and answers it with a
   * live button plus `showErrors`. This is that pattern.
   * ===========================================================================
   */
  const [showErrors, setShowErrors] = useState(false);

  // Seed the editor from the server ONCE per arrival of a payload, and never
  // over an edit in progress: re-seeding on every render of `goals.data` would
  // discard whatever the member is typing the moment a background refetch
  // lands. `drafts === null` is "not seeded yet", which is distinguishable from
  // "seeded, and the member deleted every row".
  useEffect(() => {
    if (goals.data === undefined) return;
    setDrafts((current) => (current === null ? toDrafts(goals.data?.goals) : current));
  }, [goals.data]);

  const phase = sectionPhase(goals, online);
  const rows = drafts ?? [];
  const dirty = drafts !== null;
  // `save.isPending` is deliberately NOT here — see the footer.
  const canSave = dirty && isValidSet(rows);

  const update = useCallback((key: string, patch: Partial<GoalDraft>) => {
    setDrafts((current) =>
      (current ?? []).map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setDrafts((current) => (current ?? []).filter((draft) => draft.key !== key));
  }, []);

  const submit = useCallback(() => {
    if (!canSave || save.isPending) return;
    save.mutate(toPayload(rows), {
      onSuccess: (response) => {
        // Re-seed from the server's answer, so a trimmed label or a defaulted
        // unit is what the member sees rather than what they typed.
        setDrafts(toDrafts(response.goals));
        setShowErrors(false);
        toast.success(t('member.goals.saved'));
      },
      onError: () => {
        toast.error(t('member.goals.error'));
      },
    });
  }, [canSave, save, rows, toast, t]);

  /**
   * The Save press, whatever state the set is in.
   *
   * The whole point: the handler RUNS on an invalid set, so it can turn the
   * explanation on. A disabled button would never have got here.
   */
  const attemptSave = useCallback(() => {
    if (canSave) submit();
    else setShowErrors(true);
  }, [canSave, submit]);

  return (
    <Screen
      testID="goals-screen"
      header={
        <AppBar
          title={t('member.goals.title')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="goals-back"
            />
          }
        />
      }
      footer={
        // `phase === 'ready' && rows.length > 0` — see the empty branch below:
        // the empty state ships its own primary CTA, and a second, permanently
        // disabled "შენახვა" stuck to the bottom of that screen offers the
        // member a control that can never do anything.
        //
        // `Surface`, not `View`: `Screen`'s footer wrapper paints nothing and
        // is absolutely positioned over the scroll — see `ScreenProps.footer`.
        phase === 'ready' && rows.length > 0 ? (
          <Surface
            testID="goals-footer-plate"
            tone="card"
            radius="container"
            padding={4}
            style={{ gap: spacing[2] }}
          >
            {showErrors && !canSave ? (
              // TODO(i18n) `member.goals.invalid` — `member.goals` has a
              // sentence for a save that FAILED and none for one that cannot
              // start. See `components/home/pending-copy.ts`.
              <InlineNote testID="goals-invalid" icon="info">
                {GOALS_PENDING_COPY.invalid}
              </InlineNote>
            ) : null}
            <Button
              testID="goals-save"
              label={t('member.goals.save')}
              busyLabel={t('member.goals.saving')}
              busy={save.isPending}
              // LIVE, always. Two rules meet here and both say the same thing:
              // `busy` is not `disabled` (`app/(join)/checkout.tsx`: a primary
              // that greys out the instant it is pressed reads as a rejection,
              // and `busy` already swallows the press), and a button disabled
              // for being INVALID can never say what is invalid.
              fullWidth
              onPress={attemptSave}
            />
          </Surface>
        ) : undefined
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="goals-offline" />}

        {phase === 'loading' ? (
          <View
            testID="goals-loading"
            accessible
            // TODO(i18n): `member.profile.mobile.loading`. `member.goals` has
            // `saving` but no `loading` — see `components/home/pending-copy.ts`.
            accessibilityLabel={PROFILE_PENDING_COPY.loading}
            style={{ gap: spacing[3] }}
          >
            <Skeleton height={110} radius={22} />
            <Skeleton height={110} radius={22} />
          </View>
        ) : null}

        {phase === 'error' ? (
          <EmptyState
            testID="goals-error"
            icon="info"
            // `member.goals.error` is authored for a failed SAVE ("Couldn't save
            // goals"), not a failed load, so the load error uses the stage's
            // marked placeholder rather than a sentence that would be wrong.
            // TODO(i18n): `member.profile.mobile.error` / `.retry`.
            title={PROFILE_PENDING_COPY.error}
            action={{
              label: PROFILE_PENDING_COPY.retry,
              onPress: () => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.goals(scoped) });
              },
              variant: 'secondary',
              testID: 'goals-retry',
            }}
          />
        ) : null}

        {phase === 'ready' ? (
          rows.length === 0 ? (
            <EmptyState
              testID="goals-empty"
              icon="target"
              title={t('member.goals.empty')}
              action={{
                label: t('member.goals.addFirst'),
                onPress: () => {
                  setDrafts([emptyGoal()]);
                },
                variant: 'primary',
                testID: 'goals-add-first',
              }}
            />
          ) : (
            <View style={{ gap: spacing[4] }} testID="goals-list">
              {rows.map((draft, index) => {
                // WHICH box is wrong, not merely that the row is. The sentence
                // in the footer is the general answer; the red border is the
                // specific one, and without it "a name and a target" is a hunt
                // through up to eight rows.
                const wrong = showErrors ? draftErrors(draft) : null;
                return (
                  <Surface key={draft.key} tone="card" padding={4} radius={22}>
                    <View style={{ gap: spacing[3] }}>
                      <TextField
                        testID={`goals-label-${String(index)}`}
                        label={t('member.goals.labelPh')}
                        value={draft.label}
                        invalid={wrong?.label ?? false}
                        onChangeText={(value) => {
                          update(draft.key, { label: value });
                        }}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                        <View style={{ flex: 1 }}>
                          <TextField
                            testID={`goals-current-${String(index)}`}
                            label={t('member.goals.current')}
                            value={draft.current}
                            keyboardType="numeric"
                            invalid={wrong?.current ?? false}
                            onChangeText={(value) => {
                              update(draft.key, { current: value });
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TextField
                            testID={`goals-target-${String(index)}`}
                            label={t('member.goals.target')}
                            value={draft.target}
                            keyboardType="numeric"
                            invalid={wrong?.target ?? false}
                            onChangeText={(value) => {
                              update(draft.key, { target: value });
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TextField
                            testID={`goals-unit-${String(index)}`}
                            label={t('member.goals.unitPh')}
                            value={draft.unit}
                            onChangeText={(value) => {
                              update(draft.key, { unit: value });
                            }}
                          />
                        </View>
                      </View>

                      <ProgressBar
                        value={goalFraction(draft) * 100}
                        accessibilityLabel={
                          draft.label === '' ? t('member.goals.title') : draft.label
                        }
                        accessibilityValueText={`${draft.current} / ${draft.target} ${draft.unit}`.trim()}
                        testID={`goals-progress-${String(index)}`}
                      />

                      <Button
                        testID={`goals-remove-${String(index)}`}
                        label={t('member.goals.remove')}
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        onPress={() => {
                          remove(draft.key);
                        }}
                      />
                    </View>
                  </Surface>
                );
              })}

              {rows.length < MAX_GOALS ? (
                <Button
                  testID="goals-add"
                  label={t('member.goals.add')}
                  variant="secondary"
                  icon="plus"
                  fullWidth
                  onPress={() => {
                    setDrafts([...(drafts ?? []), emptyGoal()]);
                  }}
                />
              ) : (
                // The server rejects a ninth goal. Saying so beats a disabled
                // button with no explanation — and the count IS the explanation.
                <Text variant="caption" color="textSecondary" testID="goals-max">
                  {`${String(rows.length)} / ${String(MAX_GOALS)}`}
                </Text>
              )}
            </View>
          )
        ) : null}
      </View>
    </Screen>
  );
}
