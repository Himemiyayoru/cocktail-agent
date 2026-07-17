import sys
import os

# Ensure the script can locate the database module from the backend root
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, Ingredient, Recipe, RecipeItem

db = SessionLocal()

print("[INIT] Expanding world classic recipes...")

recipes_to_add = [
    {
        "name": "Negroni", "method": "stir",
        "ingredients": [("London Dry Gin", 30.0), ("Campari", 30.0), ("Sweet Vermouth", 30.0)]
    },
    {
        "name": "Old Fashioned", "method": "stir",
        "ingredients": [("Bourbon Whiskey", 60.0), ("Simple Syrup", 7.5), ("Angostura Bitters", 2.5)]
    },
    {
        "name": "Dry Martini", "method": "stir",
        "ingredients": [("London Dry Gin", 60.0), ("Dry Vermouth", 10.0)]
    },
    {
        "name": "Daiquiri", "method": "shake",
        "ingredients": [("White Rum", 60.0), ("Lime Juice", 22.5), ("Simple Syrup", 15.0)]
    },
    {
        "name": "Whiskey Sour", "method": "shake",
        "ingredients": [("Bourbon Whiskey", 60.0), ("Lemon Juice", 22.5), ("Simple Syrup", 15.0)]
    },
    {
        "name": "Manhattan", "method": "stir",
        "ingredients": [("Rye Whiskey", 60.0), ("Sweet Vermouth", 30.0), ("Angostura Bitters", 2.5)]
    }
]

added_count = 0
for r_data in recipes_to_add:
    if not db.query(Recipe).filter_by(name=r_data["name"]).first():
        
        # 1. Verify existence of all required ingredients
        missing = False
        item_objects = []
        for ing_name, vol in r_data["ingredients"]:
            ing_record = db.query(Ingredient).filter_by(name=ing_name).first()
            
            # Compatibility handling for Daiquiri's Lime Juice
            if not ing_record and ing_name == "Lime Juice":
                ing_record = db.query(Ingredient).filter_by(name="Lime Juice").first()

            if not ing_record:
                print(f"[WARN] Skipping {r_data['name']}: Missing ingredient '{ing_name}' in database.")
                missing = True
                break
            else:
                item_objects.append((ing_record.id, vol))

        if not missing:
            # 2. Insert Recipe record
            new_recipe = Recipe(name=r_data["name"], method=r_data["method"])
            db.add(new_recipe)
            db.commit()
            db.refresh(new_recipe)

            # 3. Insert specific Recipe Items
            for ing_id, vol in item_objects:
                db.add(RecipeItem(recipe_id=new_recipe.id, ingredient_id=ing_id, volume_ml=vol))
            db.commit()
            added_count += 1

print(f"[SUCCESS] Injected {added_count} classic recipes into the system!")