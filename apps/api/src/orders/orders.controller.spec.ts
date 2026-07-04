import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import type {
  AdminOrderDetail,
  CashReconciliationReport,
  ListOrdersResponse,
  RecordPosSaleInput,
  RecordPosSaleResponse,
  RefundOrderResponse,
  SendReceiptInput,
  SendReceiptResponse,
} from '@fit/types';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';

const validReceipt: SendReceiptInput['receipt'] = {
  currency: 'USD',
  items: [{ name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 }],
  subtotal: 500,
  discountTotal: 0,
  total: 500,
  paymentMethod: 'cash',
  cashTendered: 1000,
  changeDue: 500,
};

const validBody: SendReceiptInput = {
  email: 'buyer@example.com',
  receipt: validReceipt,
};

function setup() {
  const sendReceipt = vi.fn<() => Promise<SendReceiptResponse>>(() =>
    Promise.resolve({ delivered: true }),
  );
  const recordSale = vi.fn<() => Promise<RecordPosSaleResponse>>(() =>
    Promise.resolve({ orderId: 'order-1', paymentId: 'pay-1' }),
  );
  const reconcile = vi.fn<() => Promise<CashReconciliationReport>>(() =>
    Promise.resolve({
      date: '2026-06-07',
      currency: 'USD',
      methods: [],
      salesCount: 0,
      grossTotal: 0,
      expectedCash: 0,
      generatedAt: '2026-06-07T18:00:00.000Z',
    }),
  );
  const listOrders = vi.fn<() => Promise<ListOrdersResponse>>(() =>
    Promise.resolve({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      summary: {
        orderCount: 0,
        grossTotal: 0,
        refundedTotal: 0,
        netTotal: 0,
        currency: 'GEL',
      },
    }),
  );
  const getOrder = vi.fn<() => Promise<AdminOrderDetail>>(() =>
    Promise.resolve({ id: 'order-1' } as unknown as AdminOrderDetail),
  );
  const refundOrder = vi.fn<() => Promise<RefundOrderResponse>>(() =>
    Promise.resolve({ refundId: 'refund-1' }),
  );
  // eslint-disable-next-line @typescript-eslint/require-await
  const streamOrdersCsv = vi.fn(async function* () {
    yield 'header\r\n';
    yield 'row\r\n';
  });
  const service = {
    sendReceipt,
    recordSale,
    reconcile,
    listOrders,
    getOrder,
    refundOrder,
    streamOrdersCsv,
  } as unknown as OrdersService;
  return {
    controller: new OrdersController(service),
    sendReceipt,
    recordSale,
    reconcile,
    listOrders,
    getOrder,
    refundOrder,
    streamOrdersCsv,
  };
}

