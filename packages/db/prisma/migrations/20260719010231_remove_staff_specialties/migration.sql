-- Remove the staff-directory Specialties feature: drop the per-staff specialty
-- tags (`staff_specialties`) and the gym-wide specialty catalogue
-- (`specialty_tags`). CASCADE clears each table's own foreign-key constraints;
-- no other table references them. Trainer specialties (`trainers.specialties`)
-- are a separate feature and are unaffected.
DROP TABLE IF EXISTS "staff_specialties" CASCADE;
DROP TABLE IF EXISTS "specialty_tags" CASCADE;
