import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  CashReconciliationReport,
  RecordPosSaleInput,
  RecordPosSaleResponse,
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
  const service = { sendReceipt, recordSale, reconcile } as unknown as OrdersService;
  return { controller: new OrdersController(service), sendReceipt, recordSale, reconcile };
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
});
