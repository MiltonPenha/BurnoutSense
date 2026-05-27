-- Store the original daily record inputs so history can show exactly what the user entered.
ALTER TABLE "assessments"
ADD COLUMN "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "sleepHours" DOUBLE PRECISION NOT NULL DEFAULT 7,
ADD COLUMN "workHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "pendingTasks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hasImportantExamOrDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tirednessLevel" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "examPressure" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "mood" TEXT,
ADD COLUMN "dailyDescription" TEXT;

UPDATE "assessments"
SET "date" = "createdAt";
