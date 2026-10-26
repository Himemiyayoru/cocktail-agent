import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isRecipeDetail, createRecipeState } from '../src/lib/recipe.ts';
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
test('every offline detail matches the server and list IDs and can initialize the studio', () => {
  const server = read('../../backend/data/FINAL_COCKTAIL_PHYSICS_DB.json');
  const details = read('../src/data/recipeDetails.json');
  const index = read('../src/data/recipeIndex.json');
  assert.equal(details.length, server.length);
  for (const [id, recipe] of details.entries()) {
    assert.deepEqual(recipe, { ...server[id], id });
    assert.equal(index[id].name, recipe.name);
    assert.ok(isRecipeDetail(recipe), recipe.name);
    assert.equal(createRecipeState(recipe).components.length, recipe.components.length);
  }
});
