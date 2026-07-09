import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, OrderStatus, Prisma, Role, SubscriptionStatus } from '@fit/db';
import {
  AUDIENCE_PREVIEW_SAMPLE_SIZE,
  MARKETING_CHANNEL_CATALOG,
  MARKETING_MERGE_FIELDS,
  audienceCriteriaSchema,
  type AudienceCriteria,
  type AudienceMemberSample,
  type AudiencePreviewResponse,
  type AudienceSegmentRow,
  type CampaignRow,
  type CreateAudienceSegmentInput,
  type CreateCampaignInput,
  type CreateMessageTemplateInput,
  type CreatePromoCodeInput,
  type GetCampaignResponse,
  type ListAudienceSegmentsResponse,
  type ListCampaignsQuery,
  type ListCampaignsResponse,
  type ListMessageTemplatesResponse,
  type ListPromoCodesResponse,
  type MarketingCatalogResponse,
  type MarketingRef,
  type MessageTemplateRow,
  type PreviewAudienceInput,
  type PromoCodeRow,
  type PromoRedeemResult,
  type PromoRejectionReason,
  type PromoValidationResult,
  type SaveCampaignAsTemplateInput,
  type ScheduleCampaignInput,
  type TogglePromoCodeInput,
  type UpdateAudienceSegmentInput,
  type UpdateCampaignInput,
  type UpdateMessageTemplateInput,
  type UpdatePromoCodeInput,
  type ValidatePromoCodeInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** Milliseconds in a day, for the last-visit recency windows. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The `(id, name, email)` slice of a `User` a campaign author ref resolves from. */
const USER_REF_SELECT = { id: true, name: true, email: true } satisfies Prisma.UserSelect;

/** Shape the campaign queries select — its own columns plus the author ref. */
const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  channel: true,
  audienceSegmentId: true,
  inlineCriteria: true,
  subject: true,
  body: true,
  scheduleType: true,
  scheduledAt: true,
  status: true,
  audienceSize: true,
  sentCount: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: USER_REF_SELECT },
} satisfies Prisma.CampaignSelect;

type CampaignRecord = Prisma.CampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

