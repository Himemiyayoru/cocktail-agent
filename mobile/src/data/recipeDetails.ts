import details from './recipeDetails.json';
import { type RecipeDetail } from '../lib/recipe';

export function localRecipe(id: string | undefined): RecipeDetail | null {
  if (!id || !/^\d+$/.test(id)) return null;
  return (details as RecipeDetail[])[Number(id)] ?? null;
}
