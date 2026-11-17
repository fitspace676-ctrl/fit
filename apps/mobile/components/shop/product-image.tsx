import { useState } from 'react';
import { Image } from 'react-native';
import { Mono, Surface } from '@fit/ui-mobile';
import { env } from '../../lib/env';

/** API uploads normally have absolute URLs; also accept API-relative storage paths. */
export function productImageUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), `${env.apiUrl}/`);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function ProductImage({
  imageUrl,
  name,
  size = 72,
}: {
  imageUrl?: string | null;
  name: string;
  size?: number;
}) {
  const uri = productImageUrl(imageUrl);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <Surface
      tone="quiet"
      radius={18}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {uri && failed !== uri ? (
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={{ width: size, height: size }}
          onError={() => setFailed(uri)}
        />
      ) : (
        <Mono variant="monoLarge" color="onQuiet">
          {Array.from(name.trim())[0]?.toUpperCase() ?? ''}
        </Mono>
      )}
    </Surface>
  );
}
