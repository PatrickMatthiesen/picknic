-- Existing lists need one refresh to record which meal plan they reflect.
ALTER TABLE "ShoppingList" ADD COLUMN "planFingerprint" TEXT;
