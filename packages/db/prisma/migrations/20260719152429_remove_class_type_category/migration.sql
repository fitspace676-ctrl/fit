-- Drop the now-unused category column from class_types (the product removed
-- class-type categories entirely).
ALTER TABLE "class_types" DROP COLUMN "category";