/** A mock Express response capturing the streamed CSV chunks + headers. */
function mockResponse() {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  const setHeader = vi.fn((key: string, value: string) => {
    headers[key] = value;
  });
  const write = vi.fn((chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  const end = vi.fn();
  const res = { setHeader, write, end } as unknown as Response;
  return { res, headers, chunks, end };
}

describe('OrdersController', () => {
  afterEach(() => vi.clearAllMocks());

  describe('POST /orders/receipt', () => {
    it('validates the body and delegates to the service', async () => {
      const { controller, sendReceipt } = setup();

      const result = await controller.sendReceipt(validBody);

      expect(result).toEqual({ delivered: true });
      expect(sendReceipt).toHaveBeenCalledWith(validBody);
    });

    it('normalises the recipient email before delegating', async () => {
      const { controller, sendReceipt } = setup();

      await controller.sendReceipt({ ...validBody, email: '  Buyer@Example.COM ' });

      expect(sendReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'buyer@example.com' }),
      );
    });

    it('rejects a malformed body with a 400 and never calls the service', async () => {
      const { controller, sendReceipt } = setup();

      await expect(controller.sendReceipt({ email: 'nope', receipt: {} })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sendReceipt).not.toHaveBeenCalled();
    });
  });

  describe('POST /orders/pos-sale', () => {
    const saleBody: RecordPosSaleInput = { memberId: 'mem-1', receipt: validReceipt };

    it('validates the body and delegates to the service', async () => {
      const { controller, recordSale } = setup();

      const result = await controller.recordSale(saleBody);

      expect(result).toEqual({ orderId: 'order-1', paymentId: 'pay-1' });
      expect(recordSale).toHaveBeenCalledWith(saleBody);
    });

    it('rejects a malformed body with a 400 and never calls the service', async () => {
      const { controller, recordSale } = setup();

      await expect(controller.recordSale({ receipt: {} })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(recordSale).not.toHaveBeenCalled();
    });
  });

  describe('GET /orders/reconciliation', () => {
    it('validates the date query and delegates to the service', async () => {
      const { controller, reconcile } = setup();

      const result = await controller.reconcile({ date: '2026-06-07' });

      expect(result.date).toBe('2026-06-07');
      expect(reconcile).toHaveBeenCalledWith({ date: '2026-06-07' });
    });

    it('rejects an impossible date with a 400 and never calls the service', async () => {
      const { controller, reconcile } = setup();

      await expect(controller.reconcile({ date: '2026-02-30' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(reconcile).not.toHaveBeenCalled();
    });
  });

  describe('GET /orders', () => {
    it('coerces the query and delegates to the service', async () => {
      const { controller, listOrders } = setup();

      const result = await controller.list({ channel: 'POS', page: '2', limit: '10' });

      expect(result.total).toBe(0);
      expect(listOrders).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'POS', page: 2, limit: 10 }),
      );
    });

    it('rejects an unknown channel with a 400', async () => {
      const { controller, listOrders } = setup();

      await expect(controller.list({ channel: 'MAIL' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(listOrders).not.toHaveBeenCalled();
    });
  });

  describe('GET /orders/:id', () => {
    it('delegates to the service with the path id', async () => {
      const { controller, getOrder } = setup();

      const result = await controller.detail('order-1');

      expect(result.id).toBe('order-1');
      expect(getOrder).toHaveBeenCalledWith('order-1');
    });
  });

  describe('POST /orders/:id/refund', () => {
    it('validates the body and delegates with the path id', async () => {
      const { controller, refundOrder } = setup();

      const result = await controller.refund('order-1', {
        amount: 500,
        reason: 'Returned',
        restockItems: true,
      });

      expect(result).toEqual({ refundId: 'refund-1' });
      expect(refundOrder).toHaveBeenCalledWith('order-1', {
        amount: 500,
        reason: 'Returned',
        restockItems: true,
      });
    });

    it('defaults restockItems to true when omitted', async () => {
      const { controller, refundOrder } = setup();

      await controller.refund('order-1', { amount: 500, reason: 'Returned' });

      expect(refundOrder).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ restockItems: true }),
      );
    });

    it('rejects a non-positive amount with a 400 and never calls the service', async () => {
      const { controller, refundOrder } = setup();

      await expect(controller.refund('order-1', { amount: 0, reason: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(refundOrder).not.toHaveBeenCalled();
    });
  });

  describe('GET /orders/export', () => {
    it('sets the CSV headers and pipes every streamed chunk to the response', async () => {
      const { controller, streamOrdersCsv } = setup();
      const { res, headers, chunks, end } = mockResponse();

      await controller.export({ channel: 'ONLINE' }, res);

      expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(headers['Content-Disposition']).toBe('attachment; filename="orders.csv"');
      expect(chunks).toEqual(['header\r\n', 'row\r\n']);
      expect(end).toHaveBeenCalledOnce();
      expect(streamOrdersCsv).toHaveBeenCalledWith(expect.objectContaining({ channel: 'ONLINE' }));
    });

    it('rejects a malformed filter with a 400 before streaming', async () => {
      const { controller, streamOrdersCsv } = setup();
      const { res } = mockResponse();

      await expect(controller.export({ status: 'NOPE' }, res)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(streamOrdersCsv).not.toHaveBeenCalled();
    });
  });
});
