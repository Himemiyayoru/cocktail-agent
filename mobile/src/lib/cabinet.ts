export type IngredientCategories = Record<string, string[]>;

export function filterIngredientCategories(
  categories: IngredientCategories,
  query: string,
  inventory: string[],
  selectedOnly: boolean,
): [string, string[]][] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const owned = new Set(inventory);
  return Object.entries(categories)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, ingredients]): [string, string[]] => [category, ingredients.filter(ingredient => {
      const searchable = `${ingredient} ${category}`.toLocaleLowerCase();
      return (!selectedOnly || owned.has(ingredient)) && terms.every(term => searchable.includes(term));
    })])
    .filter(([, ingredients]) => ingredients.length > 0);
}

export function inventorySignature(inventory: string[]): string {
  return JSON.stringify([...new Set(inventory)].sort());
}
