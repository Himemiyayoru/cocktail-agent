import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentListStore } from '../src/lib/persistentListStore.ts';
import { filterIngredientCategories, inventorySignature } from '../src/lib/cabinet.ts';

function memoryStorage(initial = null) {
  return {
    value: initial,
    reads: 0,
    writes: 0,
    failRead: false,
    failWrite: false,
    async getItem() {
      this.reads += 1;
      await Promise.resolve();
      if (this.failRead) throw new Error('Device unavailable');
      return this.value;
    },
    async setItem(_key, value) {
      this.writes += 1;
      await Promise.resolve();
      if (this.failWrite) throw new Error('Device full');
      this.value = value;
    },
  };
}
const stringStore = storage => createPersistentListStore(storage, 'inventory', value => typeof value === 'string', 'cabinet');

test('rapid toggles and focus loads preserve every operation in order', async () => {
  const storage = memoryStorage();
  const store = stringStore(storage);
  await Promise.all([
    store.load(),
    store.toggle('Gin'),
    store.toggle('Lime'),
    store.load(),
    store.toggle('Gin'),
    store.toggle('Mint'),
  ]);
  assert.deepEqual(store.getSnapshot().items, ['Lime', 'Mint']);
  assert.deepEqual(JSON.parse(storage.value), ['Lime', 'Mint']);
  assert.equal(storage.reads, 1);
  assert.equal(store.getSnapshot().error, null);
});

test('focus load cannot restore a stale value while a write is pending', async () => {
  const storage = memoryStorage('["Gin"]');
  let releaseWrite;
  let notifyWrite;
  const writeStarted = new Promise(resolve => { notifyWrite = resolve; });
  const writeGate = new Promise(resolve => { releaseWrite = resolve; });
  storage.setItem = async function (_key, value) {
    notifyWrite();
    await writeGate;
    this.value = value;
  };
  const store = stringStore(storage);
  await store.load();
  const update = store.toggle('Lime');
  await writeStarted;
  assert.deepEqual(store.getSnapshot().items, ['Gin', 'Lime']);
  const focus = store.load();
  releaseWrite();
  await Promise.all([update, focus]);
  assert.deepEqual(store.getSnapshot().items, ['Gin', 'Lime']);
  assert.equal(storage.reads, 1);
});

test('failed save keeps the current session and retries the latest complete list', async () => {
  const storage = memoryStorage('["Gin"]');
  const store = stringStore(storage);
  await store.load();
  storage.failWrite = true;
  assert.equal(await store.toggle('Lime'), false);
  await store.toggle('Mint');
  await store.load();
  assert.deepEqual(store.getSnapshot().items, ['Gin', 'Lime', 'Mint']);
  assert.deepEqual(JSON.parse(storage.value), ['Gin']);
  assert.match(store.getSnapshot().error, /only saved for this session/);
  storage.failWrite = false;
  assert.equal(await store.retry(), true);
  assert.deepEqual(JSON.parse(storage.value), ['Gin', 'Lime', 'Mint']);
  assert.equal(store.getSnapshot().error, null);
});

test('a rejected read never overwrites the saved cabinet with an empty list', async () => {
  const storage = memoryStorage('["Gin"]');
  storage.failRead = true;
  const store = stringStore(storage);
  assert.equal(await store.toggle('Lime'), false);
  assert.equal(storage.writes, 0);
  assert.equal(storage.value, '["Gin"]');
  assert.equal(store.getSnapshot().loaded, true);
  assert.match(store.getSnapshot().error, /Could not load/);
  storage.failRead = false;
  await store.retry();
  await store.toggle('Lime');
  assert.deepEqual(store.getSnapshot().items, ['Gin', 'Lime']);
});

test('malformed JSON and wrong item types cannot be silently overwritten', async () => {
  for (const initial of ['{broken', '{}', '["Gin", 12]']) {
    const storage = memoryStorage(initial);
    const store = stringStore(storage);
    assert.equal(await store.clear(), false);
    assert.equal(storage.writes, 0);
    assert.equal(storage.value, initial);
    assert.notEqual(store.getSnapshot().error, null);
  }
});

