import { ShoppingItemSource, ShoppingItemStatus } from "@prisma/client";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { revalidatePath } from "next/cache";
import { requireAppAuthContext, resolveActiveHouseholdId } from "@/lib/auth-context";
import { addUtcDays, getDateKey, getWeekStartUtc, parseDateKey } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { generateShoppingListForWeek, getShoppingListForWeek } from "@/lib/shopping-list-service";
import { normalizeUnitInput } from "@/lib/units";
import { AppPageShell } from "@/app/_components/page-shell";

type PageProps = { searchParams: Promise<{ week?: string }> };

export default async function ShoppingListPage({ searchParams }: PageProps) {
  const search = await searchParams;
  const { userId, organizationId } = await requireAppAuthContext();
  const householdId = await resolveActiveHouseholdId(userId, organizationId);

  if (!householdId) {
    return (
      <main className="app-theme-page px-6 py-12">
        <section className="app-theme-card mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 rounded-3xl p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Shopping list</h1>
          <p className="app-theme-muted">
            Your account is authenticated, but no household was found yet. Complete organization setup in WorkOS and sign
            in again.
          </p>
          <Link className="app-theme-link w-fit rounded-full px-4 py-2 text-sm font-medium" href="/">
            Back home
          </Link>
        </section>
      </main>
    );
  }

  const weekStart = getWeekStartUtc(parseDateKey(search.week) ?? new Date());
  const weekKey = getDateKey(weekStart);

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
      weekStart: new Date(`${weekKey}T00:00:00.000Z`),
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

    const selectedWeekStart = new Date(`${weekKey}T00:00:00.000Z`);
    const mealPlan = await prisma.mealPlan.findUnique({
      where: {
        householdId_weekStart: {
          householdId: activeHouseholdId,
          weekStart: selectedWeekStart,
        },
      },
      select: { id: true },
    });

    if (!mealPlan) {
      throw new Error("Create a meal plan for the selected week before adding manual shopping items.");
    }

    const shoppingList = await prisma.shoppingList.upsert({
      where: { mealPlanId: mealPlan.id },
      create: {
        householdId: activeHouseholdId,
        mealPlanId: mealPlan.id,
        createdById: context.userId,
        name: `Week of ${selectedWeekStart.toISOString().slice(0, 10)}`,
      },
      update: {},
      select: { id: true },
    });

    const numericQuantity =
      typeof quantityValue === "string" && quantityValue.trim().length > 0 ? Number(quantityValue) : null;
    const normalizedUnit = normalizeUnitInput(typeof unitValue === "string" ? unitValue : null);

    await prisma.shoppingListItem.create({
      data: {
        shoppingListId: shoppingList.id,
        ingredientName: ingredientName.trim(),
        quantity: numericQuantity !== null && Number.isFinite(numericQuantity) ? numericQuantity : null,
        unit: normalizedUnit.unit,
        unitId: normalizedUnit.unitId,
        source: ShoppingItemSource.MANUAL,
      },
    });

    revalidatePath("/shopping-list");
  }

  const shoppingList = await getShoppingListForWeek(householdId, weekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return (
    <AppPageShell
      currentPath="/shopping-list"
      title="Shopping list"
      subtitle={`Week of ${weekKey} to ${getDateKey(weekEnd)}.`}
      headerChildren={
        <div className="week-controls">
          <Link aria-label="Previous week" href={`/shopping-list?week=${getDateKey(addUtcDays(weekStart, -7))}`}><ChevronLeft size={18} /></Link>
          <Link className="today-link" href="/shopping-list"><CalendarDays size={17} /> Today</Link>
          <Link aria-label="Next week" href={`/shopping-list?week=${getDateKey(addUtcDays(weekStart, 7))}`}><ChevronRight size={18} /></Link>
          <Link className="today-link" href={`/planner?week=${weekKey}`}>View meal plan</Link>
        </div>
      }
    >
      <section className="app-theme-card rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Generate list from meal plan</h2>
          <p className="app-theme-muted mt-2 text-sm">
            Refresh quantities from planned meals. Existing items keep their checked status, and manual items are preserved.
          </p>
          <form action={regenerateShoppingList} className="mt-4">
            <button className="app-theme-primary-button rounded-2xl px-5 py-2 text-sm font-medium" type="submit">
              Generate or refresh
            </button>
          </form>
      </section>

      <section className="app-theme-card rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Add manual item</h2>
          <form action={addManualItem} className="mt-4 grid gap-3 sm:grid-cols-3">
            <input className="app-theme-input rounded-xl px-3 py-2 sm:col-span-2" name="ingredientName" placeholder="Item name" />
            <input className="app-theme-input rounded-xl px-3 py-2" min={0} name="quantity" placeholder="Qty" step="0.01" type="number" />
            <input className="app-theme-input rounded-xl px-3 py-2 sm:col-span-2" name="unit" placeholder="Unit (optional)" />
            <button className="app-theme-secondary-button w-fit rounded-2xl px-5 py-2 text-sm font-medium" type="submit">
              Add item
            </button>
          </form>
      </section>

      <section className="space-y-3">
          <h2 className="text-lg font-semibold">Items</h2>
          {!shoppingList || shoppingList.items.length === 0 ? (
            <p className="app-theme-card app-theme-muted rounded-3xl border-dashed p-5">
              No shopping items yet. Generate from the selected week’s meal plan.
            </p>
          ) : (
            shoppingList.items.map((item) => {
              const nextStatus =
                item.status === ShoppingItemStatus.BOUGHT ? ShoppingItemStatus.PENDING : ShoppingItemStatus.BOUGHT;

              return (
                <article className="app-theme-card flex items-center justify-between rounded-3xl p-4" key={item.id}>
                  <div>
                    <p className={`text-sm font-medium ${item.status === ShoppingItemStatus.BOUGHT ? "line-through app-theme-muted" : ""}`}>
                      {item.quantity ? `${item.quantity} ` : ""}
                      {item.unit ? `${item.unit} ` : ""}
                      {item.ingredientName}
                    </p>
                    <p className="app-theme-muted text-xs uppercase tracking-wide">{item.source}</p>
                  </div>

                  <form action={toggleItemStatus}>
                    <input name="itemId" type="hidden" value={item.id} />
                    <input name="nextStatus" type="hidden" value={nextStatus} />
                    <button className="app-theme-secondary-button rounded-full px-4 py-2 text-sm font-medium" type="submit">
                      {item.status === ShoppingItemStatus.BOUGHT ? "Mark pending" : "Mark bought"}
                    </button>
                  </form>
                </article>
              );
            })
          )}
      </section>
    </AppPageShell>
  );
}
