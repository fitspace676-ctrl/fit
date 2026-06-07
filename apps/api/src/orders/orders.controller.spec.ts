import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { SendReceiptInput, SendReceiptResponse } from '@fit/types';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';

const validBody: SendReceiptInput = {
  email: 'buyer@example.com',
  receipt: {
    currency: 'USD',
    items: [{ name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 }],
    subtotal: 500,
    discountTotal: 0,
    total: 500,
    paymentMethod: 'cash',
    cashTendered: 1000,
    changeDue: 500,
  },
};

function setup() {
  const sendReceipt = vi.fn<() => Promise<SendReceiptResponse>>(() =>
    Promise.resolve({ delivered: true }),
  );
  const service = { sendReceipt } as unknown as OrdersService;
  return { controller: new OrdersController(service), sendReceipt };
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
});
