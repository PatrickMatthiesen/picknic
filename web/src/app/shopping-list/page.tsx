import { ShoppingItemSource, ShoppingItemStatus } from "@prisma/client";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, ShoppingBasket } from "lucide-react";
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
  const weeklyHref = `/shopping-list?week=${weekKey}`;
  const standaloneHref = `${weeklyHref}&list=standalone`;
  const listHref = standaloneMode ? standaloneHref : weeklyHref;

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
    const existing = await prisma.shoppingListItem.findFirst({
      where: { id: itemId, shoppingList: { householdId: activeHouseholdId } },
      select: { unitId: true },
    });
    if (!existing) throw new Error("Shopping item not found in this household.");
    const normalizedUnit = normalizeUnitInput(typeof unitValue === "string" ? unitValue : null, "metric", existing.unitId);
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
    const destination = standaloneMode || !mealPlan ? standaloneHref : listHref;
    redirect(`${destination}&saved=added`);
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
  const weekEnd = addUtcDays(weekStart, 6);
  const weekLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).formatRange(weekStart, weekEnd);
  const items = shoppingList?.items ?? [];
  const remaining = items.filter((item) => item.status === ShoppingItemStatus.PENDING).length;
  const bought = items.filter((item) => item.status === ShoppingItemStatus.BOUGHT).length;
  const planExists = !standaloneMode && Boolean(shoppingList || await prisma.mealPlan.findUnique({
    where: { householdId_weekStart: { householdId, weekStart } },
    select: { id: true },
  }));
  const hasStalePlan = !standaloneMode && Boolean(shoppingList?.isStale);
  const planHref = `/planner?week=${weekKey}`;

  return (
    <AppPageShell
      currentPath="/shopping-list"
      title="Shopping list"
      maxWidthClassName="max-w-5xl"
      headerChildren={
        <nav className="shopping-modes" aria-label="Shopping list type">
          <Link aria-current={!standaloneMode ? "page" : undefined} href={weeklyHref}>Weekly</Link>
          <Link aria-current={standaloneMode ? "page" : undefined} href={standaloneHref}>Standalone</Link>
        </nav>
      }
    >
      {!standaloneMode && (
        <div className="shopping-context">
          <div className="shopping-week">
            <CalendarDays aria-hidden="true" size={17} />
            <span>{weekLabel}</span>
            <nav aria-label="Shopping week">
              <Link aria-label="Previous week" href={`/shopping-list?week=${getDateKey(addUtcDays(weekStart, -7))}`}><ChevronLeft aria-hidden="true" size={19} /></Link>
              <Link className="shopping-current-week" href="/shopping-list">This week</Link>
              <Link aria-label="Next week" href={`/shopping-list?week=${getDateKey(addUtcDays(weekStart, 7))}`}><ChevronRight aria-hidden="true" size={19} /></Link>
            </nav>
          </div>
          <Link className="shopping-text-action" href={planHref}>Meal plan <ArrowUpRight aria-hidden="true" size={16} /></Link>
        </div>
      )}
      {search.saved && <p className="shopping-feedback" role="status">{search.saved === "added" ? "Item added." : search.saved === "updated" ? "Item updated." : "List refreshed from your meal plan."}</p>}
      <section className="shopping-checklist" aria-labelledby="shopping-checklist-title">
        <header className="shopping-checklist-heading">
          <div>
            <h2 id="shopping-checklist-title">Groceries</h2>
            {items.length > 0 && <p role="status" className="app-theme-muted">{remaining} to buy{bought > 0 ? ` · ${bought} bought` : ""}</p>}
          </div>
          <details className="shopping-add">
            <summary className={`${standaloneMode && !items.length ? "app-theme-primary-button" : "app-theme-secondary-button"} shopping-action`}><Plus aria-hidden="true" size={18} /> Add item</summary>
            <form action={addManualItem} className="shopping-item-fields">
              <label>Item<input className="app-theme-input" name="ingredientName" placeholder="e.g. Apples" required /></label>
              <label>Quantity<input className="app-theme-input" min={0} name="quantity" step="0.01" type="number" /></label>
              <label>Unit<input className="app-theme-input" name="unit" placeholder="e.g. kg" /></label>
              <button className="app-theme-primary-button shopping-action" type="submit">Add to list</button>
              {!standaloneMode && !planExists && <p className="app-theme-muted">Until you plan this week, new items go to the standalone list.</p>}
            </form>
          </details>
        </header>

        {hasStalePlan && (
          <div className="shopping-refresh-inline">
            <p className="app-theme-muted" role="status">Meal plan changed. Refresh to update quantities.</p>
            <form action={regenerateShoppingList}>
              <button className="shopping-text-action" type="submit"><RefreshCw aria-hidden="true" size={15} /> Refresh list</button>
            </form>
          </div>
        )}

        {items.length === 0 ? (
          <div className="shopping-empty">
            <ShoppingBasket aria-hidden="true" size={24} />
            <h3>Your list is empty</h3>
            <p>{standaloneMode ? "Add the first thing you need." : planExists ? "Add an item or bring in groceries from the week’s meals." : "Plan a meal to generate a weekly list, or add items to the standalone list."}</p>
            {planExists && !hasStalePlan && (
              <form action={regenerateShoppingList}>
                <button className="app-theme-primary-button shopping-action" type="submit">{shoppingList ? "Refresh from plan" : "Generate from plan"}</button>
              </form>
            )}
            {!standaloneMode && !planExists && <Link className="app-theme-primary-button shopping-action" href={planHref}>Plan meals</Link>}
          </div>
        ) : (
          groupedItems.map(({ category, items }) => (
            <section className="shopping-category" key={category}>
              <h3>{category}</h3>
              <ul>
                {items.map((item) => {
                  const checked = item.status === ShoppingItemStatus.BOUGHT;
                  const skipped = item.status === ShoppingItemStatus.SKIPPED;
                  const nextStatus = checked ? ShoppingItemStatus.PENDING : ShoppingItemStatus.BOUGHT;
                  const amount = [item.quantity?.toString(), item.unit].filter(Boolean).join(" ");

                  return (
                    <li className="shopping-row" data-status={item.status} key={item.id}>
                      <form action={toggleItemStatus} className="shopping-toggle-form">
                        <input name="itemId" type="hidden" value={item.id} />
                        <input name="nextStatus" type="hidden" value={nextStatus} />
                        <button
                          aria-describedby={`source-${item.id}`}
                          aria-label={`Mark ${item.ingredientName}${amount ? `, ${amount},` : ""} bought`}
                          aria-pressed={checked}
                          className="shopping-item-toggle"
                          type="submit"
                        >
                          <span aria-hidden="true" className="shopping-checkbox">{checked && <Check size={16} strokeWidth={2.6} />}</span>
                          <span className="shopping-item-name">
                            <span>{item.ingredientName}</span>
                            <small id={`source-${item.id}`}>{item.source === ShoppingItemSource.AUTO ? `From recipe${item.recipeId ? "" : "s"}` : "Added manually"}{skipped ? " · Skipped" : ""}</small>
                          </span>
                          {amount && <span className="shopping-item-amount">{amount}</span>}
                        </button>
                      </form>
                      <details className="shopping-edit">
                        <summary aria-label={`Edit ${item.ingredientName}`} title={`Edit ${item.ingredientName}`}><Pencil aria-hidden="true" size={16} /><span className="sr-only">Edit</span></summary>
                        <form action={updateItem} className="shopping-item-fields">
                          <input name="itemId" type="hidden" value={item.id} />
                          <label>Item<input className="app-theme-input" name="ingredientName" defaultValue={item.ingredientName} required /></label>
                          <label>Quantity<input className="app-theme-input" defaultValue={item.quantity?.toString() ?? ""} name="quantity" type="number" min="0" step="0.01" /></label>
                          <label>Unit<input className="app-theme-input" name="unit" defaultValue={item.unit ?? ""} /></label>
                          <button className="app-theme-secondary-button shopping-action" type="submit">Save item</button>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        {items.length > 0 && planExists && !hasStalePlan && (
          <form action={regenerateShoppingList} className="shopping-refresh">
            <button className="shopping-text-action" type="submit"><RefreshCw aria-hidden="true" size={15} /> Refresh from plan</button>
          </form>
        )}
      </section>
    </AppPageShell>
  );
}
