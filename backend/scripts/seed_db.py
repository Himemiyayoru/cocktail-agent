import sys
import os

# Ensure the script can locate the database module from the backend root
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, Ingredient

db = SessionLocal()

print("[INIT] Expanding world ingredients knowledge graph...")

# Carefully estimated physics and chemistry baselines (ABV, Brix, pH, RGB, Opacity)
expanded_ingredients = [
    # --- Spirits ---
    {"name": "Vodka", "category": "Spirit", "abv": 0.40, "brix": 0.0, "ph": 6.0, "color_r": 255, "color_g": 255, "color_b": 255, "opacity": 0.0, "is_tier1_ground_truth": True},
    {"name": "London Dry Gin", "category": "Spirit", "abv": 0.40, "brix": 0.0, "ph": 6.0, "color_r": 255, "color_g": 255, "color_b": 255, "opacity": 0.0, "is_tier1_ground_truth": True},
    {"name": "White Rum", "category": "Spirit", "abv": 0.40, "brix": 0.5, "ph": 5.5, "color_r": 255, "color_g": 255, "color_b": 255, "opacity": 0.0, "is_tier1_ground_truth": True},
    {"name": "Bourbon Whiskey", "category": "Spirit", "abv": 0.43, "brix": 0.0, "ph": 4.5, "color_r": 205, "color_g": 127, "color_b": 50, "opacity": 0.1, "is_tier1_ground_truth": True},
    {"name": "Rye Whiskey", "category": "Spirit", "abv": 0.45, "brix": 0.0, "ph": 4.5, "color_r": 180, "color_g": 100, "color_b": 40, "opacity": 0.1, "is_tier1_ground_truth": True},

    # --- Liqueurs & Vermouths ---
    {"name": "Campari", "category": "Liqueur", "abv": 0.25, "brix": 24.0, "ph": 4.0, "color_r": 220, "color_g": 20, "color_b": 40, "opacity": 0.2, "is_tier1_ground_truth": True},
    {"name": "Sweet Vermouth", "category": "Vermouth", "abv": 0.16, "brix": 15.0, "ph": 3.6, "color_r": 120, "color_g": 40, "color_b": 40, "opacity": 0.7, "is_tier1_ground_truth": True},
    {"name": "Dry Vermouth", "category": "Vermouth", "abv": 0.15, "brix": 4.0, "ph": 3.4, "color_r": 250, "color_g": 250, "color_b": 210, "opacity": 0.05, "is_tier1_ground_truth": True},

    # --- Modifiers & Syrups ---
    {"name": "Simple Syrup", "category": "Syrup", "abv": 0.0, "brix": 50.0, "ph": 7.0, "color_r": 255, "color_g": 255, "color_b": 255, "opacity": 0.1, "is_tier1_ground_truth": True},
    {"name": "Angostura Bitters", "category": "Bitters", "abv": 0.44, "brix": 5.0, "ph": 4.5, "color_r": 70, "color_g": 20, "color_b": 10, "opacity": 0.9, "is_tier1_ground_truth": True},

    # --- Juices ---
    {"name": "Lemon Juice", "category": "Juice", "abv": 0.0, "brix": 2.0, "ph": 2.2, "color_r": 255, "color_g": 250, "color_b": 150, "opacity": 0.85, "is_tier1_ground_truth": True},
]

added_count = 0
for ing_data in expanded_ingredients:
    if not db.query(Ingredient).filter_by(name=ing_data["name"]).first():
        db.add(Ingredient(**ing_data))
        added_count += 1

db.commit()
print(f"[SUCCESS] Injected {added_count} new ingredients into the physics engine!")