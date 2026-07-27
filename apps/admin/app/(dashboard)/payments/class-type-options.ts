import { fetchClassTypes } from '@/lib/api';
import type { PlanClassTypeOption } from './subscription-plan-form';

/**
 * How many class types the plan picker loads. The API's page cap, and far above any
 * realistic per-gym catalogue; a gym past it would only lose the overflow tail from
 * the picker.
 */
const CLASS_TYPES_PAGE_LIMIT = 100;

/**
 * The class types a subscription plan may cover: the gym's `ACTIVE` types priced
 * `FREE` or `INCLUDED`.
 *
 * `PAID` types are excluded on purpose — they carry a per-session `priceMinor` that
 * being pulled into a plan would strip, so their pricing stays editable from the
 * classes screen alone. `setPlanClassTypesAction` enforces the same rule server-side.
 *
 * A failure here is deliberately non-fatal: the plan form still opens, just with an
 * empty picker, rather than the class catalogue taking the whole billing board down.
 */
export async function fetchPlanClassTypeOptions(): Promise<PlanClassTypeOption[]> {
  try {
    const { data } = await fetchClassTypes({
      limit: CLASS_TYPES_PAGE_LIMIT,
      status: 'ACTIVE',
      sort: 'name',
      dir: 'asc',
    });
    return data
      .filter((type) => type.pricingRule !== 'PAID')
      .map((type) => ({
        id: type.id,
        name: type.name,
        color: type.color,
        includedPlanIds: type.includedPlanIds,
      }));
  } catch {
    return [];
  }
}
