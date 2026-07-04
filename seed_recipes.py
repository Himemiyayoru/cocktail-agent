from database import SessionLocal, Ingredient, Recipe, RecipeItem

db = SessionLocal()

# Check if recipe already exists to prevent duplicate insertion
if not db.query(Recipe).filter_by(name="Classic Margarita").first():
    print("Injecting Classic Margarita recipe into the database...")

    # 1. Fetch the base ingredients we injected earlier from the database
    tequila = db.query(Ingredient).filter_by(name="Tequila").first()
    cointreau = db.query(Ingredient).filter_by(name="Cointreau").first()
    lime = db.query(Ingredient).filter_by(name="Lime Juice").first()

    if not all([tequila, cointreau, lime]):
        print("❌ Injection failed: Base ingredients not found. Please ensure you ran seed_db.py first")
    else:
        # 2. Create the main recipe record
        margarita = Recipe(name="Classic Margarita", method="shake")
        db.add(margarita)
        db.commit()  # Commit to get the auto-incremented ID
        db.refresh(margarita)

        # 3. Create association records between recipe and ingredients (recording exact ml volumes)
        items = [
            RecipeItem(recipe_id=margarita.id, ingredient_id=tequila.id, volume_ml=50.0),
            RecipeItem(recipe_id=margarita.id, ingredient_id=cointreau.id, volume_ml=20.0),
            RecipeItem(recipe_id=margarita.id, ingredient_id=lime.id, volume_ml=20.0)
        ]

        db.add_all(items)
        db.commit()
        print("✅ Classic Margarita recipe injected successfully!")
else:
    print("Recipe already exists in the database, skipping injection.")