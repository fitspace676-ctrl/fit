-- A passage imported from the gym's ZKTeco turnstile or door controller.
-- Its own migration: a new enum value cannot be used in the transaction that adds it.

-- AlterEnum
ALTER TYPE "CheckInMethod" ADD VALUE 'TURNSTILE';
