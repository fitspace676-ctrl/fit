import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  addCartItemSchema,
  cartCheckoutSchema,
  updateCartItemSchema,
  type CartCheckoutResponse,
  type CartResponse,
} from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { env } from '../config/env';
import { CartService, type CartResult, type CartSessionDirective } from './cart.service';

/** The anonymous-cart cookie name — keys a guest's cart before they sign in. */
const SESSION_COOKIE = 'fit_cart_sid';

/** Anonymous cart lifetime — 30 days, long enough to survive a return visit. */
const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cart + checkout API (`/cart`, T7.7) — the member-facing online shop's
 * server-side cart.
 *
 * The whole controller is `@Public()`: the cart is reached both signed-in (a
 * member, scoped by their JWT via {@link CartIdentityMiddleware}) and
 * anonymously (a guest on a gym subdomain, scoped by the host via
 * `SubdomainTenantMiddleware`), so it opts out of the deny-by-default permission
 * gate — authorization is the tenant + the caller's own session/cookie, not an
 * RBAC capability.
 *
 * A guest's cart is keyed by the {@link SESSION_COOKIE} cookie this controller
 * issues; the {@link CartService} only signals how the cookie should change (set
 * a new id, or clear it after a sign-in merge) and the controller applies it, so
 * all cookie handling lives here at the HTTP edge.
 */
@Public()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** `GET /cart` — the current cart, re-priced live. Never creates a cart. */
  @Get()
  async get(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<CartResponse> {
    return this.respond(res, await this.cart.getCart(readSession(req)));
  }

  /** `POST /cart/items` — add a variant to the cart (or bump its quantity). */
  @Post('items')
  async addItem(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponse> {
    const input = parse(addCartItemSchema, body);
    return this.respond(res, await this.cart.addItem(readSession(req), input));
  }

  /** `PATCH /cart/items/:variantId` — set a line's absolute quantity. */
  @Patch('items/:variantId')
  async updateItem(
    @Param('variantId') variantId: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponse> {
    const input = parse(updateCartItemSchema, body);
    return this.respond(res, await this.cart.updateItem(readSession(req), variantId, input.qty));
  }

  /** `DELETE /cart/items/:variantId` — remove a line (idempotent). */
  @Delete('items/:variantId')
  async removeItem(
    @Param('variantId') variantId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartResponse> {
    return this.respond(res, await this.cart.removeItem(readSession(req), variantId));
  }

  /**
   * `POST /cart/checkout` — re-validate against live prices/stock, then create a
   * pending order. Returns `201 { orderId }` on success; a price drift is
   * `409 { code: "PRICE_CHANGED", newPrices }` and an out-of-stock line is
   * `422 { code: "OUT_OF_STOCK", removedItems }` — both surfaced with their full
   * structured body (so the status is set here rather than thrown, which would let
   * the global error filter flatten the extra fields away).
   */
  @Post('checkout')
  async checkout(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartCheckoutResponse | { code: string; newPrices?: unknown; removedItems?: unknown }> {
    const input = parse(cartCheckoutSchema, body);
    const outcome = await this.cart.checkout(readSession(req), input);
    if (outcome.kind === 'price_changed') {
      res.status(409);
      return { code: 'PRICE_CHANGED', newPrices: outcome.newPrices };
    }
    if (outcome.kind === 'out_of_stock') {
      res.status(422);
      return { code: 'OUT_OF_STOCK', removedItems: outcome.removedItems };
    }
    res.status(201);
    return { orderId: outcome.orderId };
  }

  /** Apply the cart result's cookie directive and wrap the view as the response. */
  private respond(res: Response, result: CartResult): CartResponse {
    applySession(res, result.session);
    return { cart: result.view };
  }
}

/** Read the anon cart session id from the request cookies, if present. */
function readSession(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) {
      continue;
    }
    if (pair.slice(0, index).trim() === SESSION_COOKIE) {
      return decodeURIComponent(pair.slice(index + 1).trim()) || undefined;
    }
  }
  return undefined;
}

/** Set or clear the anon cart cookie per the service's directive. */
function applySession(res: Response, directive: CartSessionDirective): void {
  // `SameSite=None; Secure` in production so the cookie survives the cross-site
  // hop from the gym subdomain to the API host; relaxed on http dev/test.
  const isProd = env.NODE_ENV === 'production';
  const options = {
    httpOnly: true,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    secure: isProd,
    path: '/',
  };
  if (directive.assign) {
    res.cookie(SESSION_COOKIE, directive.assign, { ...options, maxAge: SESSION_COOKIE_MAX_AGE_MS });
  } else if (directive.clear) {
    res.clearCookie(SESSION_COOKIE, options);
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
