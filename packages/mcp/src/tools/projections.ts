// List tools return compact rows (id + label + status + a few headline fields) and
// keep the envelope's paging meta; complete records come from the get_* tools.

type Row = Record<string, unknown>;
type Slim = (row: Row) => unknown;

/** Keep only the named fields that are present on the row. */
export function pick(...keys: string[]): Slim {
  return (row) =>
    Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
}

/** Project the envelope's array fields (default `data`) through their slims, keeping the rest. */
export function slimList(res: unknown, slim: Slim, key = 'data'): unknown {
  return slimFields(res, { [key]: slim });
}

/** Project several array fields of one envelope (e.g. staff + invites). */
export function slimFields(res: unknown, slims: Record<string, Slim>): unknown {
  if (!res || typeof res !== 'object') return res;
  const envelope = { ...(res as Row) };
  for (const [key, slim] of Object.entries(slims)) {
    const rows = envelope[key];
    if (Array.isArray(rows)) envelope[key] = rows.map((row) => slim(row as Row));
  }
  return envelope;
}

/** Shorthand for a `project` hook over one array field. */
export function listOf(slim: Slim, key = 'data') {
  return (value: unknown) => slimList(value, slim, key);
}

export function slimMember(m: Row): Row {
  const plan = m.plan as Row | null | undefined;
  return {
    id: m.id,
    name: m.name,
    status: m.status,
    email: m.email,
    phone: m.phone ?? null,
    plan: m.planName ?? plan?.name ?? null,
    lastVisitAt: m.lastVisitAt ?? null,
  };
}

export const slimTrainer = pick('id', 'name', 'status', 'headline', 'rating', 'classesThisWeek');
export const slimLocation = pick('id', 'name', 'status', 'address', 'isDefault');
export function slimProduct(r: Row): Row {
  const category = r.category as Row | null | undefined;
  return {
    ...(pick('id', 'name', 'status', 'priceAmount', 'currency', 'totalStock')(r) as Row),
    category: category?.name ?? null,
  };
}
export const slimClass = pick(
  'id',
  'title',
  'status',
  'category',
  'startTime',
  'recurrence',
  'trainerName',
);
export const slimScheduleInstance = pick(
  'id',
  'title',
  'status',
  'startsAt',
  'trainerName',
  'bookedCount',
  'capacity',
);
export const slimClassType = pick(
  'id',
  'name',
  'status',
  'durationMinutes',
  'capacity',
  'pricingRule',
  'priceMinor',
);
export const slimPtSession = pick(
  'id',
  'trainerName',
  'status',
  'startsAt',
  'durationMinutes',
  'classTypeName',
  'locationName',
);
export const slimPlan = pick(
  'id',
  'name',
  'status',
  'priceAmount',
  'currency',
  'interval',
  'billingInterval',
  'sessionCount',
  'subscriberCount',
);
export const slimOrder = pick(
  'id',
  'customerName',
  'status',
  'total',
  'currency',
  'channel',
  'createdAt',
);
export const slimInvoice = pick(
  'id',
  'number',
  'memberName',
  'type',
  'amount',
  'currency',
  'issuedAt',
  'dueDate',
);
export const slimInventory = pick(
  'productId',
  'productName',
  'label',
  'status',
  'stock',
  'lowStockThreshold',
  'sku',
);
export const slimLowStock = pick('id', 'name', 'lowestStock', 'variants');
export const slimStockMovement = pick(
  'id',
  'reason',
  'delta',
  'resultingStock',
  'locationName',
  'createdAt',
);
export function slimService(r: Row): Row {
  const staff = r.staff as Row | null | undefined;
  return {
    ...(pick(
      'id',
      'name',
      'status',
      'type',
      'priceMinor',
      'currency',
      'durationMinutes',
    )(r) as Row),
    staffName: staff?.name ?? null,
  };
}
export const slimServiceSession = pick(
  'id',
  'serviceName',
  'status',
  'startsAt',
  'staffName',
  'memberName',
  'locationName',
);
export const slimStaff = pick('id', 'name', 'status', 'role', 'email');
export const slimInvite = pick('id', 'email', 'role', 'expired', 'expiresAt');
export const slimTimeOff = pick('id', 'staffName', 'status', 'startDate', 'endDate', 'reason');
export const slimAuditLog = pick('id', 'action', 'actorName', 'targetName', 'createdAt');
export const slimActivity = pick('id', 'type', 'title', 'memberName', 'amount', 'at');
export const slimReview = pick(
  'id',
  'authorName',
  'status',
  'rating',
  'comment',
  'classTitle',
  'createdAt',
);
export const slimAutomationRule = pick('id', 'name', 'active', 'triggerType', 'actionType');
export const slimAutomationRun = pick('id', 'status', 'triggerType', 'detail', 'ranAt');
export const slimCampaign = pick(
  'id',
  'name',
  'status',
  'channel',
  'scheduledAt',
  'audienceSize',
  'sentCount',
);
export const slimSegment = pick('id', 'name', 'updatedAt');
export const slimMessageTemplate = pick('id', 'name', 'channel', 'category', 'subject');
export const slimPromoCode = pick(
  'id',
  'code',
  'status',
  'discountType',
  'discountValue',
  'usedCount',
  'expiryDate',
);
export const slimBanner = pick('id', 'title', 'isActive', 'sortOrder', 'startsAt', 'endsAt');
export const slimReward = pick('id', 'name', 'active', 'pointsCost', 'type', 'stock');
export const slimRedemption = pick(
  'id',
  'memberName',
  'status',
  'rewardName',
  'pointsSpent',
  'redeemedAt',
);
export const slimCheckIn = pick(
  'id',
  'gymMemberId',
  'name',
  'method',
  'locationName',
  'checkedInAt',
);