test('clear and undo restore the cabinet without discarding new selections', async () => {
  const storage = memoryStorage('["Gin","Lime"]');
  const store = stringStore(storage);
  await store.load();
  const cleared = [...store.getSnapshot().items];
  await store.clear();
  await store.toggle('Mint');
  await store.replace([...new Set([...store.getSnapshot().items, ...cleared])]);
  assert.deepEqual(store.getSnapshot().items, ['Mint', 'Gin', 'Lime']);
  const reloaded = stringStore(storage);
  await reloaded.load();
  assert.deepEqual(reloaded.getSnapshot().items, ['Mint', 'Gin', 'Lime']);
});

test('replace copies its argument before queuing and deduplicates items', async () => {
  const storage = memoryStorage();
  const store = stringStore(storage);
  const input = ['Gin', 'Gin', 'Lime'];
  const replacing = store.replace(input);
  input.push('Must not be saved');
  await replacing;
  assert.deepEqual(store.getSnapshot().items, ['Gin', 'Lime']);
});

test('favorites use the same serialized behavior for numeric ids', async () => {
  const storage = memoryStorage('[1]');
  const store = createPersistentListStore(storage, 'favorites', value => Number.isSafeInteger(value), 'saved cocktails');
  await Promise.all([store.toggle(2), store.toggle(3), store.toggle(1), store.load()]);
  assert.deepEqual(store.getSnapshot().items, [2, 3]);
  assert.deepEqual(JSON.parse(storage.value), [2, 3]);
});

test('all subscribed screens receive the same snapshot and can unsubscribe', async () => {
  const store = stringStore(memoryStorage());
  const screenA = [];
  const screenB = [];
  const unsubscribe = store.subscribe(() => screenA.push(store.getSnapshot()));
  store.subscribe(() => screenB.push(store.getSnapshot()));
  await store.toggle('Gin');
  assert.equal(screenA.at(-1), screenB.at(-1));
  unsubscribe();
  const previousCount = screenA.length;
  await store.toggle('Lime');
  assert.equal(screenA.length, previousCount);
  assert.deepEqual(screenB.at(-1).items, ['Gin', 'Lime']);
});

const categories = {
  Spirits: ['London Dry Gin', 'White Rum'],
  Citrus: ['Lime Juice', 'Lemon Juice'],
  Sweeteners: ['Simple Syrup'],
};

test('ingredient filtering matches words and categories without case sensitivity', () => {
  assert.deepEqual(filterIngredientCategories(categories, '  DRY   spirits ', [], false), [
    ['Spirits', ['London Dry Gin']],
  ]);
  assert.deepEqual(filterIngredientCategories(categories, 'citrus', [], false), [
    ['Citrus', ['Lime Juice', 'Lemon Juice']],
  ]);
});

test('selected-only intersects the query and drops empty groups', () => {
  const inventory = ['Lime Juice', 'White Rum'];
  assert.deepEqual(filterIngredientCategories(categories, 'juice', inventory, true), [
    ['Citrus', ['Lime Juice']],
  ]);
  assert.deepEqual(filterIngredientCategories(categories, '', [], true), []);
  assert.deepEqual(filterIngredientCategories(categories, 'missing', inventory, false), []);
  assert.deepEqual(inventory, ['Lime Juice', 'White Rum']);
  assert.deepEqual(categories.Citrus, ['Lime Juice', 'Lemon Juice']);
});

test('cabinet result identity ignores order and duplicates but detects ingredient changes', () => {
  assert.equal(inventorySignature(['Gin', 'Lime', 'Gin']), inventorySignature(['Lime', 'Gin']));
  assert.notEqual(inventorySignature(['Gin', 'Lime']), inventorySignature(['Gin', 'Lemon']));
});
