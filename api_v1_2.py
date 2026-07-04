import os
import math
import json
import tempfile
import whisper
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import or_
from openai import AsyncOpenAI

# Import database module (ensure database.py is in the same directory)
from database import SessionLocal, Ingredient, Recipe, RecipeItem

# ==========================================
# 🔌 Initialize Local LLM Client (Ollama)
# ==========================================
client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="bob-is-local"
)

# ==========================================
# 🎧 Initialize Local Hearing Model (Whisper)
# ==========================================
print("🚀 Loading local Whisper hearing model (Base version)...")
whisper_model = whisper.load_model("base")

app = FastAPI(title="Cocktail Physics & Bob AI API (Voice Edition)", version="1.2")

# Allow Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# 🧱 Pydantic Request Data Models
# ==========================================
class RecipeComponent(BaseModel):
    ingredient_name: str = Field(..., description="Ingredient name in the database")
    volume_ml: float = Field(..., gt=0, description="Liquid volume in ml")


class SimulateDBRequest(BaseModel):
    recipe_name: str
    method: str = Field(..., pattern="^(shake|stir|build)$")
    components: List[RecipeComponent]


class InventoryRequest(BaseModel):
    owned_ingredients: List[str] = Field(..., description="List of ingredient names owned by the user")
    allow_missing: int = Field(default=0, ge=0, description="Maximum number of missing ingredients allowed")


class BobChatRequest(BaseModel):
    user_message: str = Field(..., description="User's message to Bob")


# ==========================================
# 🟢 Tab 1 API: Featured Recipes & Search
# ==========================================
@app.get("/api/v2/recipes/featured")
def get_featured_recipes(db: Session = Depends(get_db)):
    recipes = db.query(Recipe).limit(20).all()
    result = [{
        "id": r.id,
        "name": r.name,
        "method": r.method,
        "preview_image": f"https://mock-image-server.com/{r.name.replace(' ', '_').lower()}.jpg",
        "tags": ["Classic"]
    } for r in recipes]
    return {"status": "success", "count": len(result), "data": result}


@app.get("/api/v2/recipes/search")
def search_recipes(query: str, db: Session = Depends(get_db)):
    search_term = f"%{query}%"
    results = db.query(Recipe).join(RecipeItem).join(Ingredient).filter(
        or_(Recipe.name.ilike(search_term), Ingredient.name.ilike(search_term))
    ).distinct().all()
    data = [{"id": r.id, "name": r.name, "method": r.method} for r in results]
    return {"status": "success", "count": len(data), "data": data}


