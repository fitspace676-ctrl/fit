import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createAudienceSegmentSchema,
  createCampaignSchema,
  createMessageTemplateSchema,
  createPromoCodeSchema,
  listCampaignsQuerySchema,
  previewAudienceSchema,
  saveCampaignAsTemplateSchema,
  scheduleCampaignSchema,
  togglePromoCodeSchema,
  updateAudienceSegmentSchema,
  updateCampaignSchema,
  updateMessageTemplateSchema,
  updatePromoCodeSchema,
  validatePromoCodeSchema,
  type AudiencePreviewResponse,
  type AudienceSegmentRow,
  type GetCampaignResponse,
  type ListAudienceSegmentsResponse,
  type ListCampaignsResponse,
  type ListMessageTemplatesResponse,
  type ListPromoCodesResponse,
  type MarketingCatalogResponse,
  type MessageTemplateRow,
  type PromoCodeRow,
  type PromoRedeemResult,
  type PromoValidationResult,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MarketingService } from './marketing.service';

/**
 * Staff-console Marketing API (`/marketing`, T12.7) — campaigns, promo codes,
 * audience segments, and message templates behind the Growth area's Marketing
 * module (T12.1).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability — reads require
 * {@link Permission.MarketingRead}, writes {@link Permission.MarketingManage}. The
 * service runs on the tenant-scoped Prisma client, so no handler ever passes or
 * trusts a `gymId`.
 */
