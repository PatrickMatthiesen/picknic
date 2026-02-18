import { ShoppingItemSource, ShoppingItemStatus } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAppAuthContext, resolveActiveHouseholdId } from "@/lib/auth-context";
import { getWeekStartUtc } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { generateShoppingListForWeek, getShoppingListForWeek } from "@/lib/shopping-list-service";

export default async function ShoppingListPage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const householdId = await resolveActiveHouseholdId(userId, organizationId);

  if (!householdId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Shopping list</h1>
        <p className="text-zinc-600">
          Your account is authenticated, but no household was found yet. Complete organization setup in WorkOS and sign
          in again.
        </p>
        <Link className="text-sm font-medium underline" href="/">
          Back home
        </Link>
      </main>
    );
  }

  const weekStart = getWeekStartUtc(new Date());

  async function regenerateShoppingList() {
    "use server";

    const context = await requireAppAuthContext();
    const activeHouseholdId = await resolveActiveHouseholdId(context.userId, context.organizationId);
    if (!activeHouseholdId) {
      throw new Error("No household found for this user.");
    }

    await generateShoppingListForWeek({
      householdId: activeHouseholdId,
      userId: context.userId,
      weekStart: getWeekStartUtc(new Date()),
    });

    revalidatePath("/shopping-list");
  }

  async function toggleItemStatus(formData: FormData) {
    "use server";

    const itemId = formData.get("itemId");
    const nextStatus = formData.get("nextStatus");

    if (typeof itemId !== "string" || itemId.length === 0) {
      throw new Error("Item id is required.");
    }

    if (
      nextStatus !== ShoppingItemStatus.PENDING &&
      nextStatus !== ShoppingItemStatus.BOUGHT &&
      nextStatus !== ShoppingItemStatus.SKIPPED
    ) {
      throw new Error("Invalid shopping item status.");
    }

    const context = await requireAppAuthContext();
    const activeHouseholdId = await resolveActiveHouseholdId(context.userId, context.organizationId);
    if (!activeHouseholdId) {
      throw new Error("No household found for this user.");
    }

    await prisma.shoppingListItem.updateMany({
      where: {
        id: itemId,
        shoppingList: { householdId: activeHouseholdId },
      },
      data: { status: nextStatus },
    });

    revalidatePath("/shopping-list");
  }

  async function addManualItem(formData: FormData) {
    "use server";

    const ingredientName = formData.get("ingredientName");
    const quantityValue = formData.get("quantity");
    const unitValue = formData.get("unit");

    if (typeof ingredientName !== "string" || ingredientName.trim().length === 0) {
      throw new Error("Item name is required.");
    }

    const context = await requireAppAuthContext();
    const activeHouseholdId = await resolveActiveHouseholdId(context.userId, context.organizationId);
    if (!activeHouseholdId) {
      throw new Error("No household found for this user.");
    }

    const currentWeekStart = getWeekStartUtc(new Date());
    const mealPlan = await prisma.mealPlan.findUnique({
      where: {
        householdId_weekStart: {
          householdId: activeHouseholdId,
          weekStart: currentWeekStart,
        },
      },
      select: { id: true },
    });

    if (!mealPlan) {
      throw new Error("Create a meal plan for this week before adding manual shopping items.");
    }

    const shoppingList = await prisma.shoppingList.upsert({
      where: { mealPlanId: mealPlan.id },
      create: {
        householdId: activeHouseholdId,
        mealPlanId: mealPlan.id,
        createdById: context.userId,
        name: `Week of ${currentWeekStart.toISOString().slice(0, 10)}`,
      },
      update: {},
      select: { id: true },
    });

    const numericQuantity =
      typeof quantityValue === "string" && quantityValue.trim().length > 0 ? Number(quantityValue) : null;

    await prisma.shoppingListItem.create({
      data: {
        shoppingListId: shoppingList.id,
        ingredientName: ingredientName.trim(),
        quantity: numericQuantity !== null && Number.isFinite(numericQuantity) ? numericQuantity : null,
        unit: typeof unitValue === "string" && unitValue.trim().length > 0 ? unitValue.trim() : null,
        source: ShoppingItemSource.MANUAL,
      },
    });

    revalidatePath("/shopping-list");
  }

  const shoppingList = await getShoppingListForWeek(householdId, weekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Shopping list</h1>
        <p className="text-zinc-600">
          Week of {weekStart.toISOString().slice(0, 10)} to {weekEnd.toISOString().slice(0, 10)}.
        </p>
        <div className="flex gap-4 text-sm">
          <Link className="underline" href="/planner">
            Meal planner
          </Link>
          <Link className="underline" href="/recipes">
            Recipes
          </Link>
          <Link className="underline" href="/pantry">
            Pantry
          </Link>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">Generate list from meal plan</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Regenerate to refresh auto items from planned meals; manual items are preserved.
        </p>
        <form action={regenerateShoppingList} className="mt-4">
          <button className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
            Generate or refresh
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">Add manual item</h2>
        <form action={addManualItem} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input className="rounded-md border border-zinc-300 px-3 py-2 sm:col-span-2" name="ingredientName" placeholder="Item name" />
          <input className="rounded-md border border-zinc-300 px-3 py-2" min={0} name="quantity" placeholder="Qty" step="0.01" type="number" />
          <input className="rounded-md border border-zinc-300 px-3 py-2 sm:col-span-2" name="unit" placeholder="Unit (optional)" />
          <button className="w-fit rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium" type="submit">
            Add item
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Items</h2>
        {!shoppingList || shoppingList.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-zinc-600">
            No shopping items yet. Generate from your current week meal plan.
          </p>
        ) : (
          shoppingList.items.map((item) => {
            const nextStatus =
              item.status === ShoppingItemStatus.BOUGHT ? ShoppingItemStatus.PENDING : ShoppingItemStatus.BOUGHT;

            return (
              <article className="flex items-center justify-between rounded-xl border border-zinc-200 p-4" key={item.id}>
                <div>
                  <p className={`text-sm font-medium ${item.status === ShoppingItemStatus.BOUGHT ? "line-through text-zinc-400" : ""}`}>
                    {item.quantity ? `${item.quantity} ` : ""}
                    {item.unit ? `${item.unit} ` : ""}
                    {item.ingredientName}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{item.source}</p>
                </div>

                <form action={toggleItemStatus}>
                  <input name="itemId" type="hidden" value={item.id} />
                  <input name="nextStatus" type="hidden" value={nextStatus} />
                  <button className="text-sm font-medium underline" type="submit">
                    {item.status === ShoppingItemStatus.BOUGHT ? "Mark pending" : "Mark bought"}
                  </button>
                </form>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
