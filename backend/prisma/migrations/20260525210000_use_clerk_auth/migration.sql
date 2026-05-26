-- Add Clerk identity column as nullable first so existing prototype rows can migrate safely.
ALTER TABLE "users" ADD COLUMN "clerkId" TEXT;

-- Existing local-password users are not valid Clerk users. This keeps old prototype rows
-- migratable without resetting the database; new requests will create real Clerk-linked users.
UPDATE "users"
SET "clerkId" = 'legacy_' || "id"
WHERE "clerkId" IS NULL;

ALTER TABLE "users" ALTER COLUMN "clerkId" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" DROP COLUMN "passwordHash";

CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");
