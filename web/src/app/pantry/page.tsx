import { MembershipRole } from "@prisma/client";
import { ChevronDown, Plus, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { AppPageShell } from "@/app/_components/page-shell";
import { getUnitStorageKey, normalizeUnitInput } from "@/lib/units";
import { PantrySaveButton } from "./pantry-save-button";

export default async function PantryPage({ searchParams }: { searchParams: Promise<{ view?: string; saved?: string }> }) {
  const search = await searchParams;
  const savedPath = search.view === "soon" ? "/pantry?view=soon&saved=1" : "/pantry?saved=1";
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  const householdId = membership?.householdId ?? null;

  if (!householdId) {
    return (
      <main className="app-theme-page px-6 py-12">
        <section className="app-theme-card mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 rounded-lg p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Pantry</h1>
          <p className="app-theme-muted">
            Your account is authenticated, but no household was found yet. Open Household to manage your membership.
          </p>
          <Link className="app-theme-link w-fit rounded-lg px-4 py-2 text-sm font-medium" href="/">
            Back home
          </Link>
        </section>
      </main>
    );
  }

  async function addOrUpdatePantryItem(formData: FormData) {
    "use server";

    const ingredientName = formData.get("ingredientName");
    const quantityValue = formData.get("quantity");
    const unitValue = formData.get("unit");
    const expiryValue = formData.get("expiresAt");

    if (typeof ingredientName !== "string" || ingredientName.trim().length === 0) {
      throw new Error("Ingredient name is required.");
    }
    if (typeof unitValue !== "string" || unitValue.trim().length === 0) {
      throw new Error("Unit is required.");
    }

    const quantity = typeof quantityValue === "string" ? Number(quantityValue) : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Quantity must be a positive number.");
    }

    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) {
      throw new Error("No household found for this user.");
    }

    const normalizedUnit = normalizeUnitInput(unitValue);
    const storedUnit = normalizedUnit.unit ?? unitValue.trim();
    const expiresAt = typeof expiryValue === "string" && expiryValue ? new Date(`${expiryValue}T00:00:00.000Z`) : null;

    await prisma.pantryItem.upsert({
      where: {
        householdId_ingredientName_unitKey: {
          householdId: activeMembership.householdId,
          ingredientName: ingredientName.trim(),
          unitKey: getUnitStorageKey(storedUnit, normalizedUnit.unitId),
        },
      },
      update: {
        quantity,
        userId: context.userId,
        unitId: normalizedUnit.unitId,
        unitKey: getUnitStorageKey(storedUnit, normalizedUnit.unitId),
        expiresAt,
      },
      create: {
        householdId: activeMembership.householdId,
        userId: context.userId,
        ingredientName: ingredientName.trim(),
        quantity,
        unit: storedUnit,
        unitId: normalizedUnit.unitId,
        unitKey: getUnitStorageKey(storedUnit, normalizedUnit.unitId),
        expiresAt,
      },
    });

    revalidatePath("/pantry");
    redirect(savedPath);
  }

  async function updateQuantity(formData: FormData) {
    "use server";

    const itemId = formData.get("itemId");
    const quantityValue = formData.get("quantity");

    if (typeof itemId !== "string" || itemId.length === 0) {
      throw new Error("Pantry item id is required.");
    }

    const quantity = typeof quantityValue === "string" ? Number(quantityValue) : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Quantity must be a positive number.");
    }

    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) {
      throw new Error("No household found for this user.");
    }

    await prisma.pantryItem.updateMany({
      where: { id: itemId, householdId: activeMembership.householdId },
      data: {
        quantity,
        userId: context.userId,
      },
    });

    revalidatePath("/pantry");
    redirect(savedPath);
  }

  async function updateExpiry(formData: FormData) {
    "use server";
    const itemId = formData.get("itemId");
    const expiresValue = formData.get("expiresAt");
    if (typeof itemId !== "string") throw new Error("Pantry item id is required.");
    const expiresAt = typeof expiresValue === "string" && expiresValue ? new Date(`${expiresValue}T00:00:00.000Z`) : null;
    if (expiresAt && Number.isNaN(expiresAt.valueOf())) throw new Error("Enter a valid use-by date.");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household found for this user.");
    await prisma.pantryItem.updateMany({ where: { id: itemId, householdId: activeMembership.householdId }, data: { expiresAt } });
    revalidatePath("/pantry");
    redirect(savedPath);
  }

  async function removePantryItem(formData: FormData) {
    "use server";

    const itemId = formData.get("itemId");
    if (typeof itemId !== "string" || itemId.length === 0) {
      throw new Error("Pantry item id is required.");
    }

    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) {
      throw new Error("No household found for this user.");
    }
    if (activeMembership.role !== MembershipRole.OWNER) {
      throw new Error("Only household owners can remove pantry items.");
    }

    await prisma.pantryItem.deleteMany({
      where: { id: itemId, householdId: activeMembership.householdId },
    });

    revalidatePath("/pantry");
    redirect(savedPath);
  }

  const items = await prisma.pantryItem.findMany({
    where: { householdId },
    orderBy: [{ ingredientName: "asc" }, { unit: "asc" }],
  });
  const useSoonCutoff = new Date();
  useSoonCutoff.setUTCDate(useSoonCutoff.getUTCDate() + 7);

  const visibleItems = search.view === "soon" ? items.filter(item => item.expiresAt && item.expiresAt <= useSoonCutoff).sort((a,b) => a.expiresAt!.getTime() - b.expiresAt!.getTime()) : items;

  return (
    <AppPageShell
      currentPath="/pantry"
      title="Pantry"
    >
      {search.saved ? <p role="status" className="app-theme-muted">Pantry updated.</p> : null}
      <section className="pantry-working-list" aria-labelledby="pantry-stock-title">
        <header className="pantry-stock-header">
          <h2 id="pantry-stock-title">On hand</h2>
          <nav className="recipe-tabs" aria-label="Pantry view">
            <Link aria-current={search.view !== "soon" ? "page" : undefined} className={search.view !== "soon" ? "is-active" : undefined} href="/pantry">All items</Link>
            <Link aria-current={search.view === "soon" ? "page" : undefined} className={search.view === "soon" ? "is-active" : undefined} href="/pantry?view=soon">Use soon</Link>
          </nav>
        </header>
        {visibleItems.length === 0 && (
          <p className="app-theme-muted pantry-empty">{search.view === "soon" ? "Nothing is due to be used in the next seven days." : "Your pantry is empty. Add an ingredient to start."}</p>
        )}
        <details className="pantry-add">
          <summary className="app-theme-primary-button">
            <span className="pantry-add-open"><Plus size={16} aria-hidden="true" /> Add item</span>
            <span className="pantry-add-close"><X size={16} aria-hidden="true" /> Close form</span>
          </summary>
          <form action={addOrUpdatePantryItem} className="pantry-add-fields">
            <label>Ingredient<input className="app-theme-input" required name="ingredientName" placeholder="e.g. Tomatoes" /></label>
            <label>Quantity<input className="app-theme-input" min={0.01} required name="quantity" step="0.01" type="number" /></label>
            <label>Unit<input className="app-theme-input" name="unit" required placeholder="e.g. g or each" /></label>
            <label><span>Use by <small>Optional</small></span><input className="app-theme-input" name="expiresAt" type="date" /></label>
            <PantrySaveButton />
          </form>
        </details>
        {visibleItems.map((item) => (
              <article className="pantry-working-row" key={item.id}>
                <div className="pantry-item-summary">
                  <p className="text-sm font-medium">{item.ingredientName}</p>
                  <p className="app-theme-muted text-sm">{item.quantity.toString()} {item.unit}</p>
                  {item.expiresAt ? <p className="app-theme-muted text-xs">{item.expiresAt <= useSoonCutoff ? "Use soon · " : "Use by "}{item.expiresAt.toLocaleDateString()}</p> : null}
                </div>

                <details className="pantry-row-edit">
                  <summary>Edit<span className="sr-only"> {item.ingredientName}</span><ChevronDown size={14} aria-hidden="true" /></summary>
                  <div className="pantry-edit-fields">
                    <form action={updateQuantity}>
                      <input name="itemId" type="hidden" value={item.id} />
                      <label>Quantity
                        <input className="app-theme-input pantry-edit-quantity" defaultValue={item.quantity.toString()} min={0} name="quantity" step="0.01" type="number" />
                      </label>
                      <button className="app-theme-secondary-button" type="submit">Update qty</button>
                    </form>
                    <form action={updateExpiry}>
                      <input name="itemId" type="hidden" value={item.id} />
                      <label>Use by
                        <input className="app-theme-input" name="expiresAt" type="date" defaultValue={item.expiresAt?.toISOString().slice(0, 10) ?? ""} />
                      </label>
                      <button className="app-theme-secondary-button" type="submit">Save date</button>
                    </form>

                    {membership?.role === MembershipRole.OWNER ? (
                      <form action={removePantryItem}>
                        <input name="itemId" type="hidden" value={item.id} />
                        <button className="app-theme-secondary-button" type="submit">Remove</button>
                      </form>
                    ) : null}
                  </div>
                </details>
              </article>
        ))}
      </section>
    </AppPageShell>
  );
}
