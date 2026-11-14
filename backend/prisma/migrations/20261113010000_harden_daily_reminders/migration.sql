ALTER TABLE "users" ALTER COLUMN "dailyReminder" SET DEFAULT false;

ALTER TABLE "daily_reminder_deliveries" RENAME COLUMN "claimedAt" TO "submissionStartedAt";

-- An old unconfirmed attempt may already have been accepted by SMTP.
UPDATE "daily_reminder_deliveries"
SET "submissionStartedAt" = COALESCE("submissionStartedAt", "nextAttemptAt" - INTERVAL '1 minute', CURRENT_TIMESTAMP)
WHERE "sentAt" IS NULL AND "attempts" > 0;
