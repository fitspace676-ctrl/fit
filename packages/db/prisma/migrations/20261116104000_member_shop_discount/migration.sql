ALTER TABLE "orders"
  ADD COLUMN "memberDiscountPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "memberDiscountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_member_discount_percent_check" CHECK ("memberDiscountPercent" BETWEEN 0 AND 90),
  ADD CONSTRAINT "orders_member_discount_amount_check" CHECK ("memberDiscountAmount" >= 0);