/**
 * Marketing backend (T12.7) — CRUD for campaigns, promo codes, audience segments,
 * and message templates, plus the segment-preview resolver and the promo
 * validate/redeem path POS/checkout consumes. Ported from the gym-admin
 * prototype's mock-array `/marketing` page into real gym-scoped tables.
 *
 * Every query runs on the tenant-scoped Prisma client (all four models are in
 * `TENANT_SCOPED_MODELS`), so no method passes or trusts a `gymId` — another
 * gym's marketing data is unreachable by construction. The campaign author is
 * resolved from the session, never from the body.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** The channel + merge-field catalogs the composer (T12.8) renders from. */
  catalog(): MarketingCatalogResponse {
    return { channels: MARKETING_CHANNEL_CATALOG, mergeFields: MARKETING_MERGE_FIELDS };
  }

  // -------------------------------------------------------------------------
  // Audience segments
  // -------------------------------------------------------------------------

  /** Every saved segment, newest first. */
  async listSegments(): Promise<ListAudienceSegmentsResponse> {
    const rows = await this.prisma.client.audienceSegment.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows.map((r) => this.toSegmentRow(r)) };
  }

  /** Create a segment from a name + criteria. */
  async createSegment(input: CreateAudienceSegmentInput): Promise<AudienceSegmentRow> {
    const created = await this.prisma.client.audienceSegment.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        criteria: input.criteria satisfies AudienceCriteria as Prisma.InputJsonValue,
      },
    });
    return this.toSegmentRow(created);
  }

  /** Edit a segment. Only provided keys change. 404s on a miss. */
  async updateSegment(id: string, input: UpdateAudienceSegmentInput): Promise<AudienceSegmentRow> {
    await this.requireSegment(id);
    const updated = await this.prisma.client.audienceSegment.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.criteria !== undefined
          ? { criteria: input.criteria as Prisma.InputJsonValue }
          : {}),
      },
    });
    return this.toSegmentRow(updated);
  }

  /** Delete a segment (campaigns referencing it keep working, segment id nulled). */
  async deleteSegment(id: string): Promise<void> {
    await this.requireSegment(id);
    await this.prisma.client.audienceSegment.delete({ where: { id } });
  }

  /** Resolve a saved segment's criteria to a live match count + sample. 404s on a miss. */
  async previewSegment(id: string): Promise<AudiencePreviewResponse> {
    const segment = await this.requireSegment(id);
    return this.resolveAudience(parseCriteria(segment.criteria));
  }

  /** Resolve ad-hoc criteria to a live match count + sample (the builder's live preview). */
  async previewCriteria(input: PreviewAudienceInput): Promise<AudiencePreviewResponse> {
    return this.resolveAudience(input.criteria);
  }

  // -------------------------------------------------------------------------
  // Message templates
  // -------------------------------------------------------------------------

  /** Every template, newest first. */
  async listTemplates(): Promise<ListMessageTemplatesResponse> {
    const rows = await this.prisma.client.messageTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows.map((r) => this.toTemplateRow(r)) };
  }

  /** Create a message template. */
  async createTemplate(input: CreateMessageTemplateInput): Promise<MessageTemplateRow> {
    const created = await this.prisma.client.messageTemplate.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        channel: input.channel,
        subject: input.subject ?? null,
        body: input.body,
        category: input.category,
      },
    });
    return this.toTemplateRow(created);
  }

  /** Edit a template. Only provided keys change. 404s on a miss. */
  async updateTemplate(id: string, input: UpdateMessageTemplateInput): Promise<MessageTemplateRow> {
    await this.requireTemplate(id);
    const updated = await this.prisma.client.messageTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
      },
    });
    return this.toTemplateRow(updated);
  }

  /** Delete a template. 404s on a miss. */
  async deleteTemplate(id: string): Promise<void> {
    await this.requireTemplate(id);
    await this.prisma.client.messageTemplate.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Promo codes
  // -------------------------------------------------------------------------

  /** Every promo code, newest first. */
  async listPromoCodes(): Promise<ListPromoCodesResponse> {
    const rows = await this.prisma.client.promoCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows.map((r) => this.toPromoRow(r)) };
  }

  /** Create a promo code. A duplicate code (case-insensitive) for the gym is a `409`. */
  async createPromoCode(input: CreatePromoCodeInput): Promise<PromoCodeRow> {
    await this.assertPromoCodeFree(input.code, null);
    try {
      const created = await this.prisma.client.promoCode.create({
        data: {
          gymId: this.tenant.gymId,
          code: input.code,
          description: input.description,
          discountType: input.discountType,
          discountValue: input.discountValue,
          minPurchase: input.minPurchase ?? null,
          usageLimit: input.usageLimit ?? null,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          status: input.status,
        },
      });
      return this.toPromoRow(created);
    } catch (error) {
      throw this.mapPromoConflict(error);
    }
  }

  /** Edit a promo code. Only provided keys change. 404s on a miss; `409` on a code clash. */
  async updatePromoCode(id: string, input: UpdatePromoCodeInput): Promise<PromoCodeRow> {
    await this.requirePromo(id);
    if (input.code !== undefined) {
      await this.assertPromoCodeFree(input.code, id);
    }
    try {
      const updated = await this.prisma.client.promoCode.update({
        where: { id },
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.discountType !== undefined ? { discountType: input.discountType } : {}),
          ...(input.discountValue !== undefined ? { discountValue: input.discountValue } : {}),
          ...(input.minPurchase !== undefined ? { minPurchase: input.minPurchase } : {}),
          ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
          ...(input.expiryDate !== undefined
            ? { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      return this.toPromoRow(updated);
    } catch (error) {
      throw this.mapPromoConflict(error);
    }
  }

  /** Flip a promo code active/inactive. 404s on a miss. */
  async togglePromoCode(id: string, input: TogglePromoCodeInput): Promise<PromoCodeRow> {
    await this.requirePromo(id);
    const updated = await this.prisma.client.promoCode.update({
      where: { id },
      data: { status: input.status },
    });
    return this.toPromoRow(updated);
  }

  /** Delete a promo code. 404s on a miss. */
  async deletePromoCode(id: string): Promise<void> {
    await this.requirePromo(id);
    await this.prisma.client.promoCode.delete({ where: { id } });
  }

  /**
   * Check a code without consuming it — the read POS/checkout call before
   * applying a discount. Always `200`: `valid` says whether it applies, `reason`
   * why not, and (when an `amount` was given) `discountAmount` the MINOR-unit cut.
   */
  async validatePromoCode(input: ValidatePromoCodeInput): Promise<PromoValidationResult> {
    const promo = await this.findPromoByCode(input.code);
    const reason = promo ? this.rejectionReason(promo, input.amount) : 'not_found';
    if (!promo || reason) {
      return { valid: false, reason: reason ?? 'not_found' };
    }
    return {
      valid: true,
      promo: this.toPromoRow(promo),
      ...(input.amount !== undefined
        ? { discountAmount: computeDiscount(promo, input.amount) }
        : {}),
    };
  }

  /**
   * Consume one use of a code — the write POS/checkout call once a sale commits.
   * Enforces status / expiry / usage-limit / min-purchase and atomically bumps
   * `usedCount` only while it is still under the limit (so a race can't oversell
   * the last redemption). An invalid code is a `409` carrying the reason.
   */
  async redeemPromoCode(input: ValidatePromoCodeInput): Promise<PromoRedeemResult> {
    const promo = await this.findPromoByCode(input.code);
    const reason = promo ? this.rejectionReason(promo, input.amount) : 'not_found';
    if (!promo || reason) {
      throw new ConflictException({
        message: 'Promo code cannot be redeemed',
        code: 'PROMO_CODE_INVALID',
        reason: reason ?? 'not_found',
      });
    }

    // Atomic guard against the usage limit: only increment while still under it,
    // so two concurrent redemptions of the final use can't both succeed.
    const result = await this.prisma.client.promoCode.updateMany({
      where: {
        id: promo.id,
        ...(promo.usageLimit !== null ? { usedCount: { lt: promo.usageLimit } } : {}),
      },
      data: { usedCount: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException({
        message: 'Promo code cannot be redeemed',
        code: 'PROMO_CODE_INVALID',
        reason: 'usage_limit_reached' satisfies PromoRejectionReason,
      });
    }

    const updated = await this.requirePromo(promo.id);
    return {
      promo: this.toPromoRow(updated),
      discountAmount: computeDiscount(promo, input.amount ?? 0),
    };
  }

  // -------------------------------------------------------------------------
  // Campaigns
  // -------------------------------------------------------------------------

  /** One filtered, paginated page of the gym's campaigns. */
  async listCampaigns(query: ListCampaignsQuery): Promise<ListCampaignsResponse> {
    const where: Prisma.CampaignWhereInput = {
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.campaign.findMany({
        where,
        orderBy: { [query.sort]: query.dir },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: CAMPAIGN_SELECT,
      }),
      this.prisma.client.campaign.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toCampaignRow(r)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** One campaign's detail. 404s on a miss. */
  async getCampaign(id: string): Promise<GetCampaignResponse> {
    const campaign = await this.requireCampaign(id);
    return this.toCampaignRow(campaign);
  }

  /** Create a campaign (draft). A named segment must exist in the gym. */
  async createCampaign(input: CreateCampaignInput): Promise<GetCampaignResponse> {
    if (input.audienceSegmentId) {
      await this.requireSegment(input.audienceSegmentId);
    }
    const created = await this.prisma.client.campaign.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        channel: input.channel,
        audienceSegmentId: input.audienceSegmentId ?? null,
        inlineCriteria: toCriteriaJson(input.inlineCriteria),
        subject: input.subject ?? null,
        body: input.body,
        scheduleType: input.scheduleType,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: 'draft',
        createdById: this.tenant.userId ?? null,
      },
      select: CAMPAIGN_SELECT,
    });
    return this.toCampaignRow(created);
  }

  /** Edit a campaign. Only provided keys change. A sent campaign is immutable (`409`). */
  async updateCampaign(id: string, input: UpdateCampaignInput): Promise<GetCampaignResponse> {
    const existing = await this.requireCampaign(id);
    if (existing.status === 'sent') {
      throw new ConflictException({
        message: 'A sent campaign cannot be edited',
        code: 'CAMPAIGN_ALREADY_SENT',
      });
    }
    if (input.audienceSegmentId) {
      await this.requireSegment(input.audienceSegmentId);
    }
    const updated = await this.prisma.client.campaign.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.audienceSegmentId !== undefined
          ? { audienceSegmentId: input.audienceSegmentId }
          : {}),
        ...(input.inlineCriteria !== undefined
          ? { inlineCriteria: toCriteriaJson(input.inlineCriteria) }
          : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.scheduleType !== undefined ? { scheduleType: input.scheduleType } : {}),
        ...(input.scheduledAt !== undefined
          ? { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null }
          : {}),
      },
      select: CAMPAIGN_SELECT,
    });
    return this.toCampaignRow(updated);
  }

  /** Delete a campaign. 404s on a miss. */
  async deleteCampaign(id: string): Promise<void> {
    await this.requireCampaign(id);
    await this.prisma.client.campaign.delete({ where: { id } });
  }

  /**
   * Send a campaign now (stubbed delivery): resolve its audience, snapshot the
   * match count into `audienceSize`, mark it `sent` with `sentCount` = the count
   * and `sentAt` = now. An already-sent campaign is a `409`.
   */
  async sendCampaign(id: string): Promise<GetCampaignResponse> {
    const existing = await this.requireCampaign(id);
    if (existing.status === 'sent') {
      throw new ConflictException({
        message: 'Campaign has already been sent',
        code: 'CAMPAIGN_ALREADY_SENT',
      });
    }
    const audienceSize = await this.resolveCampaignAudienceSize(existing);
    const updated = await this.prisma.client.campaign.update({
      where: { id },
      data: {
        status: 'sent',
        scheduleType: 'now',
        audienceSize,
        sentCount: audienceSize,
        sentAt: new Date(),
      },
      select: CAMPAIGN_SELECT,
    });
    return this.toCampaignRow(updated);
  }

  /**
   * Schedule a campaign for a future `scheduledAt`: snapshot its audience size and
   * mark it `scheduled`. An already-sent campaign is a `409`.
   */
  async scheduleCampaign(id: string, input: ScheduleCampaignInput): Promise<GetCampaignResponse> {
    const existing = await this.requireCampaign(id);
    if (existing.status === 'sent') {
      throw new ConflictException({
        message: 'A sent campaign cannot be rescheduled',
        code: 'CAMPAIGN_ALREADY_SENT',
      });
    }
    const audienceSize = await this.resolveCampaignAudienceSize(existing);
    const updated = await this.prisma.client.campaign.update({
      where: { id },
      data: {
        status: 'scheduled',
        scheduleType: 'scheduled',
        scheduledAt: new Date(input.scheduledAt),
        audienceSize,
      },
      select: CAMPAIGN_SELECT,
    });
    return this.toCampaignRow(updated);
  }

  /** Save a campaign's message as a reusable {@link MessageTemplateRow}. 404s on a miss. */
  async saveCampaignAsTemplate(
    id: string,
    input: SaveCampaignAsTemplateInput,
  ): Promise<MessageTemplateRow> {
    const campaign = await this.requireCampaign(id);
    const created = await this.prisma.client.messageTemplate.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name ?? campaign.name,
        channel: campaign.channel,
        subject: campaign.subject,
        body: campaign.body,
        category: input.category,
      },
    });
    return this.toTemplateRow(created);
  }

  // -------------------------------------------------------------------------
  // Audience resolution
  // -------------------------------------------------------------------------

  /** A campaign's audience count from its segment, inline criteria, or the whole roster. */
  private async resolveCampaignAudienceSize(campaign: CampaignRecord): Promise<number> {
    const criteria = await this.campaignCriteria(campaign);
    const where = await this.buildMemberWhere(criteria);
    return this.prisma.client.gymMember.count({ where });
  }

  /** The criteria a campaign targets — its saved segment's, its inline bag, or empty. */
  private async campaignCriteria(campaign: CampaignRecord): Promise<AudienceCriteria> {
    if (campaign.audienceSegmentId) {
      const segment = await this.prisma.client.audienceSegment.findFirst({
        where: { id: campaign.audienceSegmentId },
      });
      if (segment) return parseCriteria(segment.criteria);
    }
    if (campaign.inlineCriteria) return parseCriteria(campaign.inlineCriteria);
    return {};
  }

  /** Resolve criteria to a match count + a small sample of matching members. */
  private async resolveAudience(criteria: AudienceCriteria): Promise<AudiencePreviewResponse> {
    const where = await this.buildMemberWhere(criteria);
    const [count, members] = await Promise.all([
      this.prisma.client.gymMember.count({ where }),
      this.prisma.client.gymMember.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        take: AUDIENCE_PREVIEW_SAMPLE_SIZE,
        select: { id: true, user: { select: { name: true, email: true } } },
      }),
    ]);
    return { count, sample: members.map((m) => toMemberSample(m)) };
  }

  /**
   * Translate audience criteria into a `GymMember` `where`. The gym scope is added
   * by the tenant extension; this only narrows within the gym's `MEMBER` roster.
   * Count/sum thresholds (`minClassAttendance`, `minSpent`) that a relational
   * `where` can't express are resolved by a per-member aggregate and intersected
   * back in as an id filter.
   */
  private async buildMemberWhere(criteria: AudienceCriteria): Promise<Prisma.GymMemberWhereInput> {
    const where: Prisma.GymMemberWhereInput = { role: Role.MEMBER };

    if (criteria.status?.length) {
      where.status = { in: criteria.status };
    }
    if (criteria.membershipPlanIds?.length) {
      where.subscriptions = {
        some: {
          planId: { in: criteria.membershipPlanIds },
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
        },
      };
    }
    if (criteria.joinedAfter || criteria.joinedBefore) {
      where.joinedAt = {
        ...(criteria.joinedAfter ? { gte: new Date(criteria.joinedAfter) } : {}),
        ...(criteria.joinedBefore ? { lte: new Date(criteria.joinedBefore) } : {}),
      };
    }

    const now = Date.now();
    const and: Prisma.GymMemberWhereInput[] = [];
    if (criteria.visitedWithinDays !== undefined) {
      const since = new Date(now - criteria.visitedWithinDays * DAY_MS);
      and.push({ checkIns: { some: { checkedInAt: { gte: since } } } });
    }
    if (criteria.notVisitedForDays !== undefined) {
      const since = new Date(now - criteria.notVisitedForDays * DAY_MS);
      and.push({ checkIns: { none: { checkedInAt: { gte: since } } } });
    }
    if (and.length) where.AND = and;

    const idSets = await Promise.all([
      criteria.minClassAttendance !== undefined && criteria.minClassAttendance > 0
        ? this.membersWithAttendance(criteria.minClassAttendance)
        : null,
      criteria.minSpent !== undefined && criteria.minSpent > 0
        ? this.membersWithSpend(criteria.minSpent)
        : null,
    ]);
    const eligible = intersectIdSets(idSets.filter((s): s is string[] => s !== null));
    if (eligible !== null) {
      where.id = { in: eligible };
    }

    return where;
  }

  /** Member ids with at least `min` `ATTENDED` bookings (gym-scoped by the extension). */
  private async membersWithAttendance(min: number): Promise<string[]> {
    const groups = await this.prisma.client.booking.groupBy({
      by: ['memberId'],
      where: { status: BookingStatus.ATTENDED },
      _count: { id: true },
    });
    return groups.filter((g) => g._count.id >= min).map((g) => g.memberId);
  }

  /** Member ids whose `PAID` order total sums to at least `min` MINOR units. */
  private async membersWithSpend(min: number): Promise<string[]> {
    const groups = await this.prisma.client.order.groupBy({
      by: ['memberId'],
      where: { status: OrderStatus.PAID, memberId: { not: null } },
      _sum: { total: true },
    });
    return groups
      .filter((g) => (g._sum.total ?? 0) >= min)
      .map((g) => g.memberId)
      .filter((id): id is string => id !== null);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** The segment, or a `404 SEGMENT_NOT_FOUND` for an unknown/cross-tenant id. */
  private async requireSegment(id: string) {
    const segment = await this.prisma.client.audienceSegment.findFirst({ where: { id } });
    if (!segment) {
      throw new NotFoundException({
        message: 'Audience segment not found',
        code: 'SEGMENT_NOT_FOUND',
      });
    }
    return segment;
  }

  /** The template, or a `404 TEMPLATE_NOT_FOUND`. */
  private async requireTemplate(id: string) {
    const template = await this.prisma.client.messageTemplate.findFirst({ where: { id } });
    if (!template) {
      throw new NotFoundException({
        message: 'Message template not found',
        code: 'TEMPLATE_NOT_FOUND',
      });
    }
    return template;
  }

  /** The promo code, or a `404 PROMO_CODE_NOT_FOUND`. */
  private async requirePromo(id: string) {
    const promo = await this.prisma.client.promoCode.findFirst({ where: { id } });
    if (!promo) {
      throw new NotFoundException({
        message: 'Promo code not found',
        code: 'PROMO_CODE_NOT_FOUND',
      });
    }
    return promo;
  }

  /** The campaign, or a `404 CAMPAIGN_NOT_FOUND`. */
  private async requireCampaign(id: string): Promise<CampaignRecord> {
    const campaign = await this.prisma.client.campaign.findFirst({
      where: { id },
      select: CAMPAIGN_SELECT,
    });
    if (!campaign) {
      throw new NotFoundException({
        message: 'Campaign not found',
        code: 'CAMPAIGN_NOT_FOUND',
      });
    }
    return campaign;
  }

  /** Find a promo by code, matched case-insensitively within the gym. */
  private async findPromoByCode(code: string) {
    return this.prisma.client.promoCode.findFirst({
      where: { code: { equals: code.trim(), mode: 'insensitive' } },
    });
  }

  /**
   * Throw a `409` when a code (case-insensitive) already belongs to another promo
   * in the gym — the friendly guard before the DB unique constraint would fire.
   */
  private async assertPromoCodeFree(code: string, exceptId: string | null): Promise<void> {
    const clash = await this.findPromoByCode(code);
    if (clash && clash.id !== exceptId) {
      throw new ConflictException({
        message: 'A promo code with this code already exists',
        code: 'PROMO_CODE_TAKEN',
      });
    }
  }

  /** Map a promo unique-constraint race (`P2002`) to the friendly `409`. */
  private mapPromoConflict(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException({
        message: 'A promo code with this code already exists',
        code: 'PROMO_CODE_TAKEN',
      });
    }
    return error;
  }

  /**
   * Why a code can't apply right now, or `null` when it can. Checked in order:
   * inactive → expired → usage limit reached → below the minimum purchase.
   */
  private rejectionReason(
    promo: {
      status: string;
      expiryDate: Date | null;
      usageLimit: number | null;
      usedCount: number;
      minPurchase: number | null;
    },
    amount: number | undefined,
  ): PromoRejectionReason | null {
    if (promo.status !== 'active') return 'inactive';
    if (promo.expiryDate && promo.expiryDate.getTime() < Date.now()) return 'expired';
    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      return 'usage_limit_reached';
    }
    if (promo.minPurchase !== null && amount !== undefined && amount < promo.minPurchase) {
      return 'below_min_purchase';
    }
    return null;
  }

  private toSegmentRow(row: {
    id: string;
    name: string;
    criteria: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): AudienceSegmentRow {
    return {
      id: row.id,
      name: row.name,
      criteria: parseCriteria(row.criteria),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTemplateRow(row: {
    id: string;
    name: string;
    channel: MessageTemplateRow['channel'];
    subject: string | null;
    body: string;
    category: string;
    createdAt: Date;
    updatedAt: Date;
  }): MessageTemplateRow {
    return {
      id: row.id,
      name: row.name,
      channel: row.channel,
      subject: row.subject,
      body: row.body,
      category: row.category,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPromoRow(row: {
    id: string;
    code: string;
    description: string;
    discountType: PromoCodeRow['discountType'];
    discountValue: number;
    minPurchase: number | null;
    usageLimit: number | null;
    usedCount: number;
    expiryDate: Date | null;
    status: PromoCodeRow['status'];
    createdAt: Date;
    updatedAt: Date;
  }): PromoCodeRow {
    return {
      id: row.id,
      code: row.code,
      description: row.description,
      discountType: row.discountType,
      discountValue: row.discountValue,
      minPurchase: row.minPurchase,
      usageLimit: row.usageLimit,
      usedCount: row.usedCount,
      expiryDate: row.expiryDate ? row.expiryDate.toISOString() : null,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCampaignRow(row: CampaignRecord): CampaignRow {
    return {
      id: row.id,
      name: row.name,
      channel: row.channel,
      audienceSegmentId: row.audienceSegmentId,
      inlineCriteria: row.inlineCriteria ? parseCriteria(row.inlineCriteria) : null,
      subject: row.subject,
      body: row.body,
      scheduleType: row.scheduleType,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      status: row.status,
      audienceSize: row.audienceSize,
      sentCount: row.sentCount,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      createdBy: toRef(row.createdBy),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** A person ref from a nullable joined row — name falls back to email. */
function toRef(
  row: { id: string; name: string | null; email: string } | null,
): MarketingRef | null {
  if (!row) return null;
  return { id: row.id, name: row.name ?? row.email };
}

/** A member sample from the preview select — name falls back to email. */
function toMemberSample(member: {
  id: string;
  user: { name: string | null; email: string };
}): AudienceMemberSample {
  return {
    id: member.id,
    name: member.user.name ?? member.user.email,
    email: member.user.email,
  };
}

/**
 * Coerce a stored `criteria` / `inlineCriteria` JSON to the wire shape, tolerating
 * a legacy/invalid bag by defaulting it empty so a bad row can't crash a read.
 * Writes always go through the zod-validated schema.
 */
function parseCriteria(value: Prisma.JsonValue): AudienceCriteria {
  const parsed = audienceCriteriaSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** A campaign's inline criteria as JSON for a write, or `Prisma.DbNull` to clear it. */
function toCriteriaJson(
  criteria: AudienceCriteria | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!criteria) return Prisma.DbNull;
  return criteria satisfies AudienceCriteria;
}

/** The MINOR-unit discount a promo applies to `amount`, never more than the amount. */
function computeDiscount(
  promo: { discountType: string; discountValue: number },
  amount: number,
): number {
  if (promo.discountType === 'percentage') {
    return Math.min(amount, Math.floor((amount * promo.discountValue) / 100));
  }
  return Math.min(amount, promo.discountValue);
}

/**
 * Intersect the non-empty id lists, or `null` when there were none (no aggregate
 * threshold applied, so the base `where` stands unrestricted). An empty result is
 * a real `[]` — the thresholds matched nobody.
 */
function intersectIdSets(sets: string[][]): string[] | null {
  if (sets.length === 0) return null;
  return sets.reduce((acc, ids) => {
    const set = new Set(ids);
    return acc.filter((id) => set.has(id));
  });
}
