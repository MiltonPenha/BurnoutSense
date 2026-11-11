ALTER TABLE "esbeu_assessments"
ADD COLUMN "dailyBaseline" JSONB,
ADD COLUMN "dailyEvidenceSince" TIMESTAMP(3);
