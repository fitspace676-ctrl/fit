-- A sale the desk settles against a bank transfer the member made, recorded by
-- the operator like cash. Off by default in the gym's payment settings, so no
-- till offers it until a gym switches it on.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';
