const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const recipes = JSON.parse(fs.readFileSync(path.join(root, 'backend/data/FINAL_COCKTAIL_PHYSICS_DB.json'), 'utf8'));
const output = path.join(root, 'mobile/src/data');
fs.writeFileSync(path.join(output, 'recipeDetails.json'), JSON.stringify(recipes.map((recipe, id) => ({ ...recipe, id }))));
fs.writeFileSync(path.join(output, 'recipeIndex.json'), JSON.stringify(recipes.map((recipe, id) => ({ id, name: recipe.name, glass_type: recipe.glass_type || 'Standard' }))));
console.log(`Bundled ${recipes.length} recipes.`);
