from database import SessionLocal, Ingredient

db = SessionLocal()

# Check if data already exists to prevent duplicate insertion
if not db.query(Ingredient).first():
    print("Injecting initial baseline physicochemical data into the database...")
    seed_data = [
        Ingredient(name="Tequila", category="Spirit", abv=0.40, brix=0.0, ph=5.0, color_r=255, color_g=255, color_b=255, opacity=0.0, is_tier1_ground_truth=True),
        Ingredient(name="Cointreau", category="Liqueur", abv=0.40, brix=25.0, ph=6.5, color_r=255, color_g=255, color_b=255, opacity=0.1, is_tier1_ground_truth=True),
        Ingredient(name="Lime Juice", category="Juice", abv=0.0, brix=1.5, ph=2.0, color_r=200, color_g=255, color_b=200, opacity=0.9, is_tier1_ground_truth=True)
    ]
    db.add_all(seed_data)
    db.commit()
    print("✅ Injection successful! Database is ready.")
else:
    print("Database already contains data, skipping injection.")