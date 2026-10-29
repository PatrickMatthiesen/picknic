import { ShoppingItemSource, ShoppingItemStatus } from "@prisma/client";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAppAuthContext, resolveActiveHouseholdId } from "@/lib/auth-context";
import { addUtcDays, getDateKey, getWeekStartUtc, parseDateKey } from "@/lib/meal-plan";
import { prisma } from "@/lib/prisma";
import { generateShoppingListForWeek, getShoppingListForWeek, getStandaloneShoppingList } from "@/lib/shopping-list-service";
import { normalizeUnitInput } from "@/lib/units";
import { AppPageShell } from "@/app/_components/page-shell";
import "./shopping.css";

type PageProps = { searchParams: Promise<{ week?: string; saved?: string; list?: string }> };

export default async function ShoppingListPage({ searchParams }: PageProps) {
  const search = await searchParams;
  const { userId, organizationId } = await requireAppAuthContext();
  const householdId = await resolveActiveHouseholdId(userId, organizationId);

  if (!householdId) {
    return (
      <main className="app-theme-page px-6 py-12">
        <section className="app-theme-card mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 rounded-lg p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Shopping list</h1>
          <p className="app-theme-muted">
            Your account is authenticated, but no household was found yet. Complete organization setup in WorkOS and sign
            in again.
          </p>
          <Link className="app-theme-link w-fit rounded-lg px-4 py-2 text-sm font-medium" href="/">
            Back home
          </Link>
        </section>
      </main>
    );
  }

  const weekStart = getWeekStartUtc(parseDateKey(search.week) ?? new Date());
  const weekKey = getDateKey(weekStart);
  const standaloneMode = search.list === "standalone";
  const listHref = standaloneMode ? "/shopping-list?list=standalone" : `/shopping-list?week=${weekKey}`;

  async function updateItem(formData: FormData) {
    "use server";
    const itemId = formData.get("itemId");
    const ingredientName = formData.get("ingredientName");
    const quantityValue = formData.get("quantity");
    const unitValue = formData.get("unit");
    if (typeof itemId !== "string" || typeof ingredientName !== "string" || !ingredientName.trim()) throw new Error("Item name is required.");
    const quantity = typeof quantityValue === "string" && quantityValue.trim() ? Number(quantityValue) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) throw new Error("Quantity must be zero or greater.");
    const context = await requireAppAuthContext();
    const activeHouseholdId = await resolveActiveHouseholdId(context.userId, context.organizationId);
    if (!activeHouseholdId) throw new Error("No household found for this user.");
    const normalizedUnit = normalizeUnitInput(typeof unitValue === "string" ? unitValue : null);
    await prisma.shoppingListItem.updateMany({
      where: { id: itemId, shoppingList: { householdId: activeHouseholdId } },
      data: { ingredientName: ingredientName.trim(), quantity, unit: normalizedUnit.unit, unitId: normalizedUnit.unitId },
    });
    revalidatePath("/shopping-list");
    redirect(`${listHref}&saved=updated`);
  }

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
    redirect(`${listHref}&saved=refreshed`);
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
    redirect(`${listHref}&saved=updated`);
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
      where: { householdId_weekStart: { householdId: activeHouseholdId, weekStart: selectedWeekStart } },
      select: { id: true },
    });
    const existingList = standaloneMode
      ? await prisma.shoppingList.findFirst({ where: { householdId: activeHouseholdId, mealPlanId: null }, select: { id: true } })
      : mealPlan
      ? await prisma.shoppingList.findUnique({ where: { mealPlanId: mealPlan.id }, select: { id: true } })
      : await prisma.shoppingList.findFirst({ where: { householdId: activeHouseholdId, mealPlanId: null }, select: { id: true } });
    const shoppingList = existingList ?? await prisma.shoppingList.create({
      data: {
        householdId: activeHouseholdId,
        mealPlanId: standaloneMode ? null : mealPlan?.id ?? null,
        createdById: context.userId,
        name: !standaloneMode && mealPlan ? `Week of ${selectedWeekStart.toISOString().slice(0, 10)}` : "Shopping list",
      },
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
    redirect(`${listHref}&saved=added`);
  }

  const shoppingList = standaloneMode ? await getStandaloneShoppingList(householdId) : await getShoppingListForWeek(householdId, weekStart);
  const categories = ["Produce", "Dairy & chilled", "Meat & fish", "Bakery", "Pantry", "Other"];
  const categoryFor = (name: string) => {
    const value = name.toLowerCase();
    if (/tomato|onion|garlic|pepper|potato|carrot|lettuce|spinach|herb|apple|lemon|lime|vegetable|fruit|cucumber|avocado/.test(value)) return "Produce";
    if (/milk|cheese|yogurt|butter|cream|egg/.test(value)) return "Dairy & chilled";
    if (/chicken|beef|pork|fish|salmon|tofu|sausage|turkey/.test(value)) return "Meat & fish";
    if (/bread|bun|roll|baguette|tortilla/.test(value)) return "Bakery";
    if (/rice|pasta|flour|sugar|oil|bean|lentil|stock|spice|salt|sauce|vinegar|canned/.test(value)) return "Pantry";
    return "Other";
  };
  const groupedItems = categories.map((category) => ({ category, items: (shoppingList?.items ?? []).filter((item) => categoryFor(item.ingredientName) === category) })).filter((group) => group.items.length);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return (
    <AppPageShell
      currentPath="/shopping-list"
      title="Shopping list"
      subtitle={standaloneMode ? "An independent list for anything you need." : `Week of ${weekKey} to ${getDateKey(weekEnd)}.`}
      headerChildren={
        <div className="week-controls">
          <Link aria-label="Previous week" href={`/shopping-list?week=${getDateKey(addUtcDays(weekStart, -7))}`}><ChevronLeft size={18} /></Link>
          <Link className="today-link" href="/shopping-list"><CalendarDays size={17} /> Today</Link>
          <Link aria-label="Next week" href={`/shopping-list?week=${getDateKey(addUtcDays(weekStart, 7))}`}><ChevronRight size={18} /></Link>
          <Link className="today-link" href={`/planner?week=${weekKey}`}>View meal plan</Link>
          <Link aria-current={standaloneMode ? "page" : undefined} className="today-link" href="/shopping-list?list=standalone">Standalone list</Link>
          <Link aria-current={!standaloneMode ? "page" : undefined} className="today-link" href={`/shopping-list?week=${weekKey}`}>Weekly list</Link>
        </div>
      }
    >
      {!standaloneMode && shoppingList?.isStale ? (
        <p className="shopping-plan-notice" role="status">
          Your meal plan may have changed since this list was generated. Refresh to update quantities;
          checked items and manual additions are preserved.
        </p>
      ) : null}
      {search.saved ? <p className="shopping-plan-notice" role="status">{search.saved === "added" ? "Item added to the list." : search.saved === "updated" ? "Item updated." : "Shopping list refreshed."}</p> : null}
      <section className="app-theme-card shopping-tools rounded-lg p-3">
        <form action={addManualItem} className="shopping-add-row">
          <label className="sr-only" htmlFor="new-item">Add item</label>
          <input className="app-theme-input rounded-lg px-3 py-2" id="new-item" name="ingredientName" placeholder="Add an item" required />
          <label className="sr-only" htmlFor="new-quantity">Quantity</label>
          <input className="app-theme-input rounded-lg px-3 py-2" id="new-quantity" min={0} name="quantity" placeholder="Qty" step="0.01" type="number" />
          <label className="sr-only" htmlFor="new-unit">Unit</label>
          <input className="app-theme-input rounded-lg px-3 py-2" id="new-unit" name="unit" placeholder="Unit" />
          <button className="app-theme-secondary-button rounded-lg px-4 py-2 text-sm font-medium" type="submit">Add</button>
        </form>
        <form action={regenerateShoppingList} className="shopping-refresh-row">
          {!standaloneMode ? <span className="app-theme-muted text-sm">Refresh planned recipe quantities. Bought and manual items stay.</span> : <span className="app-theme-muted text-sm">Items here are independent of the weekly plan.</span>}
          {!standaloneMode ? (
          <button className="app-theme-primary-button rounded-lg px-4 py-2 text-sm font-medium" type="submit">Generate or refresh</button>
          ) : null}
        </form>
      </section>

      <section className="space-y-3">
          <h2 className="text-lg font-semibold">Items</h2>
          {!shoppingList || shoppingList.items.length === 0 ? (
            <p className="app-theme-card app-theme-muted rounded-lg border-dashed p-5">
              No shopping items yet. Add something here or generate from the selected week’s meal plan.
            </p>
          ) : (
            groupedItems.map(({ category, items }) => <section className="shopping-category" key={category}><h3>{category}</h3>{items.map((item) => {
              const nextStatus =
                item.status === ShoppingItemStatus.BOUGHT ? ShoppingItemStatus.PENDING : ShoppingItemStatus.BOUGHT;

              return (
                <article className="app-theme-card shopping-row rounded-lg p-3" key={item.id}>
                  <form action={updateItem} className="shopping-edit-row">
                    <input name="itemId" type="hidden" value={item.id} />
                    <label className="sr-only" htmlFor={`name-${item.id}`}>Item name</label>
                    <input className="app-theme-input rounded-md px-2 py-2 text-sm" id={`name-${item.id}`} name="ingredientName" defaultValue={item.ingredientName} />
                    <label className="sr-only" htmlFor={`qty-${item.id}`}>Quantity</label>
                    <input className="app-theme-input rounded-md px-2 py-2 text-sm" id={`qty-${item.id}`} name="quantity" type="number" min="0" step="0.01" placeholder="Qty" defaultValue={item.quantity?.toString() ?? ""} />
                    <label className="sr-only" htmlFor={`unit-${item.id}`}>Unit</label>
                    <input className="app-theme-input rounded-md px-2 py-2 text-sm" id={`unit-${item.id}`} name="unit" placeholder="Unit" defaultValue={item.unit ?? ""} />
                    <button className="app-theme-secondary-button rounded-md px-3 py-2 text-sm" type="submit">Save</button>
                  </form>
                  <div className="shopping-row-meta"><span>{item.source === ShoppingItemSource.AUTO ? `From recipe${item.recipeId ? "" : "s"}` : "Added manually"}</span><span>{item.status === ShoppingItemStatus.BOUGHT ? "Bought" : item.status === ShoppingItemStatus.SKIPPED ? "Skipped" : "To buy"}</span></div>
                  <form action={toggleItemStatus}>
                    <input name="itemId" type="hidden" value={item.id} />
                    <input name="nextStatus" type="hidden" value={nextStatus} />
                    <button className="app-theme-secondary-button rounded-md px-3 py-2 text-sm font-medium" type="submit">
                      {item.status === ShoppingItemStatus.BOUGHT ? "Mark pending" : "Mark bought"}
                    </button>
                  </form>
                </article>
              );
            })}</section>)
          )}
      </section>
    </AppPageShell>
  );
}
