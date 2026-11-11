CREATE TABLE "daily_reminder_deliveries" (
  "userId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "daily_reminder_deliveries_pkey" PRIMARY KEY ("userId", "date"),
  CONSTRAINT "daily_reminder_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
