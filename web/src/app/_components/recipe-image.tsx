"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import {
  getRecipeImageFallbackUrl,
  getRecipeImageUrl,
  type RecipeImageInput,
} from "@/lib/recipe-display";

type RecipeImageProps = Omit<ImageProps, "onError" | "src" | "unoptimized"> & {
  recipe: RecipeImageInput;
};

export function RecipeImage({ alt, recipe, ...props }: RecipeImageProps) {
  const preferredUrl = getRecipeImageUrl(recipe);
  const fallbackUrl = getRecipeImageFallbackUrl(recipe.id);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = failedUrl === preferredUrl ? fallbackUrl : preferredUrl;

  return (
    <Image
      {...props}
      alt={alt}
      onError={() => {
        if (source !== fallbackUrl) setFailedUrl(preferredUrl);
      }}
      referrerPolicy="no-referrer"
      src={source}
      unoptimized
    />
  );
}
