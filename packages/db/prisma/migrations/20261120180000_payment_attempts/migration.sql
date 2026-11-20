-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'CAPTURED', 'FAILED', 'EXPIRED', 'CANCELLED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "PaymentReversalStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'flitt',
    "merchantId" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "purpose" TEXT NOT NULL,
    "fulfilment" JSONB,
    "returnTo" TEXT NOT NULL DEFAULT 'web',
    "checkoutUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "providerStatus" TEXT,
    "failureCode" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "restockItems" BOOLEAN NOT NULL DEFAULT true,
    "processedById" TEXT,
    "actor" TEXT,
    "status" "PaymentReversalStatus" NOT NULL DEFAULT 'PENDING',
    "refundId" TEXT,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_providerOrderId_key" ON "payment_attempts"("providerOrderId");
CREATE INDEX "payment_attempts_gymId_idx" ON "payment_attempts"("gymId");
CREATE INDEX "payment_attempts_orderId_createdAt_idx" ON "payment_attempts"("orderId", "createdAt");
CREATE INDEX "payment_attempts_status_expiresAt_idx" ON "payment_attempts"("status", "expiresAt");
CREATE UNIQUE INDEX "payment_reversals_refundId_key" ON "payment_reversals"("refundId");
CREATE INDEX "payment_reversals_gymId_idx" ON "payment_reversals"("gymId");
CREATE INDEX "payment_reversals_paymentId_idx" ON "payment_reversals"("paymentId");
CREATE INDEX "payment_reversals_status_createdAt_idx" ON "payment_reversals"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
