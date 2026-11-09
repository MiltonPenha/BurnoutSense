CREATE TABLE "daily_check_ins" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "mood" TEXT NOT NULL,
  "sleepHours" DOUBLE PRECISION NOT NULL,
  "energy" INTEGER NOT NULL,
  "academicDemand" INTEGER NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "contextAssessmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "daily_check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_sleep_domain" CHECK ("sleepHours" BETWEEN 0 AND 24),
  CONSTRAINT "daily_energy_domain" CHECK ("energy" BETWEEN 0 AND 4),
  CONSTRAINT "daily_demand_domain" CHECK ("academicDemand" BETWEEN 0 AND 4),
  CONSTRAINT "daily_note_length" CHECK (char_length("note") <= 500),
  CONSTRAINT "daily_mood_domain" CHECK ("mood" IN ('Feliz', 'Calmo', 'Ansioso', 'Triste', 'Irritado', 'Cansado', 'Desmotivado'))
);
CREATE UNIQUE INDEX "daily_check_ins_userId_date_key" ON "daily_check_ins"("userId", "date");
CREATE INDEX "daily_check_ins_userId_date_id_idx" ON "daily_check_ins"("userId", "date", "id");
ALTER TABLE "daily_check_ins" ADD CONSTRAINT "daily_check_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_check_ins" ADD CONSTRAINT "daily_check_ins_contextAssessmentId_fkey" FOREIGN KEY ("contextAssessmentId") REFERENCES "esbeu_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
