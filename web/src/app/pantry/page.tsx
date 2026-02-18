import { MembershipRole } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export default async function PantryPage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  const householdId = membership?.householdId ?? null;

  if (!householdId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Pantry</h1>
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

  async function addOrUpdatePantryItem(formData: FormData) {
    "use server";

    const ingredientName = formData.get("ingredientName");
    const quantityValue = formData.get("quantity");
    const unitValue = formData.get("unit");

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

    await prisma.pantryItem.upsert({
      where: {
        householdId_ingredientName_unit: {
          householdId: activeMembership.householdId,
          ingredientName: ingredientName.trim(),
          unit: unitValue.trim(),
        },
      },
      update: {
        quantity,
        userId: context.userId,
      },
      create: {
        householdId: activeMembership.householdId,
        userId: context.userId,
        ingredientName: ingredientName.trim(),
        quantity,
        unit: unitValue.trim(),
      },
    });

    revalidatePath("/pantry");
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
  }

  const items = await prisma.pantryItem.findMany({
    where: { householdId },
    orderBy: [{ ingredientName: "asc" }, { unit: "asc" }],
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Pantry</h1>
        <p className="text-zinc-600">Manage on-hand ingredients used to reduce generated shopping lists.</p>
        <div className="flex gap-4 text-sm">
          <Link className="underline" href="/shopping-list">
            Shopping list
          </Link>
          <Link className="underline" href="/planner">
            Meal planner
          </Link>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">Add or update pantry item</h2>
        <form action={addOrUpdatePantryItem} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input className="rounded-md border border-zinc-300 px-3 py-2 sm:col-span-2" name="ingredientName" placeholder="Ingredient name" />
          <input className="rounded-md border border-zinc-300 px-3 py-2" min={0} name="quantity" step="0.01" type="number" />
          <input className="rounded-md border border-zinc-300 px-3 py-2 sm:col-span-2" name="unit" placeholder="Unit (e.g., g, cup, each)" />
          <button className="w-fit rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
            Save pantry item
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Current pantry items</h2>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-zinc-600">No pantry items yet.</p>
        ) : (
          items.map((item) => (
            <article className="rounded-xl border border-zinc-200 p-4" key={item.id}>
              <p className="text-sm font-medium">{item.ingredientName}</p>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{item.unit}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <form action={updateQuantity} className="flex items-center gap-2">
                  <input name="itemId" type="hidden" value={item.id} />
                  <input
                    className="w-28 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    defaultValue={item.quantity.toString()}
                    min={0}
                    name="quantity"
                    step="0.01"
                    type="number"
                  />
                  <button className="text-sm font-medium underline" type="submit">
                    Update qty
                  </button>
                </form>

                {membership?.role === MembershipRole.OWNER ? (
                  <form action={removePantryItem}>
                    <input name="itemId" type="hidden" value={item.id} />
                    <button className="text-sm font-medium underline" type="submit">
                      Remove
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