@Controller('marketing')
@UseGuards(TenantGuard, PermissionsGuard)
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  /** `GET /marketing/catalog` — the channel + merge-field catalogs the composer renders. */
  @Get('catalog')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  catalog(): MarketingCatalogResponse {
    return this.marketing.catalog();
  }

  // -------------------------------------------------------------------------
  // Audience segments
  // -------------------------------------------------------------------------

  /** `GET /marketing/segments` — every saved segment, newest first. */
  @Get('segments')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async listSegments(): Promise<ListAudienceSegmentsResponse> {
    return this.marketing.listSegments();
  }

  /** `POST /marketing/segments/preview` — resolve ad-hoc criteria to a count + sample. */
  @Post('segments/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async previewSegment(@Body() body: unknown): Promise<AudiencePreviewResponse> {
    return this.marketing.previewCriteria(parse(previewAudienceSchema, body ?? {}));
  }

  /** `GET /marketing/segments/:id/preview` — resolve a saved segment to a count + sample. */
  @Get('segments/:id/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async previewSavedSegment(@Param('id') id: string): Promise<AudiencePreviewResponse> {
    return this.marketing.previewSegment(id);
  }

  /** `POST /marketing/segments` — create a segment. Returns `201`. */
  @Post('segments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MarketingManage)
  async createSegment(@Body() body: unknown): Promise<AudienceSegmentRow> {
    return this.marketing.createSegment(parse(createAudienceSegmentSchema, body));
  }

  /** `PATCH /marketing/segments/:id` — edit a segment. */
  @Patch('segments/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async updateSegment(@Param('id') id: string, @Body() body: unknown): Promise<AudienceSegmentRow> {
    return this.marketing.updateSegment(id, parse(updateAudienceSegmentSchema, body));
  }

  /** `DELETE /marketing/segments/:id` — delete a segment. Returns `204`. */
  @Delete('segments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MarketingManage)
  async deleteSegment(@Param('id') id: string): Promise<void> {
    await this.marketing.deleteSegment(id);
  }

  // -------------------------------------------------------------------------
  // Message templates
  // -------------------------------------------------------------------------

  /** `GET /marketing/templates` — every template, newest first. */
  @Get('templates')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async listTemplates(): Promise<ListMessageTemplatesResponse> {
    return this.marketing.listTemplates();
  }

  /** `POST /marketing/templates` — create a template. Returns `201`. */
  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MarketingManage)
  async createTemplate(@Body() body: unknown): Promise<MessageTemplateRow> {
    return this.marketing.createTemplate(parse(createMessageTemplateSchema, body));
  }

  /** `PATCH /marketing/templates/:id` — edit a template. */
  @Patch('templates/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async updateTemplate(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MessageTemplateRow> {
    return this.marketing.updateTemplate(id, parse(updateMessageTemplateSchema, body));
  }

  /** `DELETE /marketing/templates/:id` — delete a template. Returns `204`. */
  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MarketingManage)
  async deleteTemplate(@Param('id') id: string): Promise<void> {
    await this.marketing.deleteTemplate(id);
  }

  // -------------------------------------------------------------------------
  // Promo codes
  // -------------------------------------------------------------------------

  /** `GET /marketing/promo-codes` — every code, newest first. */
  @Get('promo-codes')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async listPromoCodes(): Promise<ListPromoCodesResponse> {
    return this.marketing.listPromoCodes();
  }

  /**
   * `POST /marketing/promo-codes/validate` — check a code without consuming it.
   * Always `200`; the body says whether it applies and, given an `amount`, the cut.
   */
  @Post('promo-codes/validate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async validatePromoCode(@Body() body: unknown): Promise<PromoValidationResult> {
    return this.marketing.validatePromoCode(parse(validatePromoCodeSchema, body));
  }

  /**
   * `POST /marketing/promo-codes/redeem` — consume one use of a code. Enforces
   * status / expiry / usage-limit / min-purchase; an invalid code is a `409`.
   */
  @Post('promo-codes/redeem')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async redeemPromoCode(@Body() body: unknown): Promise<PromoRedeemResult> {
    return this.marketing.redeemPromoCode(parse(validatePromoCodeSchema, body));
  }

  /** `POST /marketing/promo-codes` — create a code. Returns `201`; `409` on a clash. */
  @Post('promo-codes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MarketingManage)
  async createPromoCode(@Body() body: unknown): Promise<PromoCodeRow> {
    return this.marketing.createPromoCode(parse(createPromoCodeSchema, body));
  }

  /** `PATCH /marketing/promo-codes/:id` — edit a code. */
  @Patch('promo-codes/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async updatePromoCode(@Param('id') id: string, @Body() body: unknown): Promise<PromoCodeRow> {
    return this.marketing.updatePromoCode(id, parse(updatePromoCodeSchema, body));
  }

  /** `POST /marketing/promo-codes/:id/toggle` — flip a code active/inactive. */
  @Post('promo-codes/:id/toggle')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async togglePromoCode(@Param('id') id: string, @Body() body: unknown): Promise<PromoCodeRow> {
    return this.marketing.togglePromoCode(id, parse(togglePromoCodeSchema, body));
  }

  /** `DELETE /marketing/promo-codes/:id` — delete a code. Returns `204`. */
  @Delete('promo-codes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MarketingManage)
  async deletePromoCode(@Param('id') id: string): Promise<void> {
    await this.marketing.deletePromoCode(id);
  }

  // -------------------------------------------------------------------------
  // Campaigns
  // -------------------------------------------------------------------------

  /** `GET /marketing/campaigns?page&limit&search&channel&status&sort&dir` — one page. */
  @Get('campaigns')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async listCampaigns(@Query() query: unknown): Promise<ListCampaignsResponse> {
    return this.marketing.listCampaigns(parse(listCampaignsQuerySchema, query));
  }

  /** `GET /marketing/campaigns/:id` — one campaign's detail. `404` on a miss. */
  @Get('campaigns/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingRead)
  async getCampaign(@Param('id') id: string): Promise<GetCampaignResponse> {
    return this.marketing.getCampaign(id);
  }

  /** `POST /marketing/campaigns` — create a draft campaign. Returns `201`. */
  @Post('campaigns')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MarketingManage)
  async createCampaign(@Body() body: unknown): Promise<GetCampaignResponse> {
    return this.marketing.createCampaign(parse(createCampaignSchema, body));
  }

  /** `PATCH /marketing/campaigns/:id` — edit a campaign (not once sent). */
  @Patch('campaigns/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async updateCampaign(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetCampaignResponse> {
    return this.marketing.updateCampaign(id, parse(updateCampaignSchema, body));
  }

  /** `POST /marketing/campaigns/:id/send` — send now (stubbed). Sets status/sentCount. */
  @Post('campaigns/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async sendCampaign(@Param('id') id: string): Promise<GetCampaignResponse> {
    return this.marketing.sendCampaign(id);
  }

  /** `POST /marketing/campaigns/:id/schedule` — schedule for a future `scheduledAt`. */
  @Post('campaigns/:id/schedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MarketingManage)
  async scheduleCampaign(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetCampaignResponse> {
    return this.marketing.scheduleCampaign(id, parse(scheduleCampaignSchema, body));
  }

  /** `POST /marketing/campaigns/:id/save-as-template` — save the message as a template. */
  @Post('campaigns/:id/save-as-template')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MarketingManage)
  async saveCampaignAsTemplate(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MessageTemplateRow> {
    return this.marketing.saveCampaignAsTemplate(
      id,
      parse(saveCampaignAsTemplateSchema, body ?? {}),
    );
  }

  /** `DELETE /marketing/campaigns/:id` — delete a campaign. Returns `204`. */
  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.MarketingManage)
  async deleteCampaign(@Param('id') id: string): Promise<void> {
    await this.marketing.deleteCampaign(id);
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
