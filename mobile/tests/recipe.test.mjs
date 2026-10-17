import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeState, selectGlass, substituteSlot, adjustSlotVolume, scaleVolumesToCapacity, totalVolume, parseSavedBlends, isSavedBlend, upsertSavedBlend } from '../src/lib/recipe.ts';

const physics = { abv: 40, brix: 0, opacity: 0.1, color_rgb: [255, 255, 255] };
const recipe = { id: 7, name: 'Test blend', method: 'Stirred', glass_type: 'Shot', instructions: ['Stir.'], components: [
  { ingredient_name: 'Gin', category: 'Spirit', volume_ml: 45, physics_baseline: physics },
  { ingredient_name: 'Vermouth', category: 'Wine', volume_ml: 30, physics_baseline: { ...physics, abv: 18 } },
  { ingredient_name: 'Bitters', category: 'Bitters', volume_ml: 0.5, physics_baseline: physics },
  { ingredient_name: 'Water', category: 'Mixer', volume_ml: 0, physics_baseline: { ...physics, abv: 0 } },
] };

const saved = () => ({ ...createRecipeState(recipe), schemaVersion: 1, id: 'my-version', recipeId: recipe.id, name: 'My blend', recipe, createdAt: '2026-10-14T01:00:00.000Z', updatedAt: '2026-10-14T01:00:00.000Z' });

test('opening a recipe retains original volumes, including overflow, zero and small doses', () => {
  const state = createRecipeState(recipe);
  assert.deepEqual(Object.values(state.volumes), [45, 30, 0.5, 0]);
  assert.equal(state.selectedGlass, 'shot');
  assert.equal(totalVolume(state.volumes), 75.5);
});

test('same-name slots remain independent and counted exactly once', () => {
  const state = createRecipeState({ ...recipe, components: [recipe.components[0], { ...recipe.components[0], volume_ml: 15 }] });
  assert.deepEqual(state.volumes, { 'slot-0': 45, 'slot-1': 15 });
  assert.equal(totalVolume(state.volumes), 60);
});

test('substituting an ingredient already present does not overwrite either amount', () => {
  const state = createRecipeState(recipe);
  const changed = substituteSlot(state.components, 'slot-1', { ingredient_name: 'Gin', category: 'Spirit', physics_baseline: physics });
  assert.deepEqual(changed.slice(0, 2).map(component => component.ingredient_name), ['Gin', 'Gin']);
  assert.equal(changed[1].slotId, 'slot-1');
  assert.equal(state.volumes[changed[0].slotId], 45);
  assert.equal(state.volumes[changed[1].slotId], 30);
  assert.equal(state.components[1].ingredient_name, 'Vermouth');
  assert.equal(totalVolume(state.volumes), 75.5);
});

test('switching between glass sizes never scales or rounds amounts', () => {
  const original = createRecipeState(recipe);
  const next = selectGlass(selectGlass(original, 'highball'), 'shot');
  assert.deepEqual(next.volumes, original.volumes);
  assert.equal(next.volumes, original.volumes);
});

test('explicit scale-to-fit preserves ratios, small doses and zeros', () => {
  const original = createRecipeState(recipe).volumes;
  const fitted = scaleVolumesToCapacity(original, 50);
  assert.ok(Math.abs(totalVolume(fitted) - 50) < 1e-10);
  assert.ok(Math.abs(fitted['slot-0'] / fitted['slot-1'] - 1.5) < 1e-10);
  assert.ok(fitted['slot-2'] > 0 && fitted['slot-2'] < 0.5);
  assert.equal(fitted['slot-3'], 0);
  assert.equal(original['slot-0'], 45);
});

test('empty and already-fitting recipes do not grow during fit', () => {
  assert.deepEqual(scaleVolumesToCapacity({ a: 0, b: 0 }, 50), { a: 0, b: 0 });
  assert.deepEqual(scaleVolumesToCapacity({ a: 20 }, 50), { a: 20 });
  assert.deepEqual(scaleVolumesToCapacity({ a: 20 }, Number.NaN), { a: 20 });
});

test('adjustments clamp at zero and do not affect another slot with the same ingredient', () => {
  const volumes = createRecipeState(recipe).volumes;
  const removed = adjustSlotVolume(volumes, 'slot-2', -1);
  assert.equal(removed['slot-2'], 0);
  assert.equal(adjustSlotVolume(removed, 'slot-2', 0.25)['slot-2'], 0.25);
  assert.equal(removed['slot-0'], 45);
  assert.equal(adjustSlotVolume(volumes, 'missing-slot', 10), volumes);
});

test('saved versions round-trip original snapshot and independently adjusted slots', () => {
  const blend = saved();
  blend.components = substituteSlot(blend.components, 'slot-1', { ingredient_name: 'Gin', category: 'Spirit', physics_baseline: physics });
  blend.volumes['slot-1'] = 12.25;
  blend.selectedGlass = 'coupe';
  const restored = parseSavedBlends(JSON.stringify([blend]))[0];
  assert.deepEqual(restored, blend);
  assert.equal(restored.recipe.components[1].ingredient_name, 'Vermouth');
  assert.equal(createRecipeState(restored.recipe).volumes['slot-1'], 30);
});

test('saving updates only its version id and preserves other versions', () => {
  const first = saved();
  const second = { ...saved(), id: 'other-version' };
  const updated = { ...first, name: 'Edited', updatedAt: '2026-10-14T02:00:00.000Z' };
  const result = upsertSavedBlend([first, second], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Edited');
  assert.equal(result[1].id, 'other-version');
  assert.equal(first.name, 'My blend');
});

test('invalid storage is rejected rather than silently discarded or overwritten', () => {
  assert.deepEqual(parseSavedBlends(null), []);
  assert.throws(() => parseSavedBlends('{broken'));
  assert.throws(() => parseSavedBlends('{}'));
  const blend = saved();
  assert.equal(isSavedBlend({ ...blend, recipeId: 8 }), false);
  assert.equal(isSavedBlend({ ...blend, selectedGlass: 'unknown' }), false);
  assert.equal(isSavedBlend({ ...blend, volumes: { ...blend.volumes, 'slot-0': -1 } }), false);
  assert.equal(isSavedBlend({ ...blend, volumes: { ...blend.volumes, 'slot-0': Infinity } }), false);
  assert.equal(isSavedBlend({ ...blend, components: blend.components.map(component => ({ ...component, slotId: 'slot-0' })) }), false);
  assert.throws(() => parseSavedBlends(JSON.stringify([blend, blend])));
});
