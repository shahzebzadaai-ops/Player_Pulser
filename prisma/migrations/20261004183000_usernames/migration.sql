-- Customer usernames. Does not touch wallets, bonuses, sessions, prices, or promotions.

ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "usernameNormalized" TEXT;
ALTER TABLE "User" ADD COLUMN "usernameCustomized" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "username" = 'player_' || substr(regexp_replace(lower("id"), '[^a-z0-9]', '', 'g'), 1, 16),
    "usernameNormalized" = 'player_' || substr(regexp_replace(lower("id"), '[^a-z0-9]', '', 'g'), 1, 16)
WHERE "username" IS NULL;

CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");