@app.get("/api/v2/recipes/{recipe_id}")
def get_recipe_details(recipe_id: int, db: Session = Depends(get_db)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    items = db.query(RecipeItem).filter(RecipeItem.recipe_id == recipe_id).all()
    components = []
    for item in items:
        ing = db.query(Ingredient).filter(Ingredient.id == item.ingredient_id).first()
        components.append({
            "ingredient_name": ing.name,
            "category": ing.category,
            "volume_ml": item.volume_ml,
            "physics_baseline": {
                "abv": ing.abv, "brix": ing.brix, "opacity": ing.opacity,
                "color_rgb": [ing.color_r, ing.color_g, ing.color_b]
            }
        })
    return {"status": "success",
            "data": {"id": recipe.id, "name": recipe.name, "method": recipe.method, "components": components}}


# ==========================================
# 🔵 Tab 2 API: Inventory Matching Engine
# ==========================================
@app.post("/api/v2/recipes/inventory_match")
def match_recipes_by_inventory(req: InventoryRequest, db: Session = Depends(get_db)):
    owned_set = set(req.owned_ingredients)
    all_recipes = db.query(Recipe).all()

    results = []
    for r in all_recipes:
        recipe_items = db.query(RecipeItem).filter(RecipeItem.recipe_id == r.id).all()
        recipe_set = set(
            [db.query(Ingredient).filter(Ingredient.id == item.ingredient_id).first().name for item in recipe_items if
             db.query(Ingredient).filter(Ingredient.id == item.ingredient_id).first()])

        missing_ingredients = recipe_set - owned_set
        if len(missing_ingredients) <= req.allow_missing:
            match_rate = round((len(recipe_set) - len(missing_ingredients)) / len(recipe_set) * 100,
                               1) if recipe_set else 0
            results.append({
                "recipe_id": r.id,
                "recipe_name": r.name,
                "match_rate_percent": match_rate,
                "missing_count": len(missing_ingredients),
                "missing_items": list(missing_ingredients)
            })

    results.sort(key=lambda x: (x["match_rate_percent"], -x["missing_count"]), reverse=True)
    return {"status": "success", "count": len(results), "data": results}


# ==========================================
# ⚙️ Core Infrastructure: Physics & Fluid Simulation Engine
# ==========================================
@app.post("/api/v2/simulate_from_db")
def simulate_from_db(req: SimulateDBRequest, db: Session = Depends(get_db)):
    extracted_ingredients = []
    for comp in req.components:
        db_ing = db.query(Ingredient).filter(Ingredient.name == comp.ingredient_name).first()
        if not db_ing:
            raise HTTPException(status_code=404, detail=f"Knowledge graph missing: Ingredient '{comp.ingredient_name}' not found")
        extracted_ingredients.append({
            "name": db_ing.name, "volume_ml": comp.volume_ml, "abv": db_ing.abv,
            "brix": db_ing.brix, "ph": db_ing.ph, "opacity": db_ing.opacity,
            "color_rgb": (db_ing.color_r, db_ing.color_g, db_ing.color_b)
        })

    init_vol = sum(i["volume_ml"] for i in extracted_ingredients)
    pure_alc = sum(i["volume_ml"] * i["abv"] for i in extracted_ingredients)
    sugar_mass = sum(i["volume_ml"] * i["brix"] for i in extracted_ingredients)
    init_abv = pure_alc / init_vol if init_vol > 0 else 0

    if req.method == "shake":
        dilution_factor = 0.25 + (init_abv * 0.1)
    elif req.method == "stir":
        dilution_factor = 0.15 + (init_abv * 0.05)
    else:
        dilution_factor = 0.0

    final_vol = init_vol * (1 + dilution_factor)
    total_abs_R = sum(-math.log10(max(i["color_rgb"][0], 1) / 255.0) * i["volume_ml"] for i in extracted_ingredients)
    total_abs_G = sum(-math.log10(max(i["color_rgb"][1], 1) / 255.0) * i["volume_ml"] for i in extracted_ingredients)
    total_abs_B = sum(-math.log10(max(i["color_rgb"][2], 1) / 255.0) * i["volume_ml"] for i in extracted_ingredients)

    final_rgb = [
        int(min(max((10 ** -(total_abs_R / final_vol)) * 255, 0), 255)),
        int(min(max((10 ** -(total_abs_G / final_vol)) * 255, 0), 255)),
        int(min(max((10 ** -(total_abs_B / final_vol)) * 255, 0), 255))
    ]

    return {
        "recipe_name": req.recipe_name,
        "final_volume_ml": round(final_vol, 1),
        "final_abv_percent": round((pure_alc / final_vol) * 100, 2),
        "final_brix": round((sugar_mass / final_vol), 2),
        "final_rgb": final_rgb,
        "final_opacity_percent": round(
            (sum(i["volume_ml"] * i["opacity"] for i in extracted_ingredients) / final_vol) * 100, 1)
    }


# ==========================================
# 🤖 Tab 3 API: Bob's Local AI Bar
# ==========================================
@app.post("/api/v2/chat_with_bob")
async def chat_with_bob(req: BobChatRequest, db: Session = Depends(get_db)):
    all_ingredients = db.query(Ingredient).all()
    ingredient_context = "\n".join(
        [f"- {i.name} (Category: {i.category}, ABV: {i.abv * 100}%, Brix: {i.brix}, Opacity: {i.opacity})" for i in
         all_ingredients])

    system_prompt = f"""
        You are Bob, a veteran bartender who has been working at this corner bar for 30 years. You have sharp hospitality instincts, know how to read your customers' emotions, and speak directly, a bit roughly, but with genuine empathy.

        [Your Bar Inventory]:
        {ingredient_context}

        [Bob's Rules of Conduct]:
        1. Respond to the customer's mood like an old friend. If they ask casual questions (like "Who are you?" or "What do you do?"), just answer them naturally without making a drink.
        2. IF you decide to mix a drink for them (e.g., they are sad, celebrating, or explicitly ordering), you MUST use ONLY ingredients that exist in [Your Bar Inventory]. A real cocktail must contain at least 2 different ingredients.
        3. IF NO drink is needed for the current conversation, leave the "components" list empty.

        [Mandatory Output Format]:
        Strictly return a JSON object. Do NOT output any extra markdown. Use the following structure:
        {{
            "recipe_name": "<Generate a cool custom name for the drink, or null>",
            "method": "<shake or stir, or null>",
            "components": [
                {{"ingredient_name": "<Ingredient from inventory>", "volume_ml": 45}}
            ], // <-- LEAVE THIS LIST EMPTY [] IF JUST CHATTING AND NO DRINK IS NEEDED
            "bob_comment": "<Your conversational response>"
        }}
        """
    try:
        response = await client.chat.completions.create(
            model="llama3",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.user_message}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )

        raw_content = response.choices[0].message.content.strip()

        if raw_content.startswith("```json"):
            raw_content = raw_content[7:]
        elif raw_content.startswith("```"):
            raw_content = raw_content[3:]

        if raw_content.endswith("```"):
            raw_content = raw_content[:-3]

        raw_content = raw_content.strip()

        bob_recipe = json.loads(raw_content)

        components = bob_recipe.get("components", [])
        physics_result = None

        if len(components) > 0:
            try:
                simulation_req = SimulateDBRequest(
                    recipe_name=bob_recipe.get("recipe_name", "Bob's Special"),
                    method=bob_recipe.get("method", "shake"),
                    components=[RecipeComponent(**c) for c in components]
                )
                physics_result = simulate_from_db(simulation_req, db)
            except Exception as e:
                print(f"⚠️ Physics Engine bypassed due to LLM irregularity: {e}")

        return {
            "status": "success",
            "bob_says": bob_recipe.get("bob_comment", "There you go, buddy."),
            "recipe_data": components,
            "physics_metrics": physics_result
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Bob JSON parsing failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"System offline: {str(e)}")


# ==========================================
# 🎤 Ultimate Upgrade: Whisper Voice Recognition API
# ==========================================
@app.post("/api/v2/transcribe")
async def transcribe_audio(audio_file: UploadFile = File(...)):
    # Receive audio from frontend and save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as tmp:
        tmp.write(await audio_file.read())
        tmp_path = tmp.name

    try:
        print(f"🎧 Parsing audio: {audio_file.filename}")
        result = whisper_model.transcribe(tmp_path)
        text = result.get("text", "").strip()
        print(f"📝 Transcription result: {text}")

        return {"status": "success", "text": text}
    finally:
        os.remove(tmp_path)