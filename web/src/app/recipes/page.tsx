import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAppAuthContext, resolveActiveHouseholdId } from "@/lib/auth-context";

export default async function RecipesPage() {
  const { userId, organizationId } = await requireAppAuthContext();
  const householdId = await resolveActiveHouseholdId(userId, organizationId);

  if (!householdId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Recipes</h1>
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

  async function createRecipe(formData: FormData) {
    "use server";

    const title = formData.get("title");
    const description = formData.get("description");

    if (typeof title !== "string" || title.trim().length === 0) {
      throw new Error("Recipe title is required.");
    }

    const context = await requireAppAuthContext();
    const activeHouseholdId = await resolveActiveHouseholdId(context.userId, context.organizationId);

    if (!activeHouseholdId) {
      throw new Error("No household found for this user.");
    }

    await prisma.recipe.create({
      data: {
        householdId: activeHouseholdId,
        createdById: context.userId,
        title: title.trim(),
        description: typeof description === "string" && description.trim().length > 0 ? description.trim() : null,
        ingredients: {
          create: [{ name: "New ingredient", position: 1 }],
        },
        steps: {
          create: [{ instruction: "Describe how to cook this recipe.", position: 1 }],
        },
      },
    });

    revalidatePath("/recipes");
  }

  const recipes = await prisma.recipe.findMany({
    where: { householdId },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      steps: { orderBy: { position: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Recipes</h1>
        <p className="text-zinc-600">Create and manage your household recipe collection.</p>
        <div className="flex gap-4 text-sm">
          <Link className="underline" href="/recipes/import">
            Import recipe
          </Link>
          <Link className="underline" href="/planner">
            Meal planner
          </Link>
          <Link className="underline" href="/">
            Home
          </Link>
        </div>
      </header>

      <section className="rounded-xl border border-zinc-200 p-5">
        <h2 className="text-lg font-semibold">Add recipe</h2>
        <form action={createRecipe} className="mt-4 flex flex-col gap-3">
          <input className="rounded-md border border-zinc-300 px-3 py-2" name="title" placeholder="Recipe title" />
          <textarea
            className="rounded-md border border-zinc-300 px-3 py-2"
            name="description"
            placeholder="Short description"
            rows={3}
          />
          <button className="w-fit rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
            Create recipe
          </button>
        </form>
      </section>

      <section className="space-y-3">
        {recipes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-5 text-zinc-600">No recipes yet.</p>
        ) : (
          recipes.map((recipe) => (
            <article className="rounded-xl border border-zinc-200 p-5" key={recipe.id}>
              <h3 className="text-lg font-semibold">{recipe.title}</h3>
              {recipe.description ? <p className="mt-1 text-sm text-zinc-600">{recipe.description}</p> : null}
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500">Ingredients</p>
              <ul className="mt-1 list-inside list-disc text-sm text-zinc-700">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.id}>
                    {ingredient.quantity ? `${ingredient.quantity} ` : ""}
                    {ingredient.unit ? `${ingredient.unit} ` : ""}
                    {ingredient.name}
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
