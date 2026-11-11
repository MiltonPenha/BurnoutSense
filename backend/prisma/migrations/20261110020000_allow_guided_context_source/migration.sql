ALTER TABLE "esbeu_assessments"
DROP CONSTRAINT "assessment_source_domain",
ADD CONSTRAINT "assessment_source_domain"
CHECK ("source" IN ('context', 'daily_experimental', 'guided_review'));
