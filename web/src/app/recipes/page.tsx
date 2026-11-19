import { RecipesHomeBody, type RecipeLibraryParams } from "@/app/recipes/recipes-home-body";

type PageProps = {
  searchParams: Promise<RecipeLibraryParams>;
};

export default async function RecipesPage({ searchParams }: PageProps) {
  return <RecipesHomeBody searchParams={searchParams} currentPath="/recipes" searchActionPath="/recipes" />;
}
