import { RecipesHomeBody } from "@/app/recipes/recipes-home-body";

type PageProps = {
  searchParams: Promise<{ q?: string; view?: string; collection?: string }>;
};

export default async function RecipesPage({ searchParams }: PageProps) {
  return <RecipesHomeBody searchParams={searchParams} currentPath="/recipes" searchActionPath="/recipes" />;
}
