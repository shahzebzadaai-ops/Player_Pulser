-- Allow a passkey to be stored as another verified AuthIdentity method.
ALTER TYPE "AuthProvider" ADD VALUE IF NOT EXISTS 'PASSKEY';
