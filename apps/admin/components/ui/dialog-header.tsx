'use client';

// @fit/admin — Astryx's `DialogHeader`, with a close button in the console's
// language.
//
// The library's own close button is hard-coded to "Close" (label and tooltip), so
// a Georgian console showed English on every slide-over. This draws the same ghost
// icon button through `endContent` instead and keeps the library's own one off by
// never handing it `onOpenChange`.

import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import {
  DialogHeader as AstryxDialogHeader,
  type DialogHeaderProps,
} from '@astryxdesign/core/Dialog';
import { Icon } from '@astryxdesign/core/Icon';

export function DialogHeader({ onOpenChange, endContent, ...props }: DialogHeaderProps) {
  const t = useTranslations('admin.common');
  const close = onOpenChange ? (
    <Button
      variant="ghost"
      label={t('close')}
      tooltip={t('close')}
      icon={<Icon icon="close" color="inherit" />}
      onClick={() => {
        onOpenChange(false);
      }}
      isIconOnly
    />
  ) : null;

  return (
    <AstryxDialogHeader
      {...props}
      endContent={
        endContent || close ? (
          <>
            {endContent}
            {close}
          </>
        ) : undefined
      }
    />
  );
}
