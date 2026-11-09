ALTER TABLE "esbeu_assessments" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'context';
ALTER TABLE "esbeu_assessments" ADD COLUMN "evolution" JSONB;
ALTER TABLE "esbeu_assessments" ADD CONSTRAINT "assessment_source_domain" CHECK ("source" IN ('context', 'daily_experimental'));
ALTER TABLE "daily_check_ins" ALTER COLUMN "energy" DROP NOT NULL;
ALTER TABLE "daily_check_ins" ALTER COLUMN "academicDemand" DROP NOT NULL;
ALTER TABLE "daily_check_ins" ADD COLUMN "observations" JSONB;
