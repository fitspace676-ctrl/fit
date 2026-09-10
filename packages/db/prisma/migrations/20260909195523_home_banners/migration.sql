-- Home-screen promotional banners (T1.16).
--
-- A new gym-scoped table, nothing else touched: the member app's home carousel had
-- no source of truth at all, so this is purely additive and there is nothing to
-- backfill. Every column is either NOT NULL with a default or nullable, so the
-- table is usable the moment it exists and an existing gym simply has no banners.
--
-- The single index carries the read both surfaces make — the console's list and
-- `GET /banners` — which is (gymId, sortOrder); the scheduling window is filtered
-- in the same query but is far too low-cardinality to be worth its own index on a
-- table that holds a handful of rows per gym.

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "title" TEXT,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_gymId_sortOrder_idx" ON "banners"("gymId", "sortOrder");

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
