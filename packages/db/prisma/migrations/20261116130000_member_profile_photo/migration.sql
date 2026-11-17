-- Member-managed profile photo, kept per gym (a person in two gyms has two).
ALTER TABLE "gym_members" ADD COLUMN "photoUrl" TEXT;
