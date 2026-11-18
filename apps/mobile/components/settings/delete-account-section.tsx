import { useRef, useState } from 'react';
import { ConfirmSheet, ListRow, Text } from '@fit/ui-mobile';
import { useI18n } from '../../providers/I18nProvider';

export function DeleteAccountSection({
  onDelete,
  onDeleted,
}: {
  onDelete: () => Promise<void>;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setOpen(false);
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('member.profile.deleteError'));
      setOpen(false);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <ListRow
        icon="trash"
        title={t('member.profile.deleteTitle')}
        danger
        onPress={() => {
          setError(null);
          setOpen(true);
        }}
        testID="profile-delete-account"
      />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      <ConfirmSheet
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={() => {
          void confirm();
        }}
        title={t('member.profile.deleteTitle')}
        note={t('member.profile.deleteDesc')}
        confirmLabel={t('member.profile.deleteTitle')}
        cancelLabel={t('settings.about.signOutCancel')}
        closeAccessibilityLabel={t('classes.modal.close')}
        destructive
        busy={busy}
        testID="profile-delete-account-confirm"
      />
    </>
  );
}
