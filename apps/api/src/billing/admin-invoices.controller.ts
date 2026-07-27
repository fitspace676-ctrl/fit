import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createInvoiceSchema,
  listAdminInvoicesQuerySchema,
  type CreateInvoiceResponse,
  type ListAdminInvoicesResponse,
  type SendInvoiceEmailResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminInvoicesService } from './admin-invoices.service';

/**
 * Staff-console invoice API (`/admin/invoices`) — the Payments hub's Invoices tab.
 *
 * Most invoices are raised automatically (enrolment, renewal, a POS order); these
 * routes add the gym-wide view of them plus the two things only staff can do: raise
 * one by hand and send one to the member.
 *
 * Every route is tenant-scoped staff access — {@link TenantGuard} pins the request to
 * one gym and {@link PermissionsGuard} enforces the capability. Reading the roster is
 * {@link Permission.BillingRead}; raising an invoice and emailing one are
 * {@link Permission.BillingManage}, the same split the plans hub uses. The service
 * runs on the tenant-scoped Prisma client, so no handler passes a `gymId`.
 *
 * The PDF download stays on {@link InvoicesController} (`GET /invoices/:id/pdf`),
 * which already served the member-detail invoice list before this tab existed.
 */
@Controller('admin/invoices')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminInvoicesController {
  constructor(private readonly invoices: AdminInvoicesService) {}

  /**
   * `GET /admin/invoices?page&limit&search&status&type&issuedFrom&issuedTo&sort&dir` —
   * one filtered, server-paginated page of the gym's invoices. The query is validated
   * up front (a bad page/limit/status/date → `400`). An empty page is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingRead)
  async list(@Query() query: unknown): Promise<ListAdminInvoicesResponse> {
    return this.invoices.listInvoices(parse(listAdminInvoicesQuerySchema, query));
  }

  /**
   * `POST /admin/invoices` — raise an invoice by hand against a member. The body is
   * re-validated with the same schema the admin form uses, so the two cannot drift; an
   * unknown member is a `404`. Returns the new invoice, number included (`201`).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.BillingManage)
  async create(@Body() body: unknown): Promise<CreateInvoiceResponse> {
    return this.invoices.createInvoice(parse(createInvoiceSchema, body));
  }

  /**
   * `POST /admin/invoices/:id/email` — email the invoice to the member it bills, PDF
   * attached. `404`s an unknown / cross-tenant id, `422`s when there is no member or
   * no address to send to, and `503`s (`EMAIL_NOT_CONFIGURED`) when outbound mail is
   * disabled. A `200` means the provider accepted the message.
   */
  @Post(':id/email')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingManage)
  async email(@Param('id') id: string): Promise<SendInvoiceEmailResponse> {
    return this.invoices.emailInvoice(id);
  }
}

/** Validate `data` against `schema`, turning a Zod failure into a `400` with field paths. */
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
