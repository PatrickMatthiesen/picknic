import { RecipesHomeBody } from "@/app/recipes/recipes-home-body";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function HomePage({ searchParams }: PageProps) {
  return <RecipesHomeBody searchParams={searchParams} currentPath="/recipes" searchActionPath="/recipes" />;
}
