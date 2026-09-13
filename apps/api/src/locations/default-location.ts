/**
 * The slice of a Prisma client a default-branch lookup needs.
 *
 * Structural on purpose, for the reason `products/order-stock.ts` and
 * `staff/staff.service.ts` give: the tenant-**extended** client is not assignable to
 * `Prisma.TransactionClient`, so a helper that both the base client, the scoped
 * client and either one's transaction can be handed has to be typed by the one
 * call it makes.
 */
export interface DefaultLocationClient {
  location: {
    findFirst(args: {
      where: { gymId?: string; isDefault: true };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

/**
 * The id of a gym's DEFAULT branch (`Location.isDefault`), or `null` when it has
 * none.
 *
 * One query, written once, for the four places that fall back to it: the check-in
 * desk's arrival branch, a new member's home branch, the shelf an order with no
 * branch moves stock on, and the branch an opening stock count lands on. Each of
 * those decides for itself what `null` means — degrade or refuse — so this does
 * not.
 *
 * `gymId` is required on the base client and on a transaction that is not tenant
 * scoped. On the scoped client the extension already constrains the gym, and the
 * key is left off so the `where` stays exactly the one those callers always sent.
 *
 * **A deactivated default is still the default.** There is at most one per gym —
 * the partial unique index `locations_gymId_default_key ON "locations"("gymId")
 * WHERE "isDefault"` — so there is no ACTIVE sibling to prefer, and falling through
 * to "no default" would turn an operator's deactivation into a silently different
 * attribution. Moving the flag is an explicit act, not a side effect of status.
 */
export async function findDefaultLocationId(
  client: DefaultLocationClient,
  gymId?: string,
): Promise<string | null> {
  const location = await client.location.findFirst({
    where: gymId === undefined ? { isDefault: true } : { gymId, isDefault: true },
    select: { id: true },
  });
  return location?.id ?? null;
}
