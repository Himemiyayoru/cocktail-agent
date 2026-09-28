import recipeIndex from './recipeIndex.json';
import drinkImages from './drinkImages.json';

export type RecipeSnippet = {
  id: number;
  name: string;
  glass_type: string;
};

export const RECIPE_INDEX: RecipeSnippet[] = recipeIndex as RecipeSnippet[];

const IMAGE_MAP = drinkImages as Record<string, string>;

export function drinkImageUrl(name: string): string | null {
  return IMAGE_MAP[name] ?? null;
}
