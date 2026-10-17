export interface PhysicsBaseline {
  abv: number;
  brix: number;
  opacity: number;
  color_rgb: number[];
}

export interface RecipeComponent {
  ingredient_name: string;
  category: string;
  volume_ml: number;
  physics_baseline: PhysicsBaseline;
}

export interface RecipeDetail {
  id: number;
  name: string;
  method: string;
  components: RecipeComponent[];
  instructions?: string[];
  glass_type?: string;
  description?: string;
}

export interface RecipeSlot extends RecipeComponent { slotId: string }
export type Volumes = Record<string, number>;
export const GLASS_CAPACITIES = { highball: 350, rocks: 250, martini: 150, coupe: 180, flute: 180, nicknora: 120, shot: 50 };
export type GlassKey = keyof typeof GLASS_CAPACITIES;

export interface BlendState {
  components: RecipeSlot[];
  volumes: Volumes;
  selectedGlass: GlassKey;
  isMixedMode: boolean;
}

export interface SavedBlend extends BlendState {
  schemaVersion: 1;
  id: string;
  recipeId: number;
  name: string;
  recipe: RecipeDetail;
  createdAt: string;
  updatedAt: string;
}

export const ingredientKey = (name: string) => name.trim().toLowerCase();
export const totalVolume = (volumes: Volumes) => Object.values(volumes).reduce((sum, value) => sum + value, 0);
export const formatVolume = (volume: number) => Number(volume.toFixed(2)).toString();

export function createRecipeState(recipe: RecipeDetail): BlendState {
  const components = recipe.components.map((component, index) => ({ ...component, slotId: `slot-${index}` }));
  const volumes = Object.fromEntries(components.map(component => [component.slotId, component.volume_ml]));
  const hint = recipe.glass_type?.toLowerCase() ?? '';
  let selectedGlass: GlassKey = 'rocks';
  if (/martini|cocktail/.test(hint)) selectedGlass = 'martini';
  else if (/highball|collins|hurricane|poco/.test(hint)) selectedGlass = 'highball';
  else if (/flute|champagne/.test(hint)) selectedGlass = 'flute';
  else if (/coupe/.test(hint)) selectedGlass = 'coupe';
  else if (/nick|nora/.test(hint)) selectedGlass = 'nicknora';
  else if (/shot/.test(hint)) selectedGlass = 'shot';
  return { components, volumes, selectedGlass, isMixedMode: /shaken|stirred|blend/i.test(recipe.method ?? '') };
}

// Selecting a vessel never changes the user's recipe.
export function selectGlass(state: BlendState, selectedGlass: GlassKey): BlendState {
  return { ...state, selectedGlass };
}

export function scaleVolumesToCapacity(volumes: Volumes, capacity: number): Volumes {
  const total = totalVolume(volumes);
  if (total <= 0 || total <= capacity || !Number.isFinite(capacity) || capacity < 0) return { ...volumes };
  // Keep full precision: rounding each ingredient can change ratios or erase a small dose.
  const ratio = capacity / total;
  return Object.fromEntries(Object.entries(volumes).map(([slotId, volume]) => [slotId, volume * ratio]));
}

export function adjustSlotVolume(volumes: Volumes, slotId: string, delta: number): Volumes {
  if (!(slotId in volumes) || !Number.isFinite(delta)) return volumes;
  return { ...volumes, [slotId]: Math.max(0, volumes[slotId] + delta) };
}

export function substituteSlot(components: RecipeSlot[], slotId: string, candidate: Omit<RecipeComponent, 'volume_ml'>): RecipeSlot[] {
  return components.map(component => component.slotId === slotId ? { ...component, ...candidate, slotId } : component);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isComponent(value: unknown): value is RecipeComponent {
  if (!isObject(value) || typeof value.ingredient_name !== 'string' || !value.ingredient_name.trim() || typeof value.category !== 'string' || typeof value.volume_ml !== 'number' || !Number.isFinite(value.volume_ml) || value.volume_ml < 0 || !isObject(value.physics_baseline)) return false;
  const physics = value.physics_baseline;
  return ['abv', 'brix', 'opacity'].every(key => typeof physics[key] === 'number' && Number.isFinite(physics[key])) && Array.isArray(physics.color_rgb) && physics.color_rgb.length === 3 && physics.color_rgb.every(channel => typeof channel === 'number' && Number.isFinite(channel));
}

export function isRecipeDetail(value: unknown): value is RecipeDetail {
  return isObject(value) && Number.isInteger(value.id) && typeof value.name === 'string' && typeof value.method === 'string' && Array.isArray(value.components) && value.components.length > 0 && value.components.every(isComponent) && (value.instructions === undefined || (Array.isArray(value.instructions) && value.instructions.every(step => typeof step === 'string')));
}

export function isSavedBlend(value: unknown): value is SavedBlend {
  if (!isObject(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !isRecipeDetail(value.recipe) || value.recipeId !== value.recipe.id || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt)) || typeof value.isMixedMode !== 'boolean' || typeof value.selectedGlass !== 'string' || !Object.hasOwn(GLASS_CAPACITIES, value.selectedGlass) || !Array.isArray(value.components) || value.components.length !== value.recipe.components.length || !isObject(value.volumes)) return false;
  const volumes = value.volumes;
  return value.components.every((component, index) => isComponent(component) && isObject(component) && component.slotId === `slot-${index}` && typeof volumes[`slot-${index}`] === 'number' && Number.isFinite(volumes[`slot-${index}`]) && (volumes[`slot-${index}`] as number) >= 0) && Object.keys(volumes).length === value.components.length;
}

export function parseSavedBlends(stored: string | null): SavedBlend[] {
  if (!stored) return [];
  const value: unknown = JSON.parse(stored);
  if (!Array.isArray(value) || !value.every(isSavedBlend) || new Set(value.map(blend => blend.id)).size !== value.length) throw new Error('Saved versions could not be read. Existing data has been kept.');
  return value;
}

export function upsertSavedBlend(blends: SavedBlend[], blend: SavedBlend): SavedBlend[] {
  if (!isSavedBlend(blend)) throw new Error('This version is incomplete and could not be saved.');
  return [blend, ...blends.filter(item => item.id !== blend.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
