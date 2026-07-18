import { RecipeVisibility } from "@prisma/client";
import { Bookmark, CalendarPlus, Globe2, Pencil, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppPageShell } from "@/app/_components/page-shell";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { groupIngredientsByComponent } from "@/lib/ingredients";
import { prisma } from "@/lib/prisma";
import { getRecipeImageUrl } from "@/lib/recipe-display";

type PageProps = { params: Promise<{ recipeId: string }> };

export default async function RecipeDetailPage({ params }: PageProps) {
  const { recipeId } = await params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) return <main className="app-theme-page grid min-h-screen place-items-center p-6">No household is connected to this account.</main>;

  const [recipe, collections] = await Promise.all([
    prisma.recipe.findFirst({
      where: { id: recipeId, OR: [{ householdId: membership.householdId }, { visibility: RecipeVisibility.PUBLIC }] },
      include: {
        ingredients: { orderBy: { position: "asc" } },
        steps: { orderBy: { position: "asc" } },
        saves: { where: { userId }, select: { userId: true } },
        collectionItems: { where: { collection: { userId } }, select: { collectionId: true } },
      },
    }),
    prisma.recipeCollection.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);
  if (!recipe) notFound();
  const ownsRecipe = recipe.householdId === membership.householdId;
  const ingredientGroups = groupIngredientsByComponent(recipe.ingredients);

  async function toggleSave() {
    "use server";
    const context = await requireAppAuthContext();
    const existing = await prisma.savedRecipe.findUnique({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    if (existing) await prisma.savedRecipe.delete({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    else await prisma.savedRecipe.create({ data: { userId: context.userId, recipeId } });
    revalidatePath(`/recipes/${recipeId}`);
  }

  async function togglePublic() {
    "use server";
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const current = await prisma.recipe.findFirst({ where: { id: recipeId, householdId: activeMembership.householdId }, select: { visibility: true } });
    if (!current) throw new Error("Only the owning household can publish this recipe.");
    const visibility = current.visibility === RecipeVisibility.PUBLIC ? RecipeVisibility.PRIVATE : RecipeVisibility.PUBLIC;
    await prisma.recipe.update({ where: { id: recipeId }, data: { visibility, publishedAt: visibility === RecipeVisibility.PUBLIC ? new Date() : null } });
    revalidatePath(`/recipes/${recipeId}`);
  }

  async function addToCollection(formData: FormData) {
    "use server";
    const collectionId = String(formData.get("collectionId") ?? "");
    const context = await requireAppAuthContext();
    const collection = await prisma.recipeCollection.findFirst({ where: { id: collectionId, userId: context.userId }, select: { id: true, _count: { select: { items: true } } } });
    if (!collection) throw new Error("Choose one of your collections.");
    await prisma.recipeCollectionItem.upsert({ where: { collectionId_recipeId: { collectionId, recipeId } }, update: {}, create: { collectionId, recipeId, position: collection._count.items + 1 } });
    revalidatePath(`/recipes/${recipeId}`);
    redirect(`/recipes/${recipeId}`);
  }

  return (
    <AppPageShell
      currentPath="/recipes"
      title={<span className="recipe-title">{recipe.title}</span>}
      subtitle={recipe.description ?? "A household recipe ready for this week."}
      headerChildren={
        <div className="recipe-detail-actions">
          <Link className="app-theme-primary-button" href={`/planner?q=${encodeURIComponent(recipe.title)}`}><CalendarPlus size={17} /> Plan</Link>
          <form action={toggleSave}><button className="app-theme-secondary-button" type="submit"><Bookmark fill={recipe.saves.length ? "currentColor" : "none"} size={17} />{recipe.saves.length ? "Saved" : "Save recipe"}</button></form>
          {ownsRecipe ? <Link className="app-theme-secondary-button" href={`/recipes/${recipe.id}/edit`}><Pencil size={16} /> Edit</Link> : null}
        </div>
      }
      maxWidthClassName="max-w-6xl"
    >
      <section className="recipe-detail-hero">
        <Image alt="" height={360} priority src={getRecipeImageUrl(recipe)} width={720} />
        <div>
          <dl><div><dt>Servings</dt><dd>{recipe.servings}</dd></div><div><dt>Ingredients</dt><dd>{recipe.ingredients.length}</dd></div><div><dt>Steps</dt><dd>{recipe.steps.length}</dd></div></dl>
          <div className="recipe-detail-tags">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <div className="recipe-detail-management">
            {ownsRecipe ? <form action={togglePublic}><button className="app-theme-secondary-button" type="submit"><Globe2 size={16} />{recipe.visibility === RecipeVisibility.PUBLIC ? "Make household-only" : "Make public"}</button></form> : <p><Users size={16} /> Shared by another cook</p>}
            {collections.length ? <form action={addToCollection}><select aria-label="Collection" name="collectionId" required><option value="">Choose collection</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select><button type="submit">Add</button></form> : <Link href="/recipes?view=collections">Create a collection</Link>}
          </div>
        </div>
      </section>

      <div className="recipe-detail-body">
        <aside>
          <h2>Ingredients</h2>
          {ingredientGroups.map((group) => (
            <section key={group.component}>
              {ingredientGroups.length > 1 ? <h3>{group.component}</h3> : null}
              <ul>{group.ingredients.map((ingredient) => <li key={ingredient.id}><span>{ingredient.name}</span><strong>{ingredient.quantity ? `${ingredient.quantity} ` : ""}{ingredient.unit ?? ""}</strong></li>)}</ul>
            </section>
          ))}
        </aside>
        <section className="recipe-instructions">
          <ol>{recipe.steps.map((step) => <li key={step.id}><span>{step.position}</span><p>{step.instruction}</p></li>)}</ol>
        </section>
      </div>
    </AppPageShell>
  );
}
