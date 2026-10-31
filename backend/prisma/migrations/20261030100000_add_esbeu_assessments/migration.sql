-- Additive migration. Historical assessments/results remain untouched.
CREATE TABLE "esbeu_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "observedItems" JSONB,
    "estimatedOverall" DOUBLE PRECISION NOT NULL,
    "observedOverall" DOUBLE PRECISION,
    "observedExhaustion" DOUBLE PRECISION,
    "observedDistancing" DOUBLE PRECISION,
    "observedInefficacy" DOUBLE PRECISION,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "formVersion" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "adultConfirmed" BOOLEAN NOT NULL,
    "enrolledConfirmed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "esbeu_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "esbeu_estimated_domain" CHECK ("estimatedOverall" BETWEEN 0 AND 4),
    CONSTRAINT "esbeu_observed_domain" CHECK ("observedOverall" BETWEEN 0 AND 4),
    CONSTRAINT "esbeu_exhaustion_domain" CHECK ("observedExhaustion" BETWEEN 0 AND 4),
    CONSTRAINT "esbeu_distancing_domain" CHECK ("observedDistancing" BETWEEN 0 AND 4),
    CONSTRAINT "esbeu_inefficacy_domain" CHECK ("observedInefficacy" BETWEEN 0 AND 4),
    CONSTRAINT "esbeu_eligibility" CHECK ("adultConfirmed" AND "enrolledConfirmed"),
    CONSTRAINT "esbeu_observed_complete" CHECK (
      ("observedItems" IS NULL AND "observedOverall" IS NULL AND "observedExhaustion" IS NULL
       AND "observedDistancing" IS NULL AND "observedInefficacy" IS NULL)
      OR ("observedItems" IS NOT NULL AND "observedItems" <> 'null'::jsonb AND "observedOverall" IS NOT NULL
       AND "observedExhaustion" IS NOT NULL AND "observedDistancing" IS NOT NULL AND "observedInefficacy" IS NOT NULL)
    )
);
CREATE INDEX "esbeu_assessments_userId_createdAt_id_idx" ON "esbeu_assessments"("userId", "createdAt", "id");
ALTER TABLE "esbeu_assessments" ADD CONSTRAINT "esbeu_assessments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
