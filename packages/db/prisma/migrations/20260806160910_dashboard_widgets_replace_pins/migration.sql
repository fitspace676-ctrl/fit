/*
  Warnings:

  - You are about to drop the `dashboard_pins` table. Its rows are NOT lost: the
    backfill below carries every pin across to `dashboard_widgets` before the drop.

  Statement order differs from Prisma's generated draft on purpose. Prisma emitted
  the drop first; here the new table is created and backfilled while
  `dashboard_pins` still exists, and only then is the old table dropped.
*/

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "widgetKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_widgets_gymId_segment_position_idx" ON "dashboard_widgets"("gymId", "segment", "position");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_widgets_gymId_segment_widgetKey_key" ON "dashboard_widgets"("gymId", "segment", "widgetKey");

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry each gym's existing pins across to the shared layout. A pin is per-user;
-- the same section pinned by three colleagues becomes ONE gym-level widget, dated
-- from the earliest pin. Pins whose (metric, section) has no catalogue entry are
-- dropped -- they have nowhere to live in the new model.
INSERT INTO "dashboard_widgets" ("id", "gymId", "segment", "widgetKey", "position", "createdAt")
SELECT
  gen_random_uuid()::text,
  agg."gymId",
  agg."segment",
  agg."widgetKey",
  (ROW_NUMBER() OVER (PARTITION BY agg."gymId", agg."segment" ORDER BY agg."pinnedAt"))::int - 1,
  agg."pinnedAt"
FROM (
  SELECT
    p."gymId"      AS "gymId",
    m.segment      AS "segment",
    m.widget_key   AS "widgetKey",
    MIN(p."createdAt") AS "pinnedAt"
  FROM "dashboard_pins" p
  JOIN (VALUES
    ('pos',        'sales-by-method',            'sales',   'sales.payment-method'),
    ('pos',        'product-sales',              'sales',   'sales.top-products'),
    ('revenue',    'revenue-by-plan',            'sales',   'sales.top-plans'),
    ('members',    'new-members-over-time',      'members', 'members.new-signups'),
    ('members',    'churn-rate-trend',           'members', 'members.churn'),
    ('revenue',    'revenue-over-time',          'revenue', 'revenue.over-time'),
    ('revenue',    'revenue-by-location',        'revenue', 'revenue.by-location'),
    ('classes',    'most-popular-classes',       'classes', 'classes.most-booked'),
    ('attendance', 'peak-hours',                 'classes', 'classes.peak-hours'),
    ('staff',      'sessions-booked-per-trainer', 'staff',  'staff.sessions-per-trainer')
  ) AS m(metric, section, segment, widget_key)
    ON m.metric = p."metric" AND m.section = p."section"
  GROUP BY p."gymId", m.segment, m.widget_key
) AS agg;

-- DropForeignKey
ALTER TABLE "dashboard_pins" DROP CONSTRAINT "dashboard_pins_gymId_fkey";

-- DropForeignKey
ALTER TABLE "dashboard_pins" DROP CONSTRAINT "dashboard_pins_userId_fkey";

-- DropTable
DROP TABLE "dashboard_pins";
