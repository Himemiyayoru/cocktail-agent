import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

# Ensure data directory exists for the SQLite database
os.makedirs("data", exist_ok=True)
SQLALCHEMY_DATABASE_URL = "sqlite:///./data/cocktail_physics.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Ingredient(Base):
    __tablename__ = 'ingredients'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    category = Column(String, nullable=False)

    # Core Physical & Chemical Data
    abv = Column(Float, nullable=False)
    brix = Column(Float, nullable=False)
    ph = Column(Float, nullable=False)
    specific_gravity = Column(Float, nullable=False, default=1.0)

    # Optical Data
    color_r = Column(Integer, nullable=False)
    color_g = Column(Integer, nullable=False)
    color_b = Column(Integer, nullable=False)
    opacity = Column(Float, nullable=False)

    # Smart Recommendation Metadata
    flavor_tags = Column(String, nullable=True)
    sweetness_index = Column(Integer, default=0)

    is_tier1_ground_truth = Column(Boolean, default=False)
    recipe_links = relationship("RecipeItem", back_populates="ingredient")

class Recipe(Base):
    __tablename__ = 'recipes'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    method = Column(String, nullable=False) 

    # Presentation Data
    glass_type = Column(String, nullable=False, default="rocks")
    ice_type = Column(String, nullable=True)                     
    garnish = Column(String, nullable=True)                      

    ingredients_list = relationship("RecipeItem", back_populates="recipe")

class RecipeItem(Base):
    __tablename__ = 'recipe_items'
    id = Column(Integer, primary_key=True, index=True)
    recipe_id = Column(Integer, ForeignKey('recipes.id'))
    ingredient_id = Column(Integer, ForeignKey('ingredients.id'))
    volume_ml = Column(Float, nullable=False)

    recipe = relationship("Recipe", back_populates="ingredients_list")
    ingredient = relationship("Ingredient", back_populates="recipe_links")

if __name__ == "__main__":
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("[INFO] High-Dimensional Database and table structures created successfully in /data!")