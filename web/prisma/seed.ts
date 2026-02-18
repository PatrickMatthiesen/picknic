import { PrismaPg } from "@prisma/adapter-pg";
import { MembershipRole, MealType, PrismaClient, ShoppingItemSource, ShoppingItemStatus } from "@prisma/client";

const connectionString = process.env.DATABASE_URL ?? process.env.ConnectionStrings__picknicdb;

if (!connectionString) {
  throw new Error("DATABASE_URL or ConnectionStrings__picknicdb must be set for seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function seed() {
  const workosUserId = process.env.SEED_WORKOS_USER_ID ?? "seed-workos-user";
  const email = process.env.SEED_USER_EMAIL ?? "demo@picknic.local";
  const householdOrgId = process.env.SEED_WORKOS_ORG_ID ?? "seed-workos-org";
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  const day = weekStart.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setUTCDate(weekStart.getUTCDate() + diff);

  const user = await prisma.user.upsert({
    where: { workosUserId },
    update: {
      email,
      displayName: "Picknic Demo User",
    },
    create: {
      workosUserId,
      email,
      displayName: "Picknic Demo User",
    },
  });

  const household = await prisma.household.upsert({
    where: { workosOrganizationId: householdOrgId },
    update: {
      ownerId: user.id,
      name: "Picknic Demo Household",
    },
    create: {
      workosOrganizationId: householdOrgId,
      ownerId: user.id,
      name: "Picknic Demo Household",
    },
  });

  await prisma.householdMember.upsert({
    where: {
      householdId_userId: {
        householdId: household.id,
        userId: user.id,
      },
    },
    update: { role: MembershipRole.OWNER },
    create: {
      householdId: household.id,
      userId: user.id,
      role: MembershipRole.OWNER,
    },
  });

  const recipe = await prisma.recipe.upsert({
    where: {
      id: `${household.id}-seed-recipe`,
    },
    update: {
      title: "Seeded Veggie Pasta",
      description: "A quick pasta for seed data.",
      servings: 4,
      tags: ["quick", "vegetarian"],
    },
    create: {
      id: `${household.id}-seed-recipe`,
      householdId: household.id,
      createdById: user.id,
      title: "Seeded Veggie Pasta",
      description: "A quick pasta for seed data.",
      servings: 4,
      tags: ["quick", "vegetarian"],
    },
  });

  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.recipeStep.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.recipeIngredient.createMany({
    data: [
      { recipeId: recipe.id, name: "Pasta", quantity: 500, unit: "g", position: 1 },
      { recipeId: recipe.id, name: "Tomato sauce", quantity: 2, unit: "cup", position: 2 },
    ],
  });
  await prisma.recipeStep.createMany({
    data: [
      { recipeId: recipe.id, instruction: "Boil pasta.", position: 1 },
      { recipeId: recipe.id, instruction: "Stir in sauce.", position: 2 },
    ],
  });

  const mealPlan = await prisma.mealPlan.upsert({
    where: {
      householdId_weekStart: {
        householdId: household.id,
        weekStart,
      },
    },
    update: {
      createdById: user.id,
    },
    create: {
      householdId: household.id,
      createdById: user.id,
      weekStart,
    },
  });

  await prisma.mealPlanEntry.upsert({
    where: {
      mealPlanId_date_mealType: {
        mealPlanId: mealPlan.id,
        date: weekStart,
        mealType: MealType.DINNER,
      },
    },
    update: {
      recipeId: recipe.id,
      servingsOverride: 4,
    },
    create: {
      mealPlanId: mealPlan.id,
      date: weekStart,
      mealType: MealType.DINNER,
      recipeId: recipe.id,
      servingsOverride: 4,
    },
  });

  const shoppingList = await prisma.shoppingList.upsert({
    where: { mealPlanId: mealPlan.id },
    update: { name: `Week of ${weekStart.toISOString().slice(0, 10)}` },
    create: {
      householdId: household.id,
      mealPlanId: mealPlan.id,
      createdById: user.id,
      name: `Week of ${weekStart.toISOString().slice(0, 10)}`,
    },
  });

  await prisma.shoppingListItem.deleteMany({ where: { shoppingListId: shoppingList.id } });
  await prisma.shoppingListItem.createMany({
    data: [
      {
        shoppingListId: shoppingList.id,
        ingredientName: "Pasta",
        quantity: 500,
        unit: "g",
        source: ShoppingItemSource.AUTO,
        status: ShoppingItemStatus.PENDING,
      },
      {
        shoppingListId: shoppingList.id,
        ingredientName: "Tomato sauce",
        quantity: 2,
        unit: "cup",
        source: ShoppingItemSource.AUTO,
        status: ShoppingItemStatus.PENDING,
      },
    ],
  });

  await prisma.pantryItem.upsert({
    where: {
      householdId_ingredientName_unit: {
        householdId: household.id,
        ingredientName: "Pasta",
        unit: "g",
      },
    },
    update: {
      quantity: 100,
      userId: user.id,
    },
    create: {
      householdId: household.id,
      userId: user.id,
      ingredientName: "Pasta",
      quantity: 100,
      unit: "g",
    },
  });
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed.");
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
