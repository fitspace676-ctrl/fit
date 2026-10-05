import type { MobileAppSettings } from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';
export function getMobileAppSettings(
  slug: string,
  options: FetchOptions = {},
): Promise<MobileAppSettings> {
  return apiJson<MobileAppSettings>(endpointPath(ENDPOINTS.getMobileAppSettings, { slug }), {
    method: ENDPOINTS.getMobileAppSettings.method,
    anonymous: true,
    signal: options.signal,
  });
}
