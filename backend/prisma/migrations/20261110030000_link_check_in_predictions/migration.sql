ALTER TABLE "esbeu_assessments" ADD COLUMN "triggerCheckInId" TEXT;
CREATE INDEX "esbeu_assessments_triggerCheckInId_idx" ON "esbeu_assessments"("triggerCheckInId");
ALTER TABLE "esbeu_assessments" ADD CONSTRAINT "esbeu_assessments_triggerCheckInId_fkey"
FOREIGN KEY ("triggerCheckInId") REFERENCES "daily_check_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
