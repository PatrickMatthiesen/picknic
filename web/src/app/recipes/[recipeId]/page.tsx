import { RecipeVisibility } from "@prisma/client";
import { BellRing, Bookmark, CalendarPlus, Clock3, CopyPlus, Globe2, Pencil, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppPageShell } from "@/app/_components/page-shell";
import { RecipeImage } from "@/app/_components/recipe-image";
import { RecipeIngredientsClient } from "@/app/recipes/[recipeId]/recipe-ingredients-client";
import { requireAppAuthContext, resolveActiveMembership } from "@/lib/auth-context";
import { groupIngredientsByComponent } from "@/lib/ingredients";
import { prisma } from "@/lib/prisma";
import { createRecipeRevision, ensureRecipeRevision, readRecipeSnapshot } from "@/lib/recipe-revisions";
import { groupRecipeSteps } from "@/lib/recipe-steps";

type PageProps = { params: Promise<{ recipeId: string }> };

export default async function RecipeDetailPage({ params }: PageProps) {
  const { recipeId } = await params;
  const { userId, organizationId } = await requireAppAuthContext();
  const membership = await resolveActiveMembership(userId, organizationId);
  if (!membership) return <main className="app-theme-page grid min-h-screen place-items-center p-6">No household is connected to this account.</main>;

  const [sourceRecipe, collections] = await Promise.all([
    prisma.recipe.findFirst({
      where: {
        id: recipeId,
        OR: [
          { householdId: membership.householdId, deletedAt: null },
          { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
          { saves: { some: { userId } } },
          { plannedIn: { some: { mealPlan: { householdId: membership.householdId } } } },
        ],
      },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        ingredients: { orderBy: { position: "asc" } },
        steps: { orderBy: { position: "asc" } },
        saves: { where: { userId }, select: { userId: true, lastSeenRevisionId: true } },
        collectionItems: { where: { collection: { userId } }, select: { collectionId: true } },
        plannedIn: {
          where: { mealPlan: { householdId: membership.householdId } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: { recipeRevision: true },
        },
      },
    }),
    prisma.recipeCollection.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);
  if (!sourceRecipe) notFound();
  const ownsRecipe = sourceRecipe.householdId === membership.householdId;
  const canReadLive = ownsRecipe
    || (sourceRecipe.visibility === RecipeVisibility.PUBLIC && sourceRecipe.deletedAt === null);
  const retainedRevision = !canReadLive
    ? sourceRecipe.saves.length && sourceRecipe.latestRevisionId
      ? await prisma.recipeRevision.findUnique({ where: { id: sourceRecipe.latestRevisionId } })
      : sourceRecipe.plannedIn[0]?.recipeRevision ?? null
    : null;
  if (!canReadLive && !retainedRevision) notFound();
  const retainedSnapshot = retainedRevision ? readRecipeSnapshot(retainedRevision.snapshot) : null;
  const recipe = retainedSnapshot
    ? {
        ...sourceRecipe,
        ...retainedSnapshot,
        id: sourceRecipe.id,
        ingredients: retainedSnapshot.ingredients,
        steps: retainedSnapshot.steps,
      }
    : sourceRecipe;
  const authorName = retainedSnapshot?.authorName
    ?? recipe.sourceAuthorName
    ?? recipe.createdBy.displayName?.trim()
    ?? "Picknic cook";
  if (sourceRecipe.saves[0] && sourceRecipe.latestRevisionId && sourceRecipe.saves[0].lastSeenRevisionId !== sourceRecipe.latestRevisionId) {
    await prisma.savedRecipe.update({
      where: { userId_recipeId: { userId, recipeId } },
      data: { lastSeenRevisionId: sourceRecipe.latestRevisionId },
    });
  }
  const ingredientGroups = groupIngredientsByComponent(recipe.ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    notes: ingredient.notes,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    unitId: ingredient.unitId,
    component: ingredient.component,
    componentId: ingredient.componentId,
    componentPosition: ingredient.componentPosition,
  })));
  const stepGroups = groupRecipeSteps(recipe.steps.map((step) => ({
    id: step.id,
    instruction: step.instruction,
    component: step.component,
    componentId: step.componentId,
    componentPosition: step.componentPosition,
    durationMinutes: step.durationMinutes,
    advanceNotice: step.advanceNotice,
    position: step.position,
  })));

  async function toggleSave() {
    "use server";
    const context = await requireAppAuthContext();
    const existing = await prisma.savedRecipe.findUnique({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    if (existing) await prisma.savedRecipe.delete({ where: { userId_recipeId: { userId: context.userId, recipeId } } });
    else {
      const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
      if (!activeMembership) throw new Error("No household is connected to this account.");
      const available = await prisma.recipe.findFirst({
        where: {
          id: recipeId,
          deletedAt: null,
          OR: [{ householdId: activeMembership.householdId }, { visibility: RecipeVisibility.PUBLIC }],
        },
        select: { id: true, createdById: true },
      });
      if (!available) throw new Error("This recipe cannot be saved.");
      const revision = await ensureRecipeRevision(prisma, available.id, available.createdById);
      await prisma.savedRecipe.create({ data: { userId: context.userId, recipeId, lastSeenRevisionId: revision.id } });
    }
    revalidatePath(`/recipes/${recipeId}`);
  }

  async function togglePublic() {
    "use server";
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const current = await prisma.recipe.findFirst({ where: { id: recipeId, householdId: activeMembership.householdId, deletedAt: null }, select: { visibility: true, publishedAt: true } });
    if (!current) throw new Error("Only the owning household can publish this recipe.");
    const visibility = current.visibility === RecipeVisibility.PUBLIC ? RecipeVisibility.PRIVATE : RecipeVisibility.PUBLIC;
    await prisma.$transaction(async (tx) => {
      await tx.recipe.update({
        where: { id: recipeId },
        data: {
          visibility,
          publishedAt: visibility === RecipeVisibility.PUBLIC ? current.publishedAt ?? new Date() : undefined,
        },
      });
      if (visibility === RecipeVisibility.PUBLIC) await createRecipeRevision(tx, recipeId, context.userId);
    });
    revalidatePath(`/recipes/${recipeId}`);
  }

  async function addToCollection(formData: FormData) {
    "use server";
    const collectionId = String(formData.get("collectionId") ?? "");
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const collection = await prisma.recipeCollection.findFirst({ where: { id: collectionId, userId: context.userId }, select: { id: true, _count: { select: { items: true } } } });
    if (!collection) throw new Error("Choose one of your collections.");
    const available = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        OR: [
          { householdId: activeMembership.householdId, deletedAt: null },
          { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
          { saves: { some: { userId: context.userId } } },
          { plannedIn: { some: { mealPlan: { householdId: activeMembership.householdId } } } },
        ],
      },
      select: { id: true, createdById: true, householdId: true, latestRevisionId: true, visibility: true },
    });
    if (!available) throw new Error("This recipe cannot be added to a collection.");
    if (available.householdId !== activeMembership.householdId) {
      const revision = available.visibility === RecipeVisibility.PUBLIC
        ? await ensureRecipeRevision(prisma, available.id, available.createdById)
        : available.latestRevisionId
          ? await prisma.recipeRevision.findUniqueOrThrow({ where: { id: available.latestRevisionId } })
          : null;
      if (!revision) throw new Error("The retained recipe version is no longer available.");
      await prisma.savedRecipe.upsert({
        where: { userId_recipeId: { userId: context.userId, recipeId } },
        update: {},
        create: { userId: context.userId, recipeId, lastSeenRevisionId: revision.id },
      });
    }
    await prisma.recipeCollectionItem.upsert({ where: { collectionId_recipeId: { collectionId, recipeId } }, update: {}, create: { collectionId, recipeId, position: collection._count.items + 1 } });
    revalidatePath(`/recipes/${recipeId}`);
    redirect(`/recipes/${recipeId}`);
  }

  async function customizeRecipe() {
    "use server";
    const context = await requireAppAuthContext();
    const activeMembership = await resolveActiveMembership(context.userId, context.organizationId);
    if (!activeMembership) throw new Error("No household is connected to this account.");
    const source = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        OR: [
          { visibility: RecipeVisibility.PUBLIC, deletedAt: null },
          { saves: { some: { userId: context.userId } } },
          { plannedIn: { some: { mealPlan: { householdId: activeMembership.householdId } } } },
        ],
      },
      include: {
        createdBy: { select: { id: true, displayName: true, email: true } },
        saves: { where: { userId: context.userId }, select: { userId: true } },
        plannedIn: {
          where: { mealPlan: { householdId: activeMembership.householdId } },
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: { recipeRevision: true },
        },
      },
    });
    if (!source) throw new Error("This recipe is no longer available to customize.");
    if (source.householdId === activeMembership.householdId) redirect(`/recipes/${recipeId}/edit`);

    const revision = source.visibility === RecipeVisibility.PUBLIC && source.deletedAt === null
      ? await ensureRecipeRevision(prisma, source.id, source.createdById)
      : source.saves.length && source.latestRevisionId
        ? await prisma.recipeRevision.findUnique({ where: { id: source.latestRevisionId } })
        : source.plannedIn[0]?.recipeRevision ?? null;
    if (!revision) throw new Error("The retained recipe version is no longer available.");
    const snapshot = readRecipeSnapshot(revision.snapshot);
    const fork = await prisma.recipe.create({
      data: {
        householdId: activeMembership.householdId,
        createdById: context.userId,
        title: snapshot.title,
        description: snapshot.description,
        servings: snapshot.servings,
        totalTimeMinutes: snapshot.totalTimeMinutes,
        tags: snapshot.tags,
        imageUrl: snapshot.imageUrl,
        visibility: RecipeVisibility.PRIVATE,
        sourceRecipeId: source.id,
        sourceRevisionId: revision.id,
        sourceAuthorId: source.createdBy.id,
        sourceAuthorName: snapshot.authorName,
        ingredients: {
          create: snapshot.ingredients.map(({ component, componentId, componentPosition, name, notes, position, quantity, unit, unitId }) => ({
            component,
            componentId,
            componentPosition,
            name,
            notes,
            position,
            quantity,
            unit,
            unitId,
          })),
        },
        steps: {
          create: snapshot.steps.map(({ advanceNotice, component, componentId, componentPosition, durationMinutes, instruction, position }) => ({
            advanceNotice,
            component,
            componentId,
            componentPosition,
            durationMinutes,
            instruction,
            position,
          })),
        },
      },
      select: { id: true },
    });
    redirect(`/recipes/${fork.id}/edit`);
  }

  return (
    <AppPageShell
      currentPath="/recipes"
      title={<span className="recipe-title">{recipe.title}</span>}
      subtitle={recipe.description ?? "A household recipe ready for this week."}
      headerChildren={
        <div className="recipe-detail-actions">
          <Link className="app-theme-primary-button" href={`/planner?${canReadLive ? "" : "view=saved&"}q=${encodeURIComponent(recipe.title)}`}><CalendarPlus size={17} /> Plan</Link>
          {!recipe.deletedAt || recipe.saves.length ? <form action={toggleSave}><button className="app-theme-secondary-button" type="submit"><Bookmark fill={recipe.saves.length ? "currentColor" : "none"} size={17} />{recipe.saves.length ? "Saved" : "Save recipe"}</button></form> : null}
          {ownsRecipe ? <Link className="app-theme-secondary-button" href={`/recipes/${recipe.id}/edit`}><Pencil size={16} /> Edit</Link> : null}
          {!ownsRecipe ? <form action={customizeRecipe}><button className="app-theme-secondary-button" type="submit"><CopyPlus size={16} /> Customize</button></form> : null}
        </div>
      }
      maxWidthClassName="max-w-6xl"
    >
      <section className="recipe-detail-hero">
        <RecipeImage alt="" height={360} priority recipe={recipe} width={720} />
        <div>
          <dl><div><dt>Servings</dt><dd>{recipe.servings}</dd></div><div><dt>Ingredients</dt><dd>{recipe.ingredients.length}</dd></div><div><dt>Steps</dt><dd>{recipe.steps.length}</dd></div>{recipe.totalTimeMinutes ? <div><dt>Total time</dt><dd>{recipe.totalTimeMinutes} min</dd></div> : null}</dl>
          <div className="recipe-detail-tags">{recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <div className="recipe-detail-management">
            {ownsRecipe ? <><form action={togglePublic}><button className="app-theme-secondary-button" type="submit"><Globe2 size={16} />{recipe.visibility === RecipeVisibility.PUBLIC ? "Make household-only" : "Make public"}</button></form>{recipe.visibility === RecipeVisibility.PUBLIC ? <p>People who save this recipe will receive future published changes.</p> : null}</> : <p><Users size={16} /> {recipe.deletedAt ? `Original removed · saved from ${authorName}` : recipe.sourceRecipeId ? `Adapted from ${authorName}` : `Shared by ${authorName}`}</p>}
            {collections.length ? <form action={addToCollection}><select aria-label="Collection" name="collectionId" required><option value="">Choose collection</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select><button type="submit">Add</button></form> : <Link href="/recipes?view=collections">Create a collection</Link>}
          </div>
        </div>
      </section>

      <div className="recipe-detail-body">
        <RecipeIngredientsClient groups={ingredientGroups.map((group) => ({
          component: group.component,
          key: group.key,
          ingredients: group.ingredients.map((ingredient) => ({
            id: ingredient.id,
            name: ingredient.name,
            notes: ingredient.notes,
            quantity: ingredient.quantity == null ? null : Number(ingredient.quantity),
            unit: ingredient.unit,
            unitId: ingredient.unitId,
          })),
        }))} />
        <section className="recipe-instructions">
          {stepGroups.map((group) => <section className="recipe-step-component" key={group.key}>
            {stepGroups.length > 1 || group.component ? <header><h3>{group.component || "Instructions"}</h3>{group.durationMinutes ? <span><Clock3 size={14} /> {group.durationMinutes} min</span> : null}</header> : null}
            <ol>{group.steps.map((step) => <li key={step.id}><span>{step.position}</span><div><p>{step.instruction}</p>{step.advanceNotice || step.durationMinutes ? <small>{step.advanceNotice ? <span className="advance-notice"><BellRing size={14} /> Advance notice</span> : null}{step.durationMinutes ? <span><Clock3 size={14} /> {step.durationMinutes} min</span> : null}</small> : null}</div></li>)}</ol>
          </section>)}
        </section>
      </div>
    </AppPageShell>
  );
}
