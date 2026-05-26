DROP INDEX IF EXISTS "users_clerkId_key";

ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;

UPDATE "users"
SET "passwordHash" = '$2b$10$dJJmoOMCCtz/RATetXgqtutJvrkmoSrDKPSNKicTABCM4sz6hbVKi'
WHERE "passwordHash" IS NULL;

UPDATE "users"
SET "name" = 'Usuário legado'
WHERE "name" IS NULL;

UPDATE "users"
SET "email" = "clerkId" || '@legacy.local'
WHERE "email" IS NULL;

ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" DROP COLUMN IF EXISTS "clerkId";

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
