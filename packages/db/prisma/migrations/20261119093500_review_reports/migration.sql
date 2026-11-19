CREATE TYPE "ReviewReportReason" AS ENUM ('OFFENSIVE', 'SPAM', 'HARASSMENT', 'OTHER');
CREATE TABLE "review_reports" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" "ReviewReportReason" NOT NULL,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "review_reports_reviewId_memberId_key" ON "review_reports"("reviewId", "memberId");
CREATE INDEX "review_reports_gymId_idx" ON "review_reports"("gymId");
CREATE INDEX "review_reports_memberId_idx" ON "review_reports"("memberId");
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "gym_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
