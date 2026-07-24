import json
import math
import tempfile
import os
import time
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from openai import AsyncOpenAI, OpenAI
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ==========================================
# 1. Cloud Model Initialization (Groq & OpenAI)
# ==========================================
# Initialize asynchronous client for Groq (LLM engine)
groq_client = AsyncOpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.getenv("GROQ_API_KEY")
)

# Initialize synchronous client for OpenAI (Whisper API)
openai_client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

print("[SYSTEM] Cloud APIs initialized successfully.")

# Initialize FastAPI application
app = FastAPI(title="Bob's Special Blend API", version="2.0")

# Configure CORS to allow cross-origin requests from the frontend app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 2. Database & Knowledge Base Loading
# ==========================================
COCKTAILS_DB = []
IP_RATE_LIMIT = {}
MAX_REQUESTS_PER_HOUR = 15

# Resolve absolute path to the local JSON database
db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'FINAL_COCKTAIL_PHYSICS_DB.json')

try:
    with open(db_path, "r", encoding="utf-8") as f:
        COCKTAILS_DB = json.load(f)
    print(f"[SYSTEM] Successfully loaded {len(COCKTAILS_DB)} cocktails into memory.")
except Exception as e:
    print(f"[ERROR] Failed to load database: {e}")

# Build a fast-lookup dictionary for unique base ingredients
INGREDIENTS_DICT = {}
for drink in COCKTAILS_DB:
    for comp in drink.get("components", []):
        name_lower = comp["ingredient_name"].lower()
        if name_lower not in INGREDIENTS_DICT:
            INGREDIENTS_DICT[name_lower] = {
                "original_name": comp["ingredient_name"],
                "category": comp["category"],
                "physics": comp["physics_baseline"]
            }
print(f"[SYSTEM] Extracted {len(INGREDIENTS_DICT)} unique base ingredients.")


# ==========================================
# 3. Pydantic Models (Data Validation)
# ==========================================
class RecipeComponent(BaseModel):
    ingredient_name: str
    volume_ml: float


class SimulateDBRequest(BaseModel):
    recipe_name: str
    method: str
    components: List[RecipeComponent]


class BobChatRequest(BaseModel):
    user_message: str


class MatchRequest(BaseModel):
    inventory: List[str]


# ==========================================
# 4. Core Routing & Matching Engine
# ==========================================
@app.get("/api/v2/recipes")
def get_all_recipes():
    """Retrieve a lightweight list of all available recipes."""
    data = [{"id": i, "name": c.get("name"), "glass_type": c.get("glass_type")} for i, c in enumerate(COCKTAILS_DB)]
    return {"status": "success", "count": len(data), "data": data}


@app.get("/api/v2/recipes/{recipe_id}")
def get_recipe(recipe_id: int):
    """Retrieve detailed information for a specific recipe by ID."""
    if recipe_id < 0 or recipe_id >= len(COCKTAILS_DB):
        raise HTTPException(status_code=404, detail="Recipe not found")

    recipe = COCKTAILS_DB[recipe_id].copy()
    recipe["id"] = recipe_id
    return {"status": "success", "data": recipe}


@app.get("/api/v2/ingredients")
def get_all_ingredients():
    """Retrieve all ingredients grouped by their respective categories."""
    grouped = {}
    for data in INGREDIENTS_DICT.values():
        cat = data["category"] or "Others"
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(data["original_name"])

    # Sort ingredients alphabetically within each category
    for cat in grouped:
        grouped[cat] = sorted(list(set(grouped[cat])))

    return {"status": "success", "data": grouped, "total": len(INGREDIENTS_DICT)}


@app.post("/api/v2/match")
def match_cocktails(req: MatchRequest):
    """Match user's inventory against the recipe database to find makeable cocktails."""
    user_inv_set = set([i.lower() for i in req.inventory])
    perfect_matches = []
    almost_matches = []

    for idx, c in enumerate(COCKTAILS_DB):
        recipe_comps = c.get("components", [])
        if not recipe_comps:
            continue

        req_ings = set([comp["ingredient_name"].lower() for comp in recipe_comps])
        missing = req_ings - user_inv_set
        missing_count = len(missing)

        missing_original = [comp["ingredient_name"] for comp in recipe_comps if
                            comp["ingredient_name"].lower() in missing]

        recipe_summary = {
            "id": idx,
            "name": c.get("name"),
            "glass_type": c.get("glass_type"),
            "missing_count": missing_count,
            "missing_ingredients": missing_original
        }

        # Categorize matches based on missing ingredient count
        if missing_count == 0:
            perfect_matches.append(recipe_summary)
        elif missing_count <= 2:
            almost_matches.append(recipe_summary)

    # Sort 'almost matches' so the closest ones appear first
    almost_matches.sort(key=lambda x: x["missing_count"])

    return {
        "status": "success",
        "perfect_matches": perfect_matches,
        "almost_matches": almost_matches
    }


def color_distance(rgb1, rgb2):
    """Calculate the Euclidean distance between two RGB color vectors."""
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(rgb1, rgb2)))


@app.get("/api/v2/substitute")
def find_substitute(ingredient: str, limit: int = 3):
    """Find the best ingredient substitutes based on physical properties (ABV, Brix, pH, Color)."""
    target = INGREDIENTS_DICT.get(ingredient.lower())
    if not target:
        raise HTTPException(status_code=404, detail="Ingredient not found in database")

    candidates = []
    for name, data in INGREDIENTS_DICT.items():
        if name == ingredient.lower() or data["category"] != target["category"]:
            continue

        # Calculate absolute differences across physical properties
        diff_abv = abs(target["physics"]["abv"] - data["physics"]["abv"])
        diff_brix = abs(target["physics"]["brix"] - data["physics"]["brix"])
        diff_ph = abs(target["physics"]["ph"] - data["physics"]["ph"]) * 5  # Apply weight to pH
        c_dist = color_distance(target["physics"]["color_rgb"], data["physics"]["color_rgb"]) / 25.5

        # Compute a normalized match score (Higher is better)
        candidates.append({
            "ingredient_name": data["original_name"],
            "match_score": max(0, 100 - int((diff_abv + diff_brix + diff_ph + c_dist) * 2)),
            "physics_baseline": data["physics"]
        })

    candidates.sort(key=lambda x: x["match_score"], reverse=True)
    return {"status": "success", "target": target["original_name"], "substitutes": candidates[:limit]}


# ==========================================
# 5. Physics Simulation Engine
# ==========================================
def run_physics_simulation(recipe_name: str, method: str, components: List[dict]):
    """
    Simulate the final physical properties of a cocktail post-mixing.
    Calculates final volume, ABV, Brix, opacity, and subtractive RGB color blending.
    """
    extracted_ingredients = []

    for comp in components:
        db_ing = INGREDIENTS_DICT.get(comp["ingredient_name"].lower())
        if not db_ing:
            continue

        phys = db_ing["physics"]
        extracted_ingredients.append({
            "name": db_ing["original_name"],
            "volume_ml": comp["volume_ml"],
            "abv": phys.get("abv", 0),
            "brix": phys.get("brix", 0),
            "ph": phys.get("ph", 7),
            "opacity": phys.get("opacity", 0),
            "color_rgb": phys.get("color_rgb", [255, 255, 255])
        })

    if not extracted_ingredients:
        return None

    init_vol = sum(i["volume_ml"] for i in extracted_ingredients)
    pure_alc = sum(i["volume_ml"] * (i["abv"] / 100) for i in extracted_ingredients)
    sugar_mass = sum(i["volume_ml"] * i["brix"] for i in extracted_ingredients)
    init_abv = pure_alc / init_vol if init_vol > 0 else 0

    # Determine dilution factor based on preparation method and initial ABV
    if method == "shaken":
        dilution_factor = 0.25 + (init_abv * 0.1)
    elif method == "stirred":
        dilution_factor = 0.15 + (init_abv * 0.05)
    else:
        dilution_factor = 0.0

    final_vol = init_vol * (1 + dilution_factor)

    # Subtractive color mixing using logarithmic absorption (Beer-Lambert Law approximation)
    total_abs_R = sum(-math.log10(max(i["color_rgb"][0], 1) / 255.0) * i["volume_ml"] for i in extracted_ingredients)
    total_abs_G = sum(-math.log10(max(i["color_rgb"][1], 1) / 255.0) * i["volume_ml"] for i in extracted_ingredients)
    total_abs_B = sum(-math.log10(max(i["color_rgb"][2], 1) / 255.0) * i["volume_ml"] for i in extracted_ingredients)

    # Reconstruct final RGB values, clamping strictly between 0 and 255
    final_rgb = [
        int(min(max((10 ** -(total_abs_R / final_vol)) * 255, 0), 255)),
        int(min(max((10 ** -(total_abs_G / final_vol)) * 255, 0), 255)),
        int(min(max((10 ** -(total_abs_B / final_vol)) * 255, 0), 255))
    ]

    return {
        "recipe_name": recipe_name,
        "final_volume_ml": round(final_vol, 1),
        "final_abv_percent": round((pure_alc / final_vol) * 100, 1),
        "final_brix": round((sugar_mass / final_vol), 1),
        "final_rgb": final_rgb,
        "final_opacity_percent": round(
            (sum(i["volume_ml"] * i["opacity"] for i in extracted_ingredients) / final_vol) * 100, 1)
    }


# ==========================================
# 6. Whisper Audio Transcription (Cloud)
# ==========================================
@app.post("/api/v2/transcribe")
async def transcribe_audio(request: Request, audio_file: UploadFile = File(...)):
    """Process incoming audio files and transcribe them using OpenAI's Whisper API."""
    # --- Rate Limiting Logic ---
    client_ip = request.client.host
    current_time = time.time()

    if client_ip not in IP_RATE_LIMIT or current_time > IP_RATE_LIMIT[client_ip]["reset_time"]:
        IP_RATE_LIMIT[client_ip] = {"count": 0, "reset_time": current_time + 3600}

    if IP_RATE_LIMIT[client_ip]["count"] >= MAX_REQUESTS_PER_HOUR:
        print(f"[RATE LIMIT] Blocked IP (Transcription): {client_ip}")
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")

    IP_RATE_LIMIT[client_ip]["count"] += 1
    # ---------------------------

    with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as tmp:
        tmp.write(await audio_file.read())
        tmp_path = tmp.name

    try:
        print(f"[AUDIO] Sending audio stream to Cloud Whisper: {audio_file.filename}")
        with open(tmp_path, "rb") as f:
            result = openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=f
            )
        text = result.text.strip()
        print(f"[AUDIO] Transcription success: {text}")
        return {"status": "success", "text": text}
    except Exception as e:
        print(f"[ERROR] Transcription failed: {e}")
        return {"status": "error", "detail": str(e)}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


# ==========================================
# 7. Bob's Cognitive Core (LLM Integration)
# ==========================================
@app.post("/api/v2/chat_with_bob")
async def chat_with_bob(req: BobChatRequest, request: Request):
    """Handle conversational AI requests via Groq, incorporating rate limiting and strict JSON output formatting."""
    # --- Rate Limiting Logic ---
    client_ip = request.client.host
    current_time = time.time()

    # Reset counter if IP is new or the 1-hour window has expired
    if client_ip not in IP_RATE_LIMIT or current_time > IP_RATE_LIMIT[client_ip]["reset_time"]:
        IP_RATE_LIMIT[client_ip] = {"count": 0, "reset_time": current_time + 3600}

    # Block request if the limit is exceeded
    if IP_RATE_LIMIT[client_ip]["count"] >= MAX_REQUESTS_PER_HOUR:
        print(f"[RATE LIMIT] Blocked IP (Chat): {client_ip}")
        raise HTTPException(status_code=429, detail="Bob is taking a break. Please try again later.")

    # Increment counter upon successful check
    IP_RATE_LIMIT[client_ip]["count"] += 1
    # ---------------------------

    cocktail_names = [c["name"] for c in COCKTAILS_DB]
    available_cocktails_str = ", ".join(cocktail_names)

    system_prompt = f"""
    You are Bob, a veteran bartender who has been working at this corner bar for 30 years. You have sharp hospitality instincts, know how to read your customers' emotions, and speak directly, a bit roughly, but with genuine empathy.

    [Available Cocktail Menu]:
    {available_cocktails_str}

    [Bob's Rules of Conduct]:
    1. EMPATHY FIRST: Respond to the customer's mood like an old friend. Console them if they are sad, celebrate if they are happy.
    2. RECOMMENDATION: Recommend a cocktail based on their needs. You MUST choose exactly ONE cocktail from the [Available Cocktail Menu]. DO NOT invent new drinks.
    3. Explain exactly WHY you recommend it, and describe its FLAVOR PROFILE.
    4. IF NO drink is needed (e.g. just a greeting), leave the recommended_cocktail_name empty.

    [Mandatory Output Format]:
    Strictly return a JSON object. Do NOT output any extra markdown. Use the following structure:
    {{
        "bob_comment": "<Your full response: Empathy + Reason for recommendation + Flavor profile>",
        "recommended_cocktail_name": "<Exact name from the menu, or empty string>"
    }}
    """

    try:
        # Request generation from Groq with a strict token limit to control costs
        response = await groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.user_message}
            ],
            temperature=0.5,
            max_tokens=150,  # Enforce maximum token usage per request
            response_format={"type": "json_object"}
        )

        # Parse and clean up potential markdown formatting from the LLM output
        raw_content = response.choices[0].message.content.strip()

        if raw_content.startswith("```json"):
            raw_content = raw_content[7:]
        elif raw_content.startswith("```"):
            raw_content = raw_content[3:]
        if raw_content.endswith("```"):
            raw_content = raw_content[:-3]

        bob_recipe = json.loads(raw_content.strip())
        rec_name = bob_recipe.get("recommended_cocktail_name", "").strip()

        matched_recipe = None
        matched_id = None

        # Cross-reference recommended cocktail with the local database
        if rec_name:
            for idx, c in enumerate(COCKTAILS_DB):
                if c["name"].lower() == rec_name.lower():
                    matched_recipe = c
                    matched_id = idx
                    break

            # Fallback: Fuzzy matching if exact name match fails
            if not matched_recipe:
                for idx, c in enumerate(COCKTAILS_DB):
                    if rec_name.lower() in c["name"].lower() or c["name"].lower() in rec_name.lower():
                        matched_recipe = c
                        matched_id = idx
                        break

        if matched_recipe:
            return {
                "status": "success",
                "bob_says": bob_recipe.get("bob_comment", "Here you go."),
                "recipe_id": matched_id,
                "recipe_name": matched_recipe["name"],
                "glass_type": matched_recipe.get("glass_type", "Standard")
            }
        else:
            return {
                "status": "success",
                "bob_says": bob_recipe.get("bob_comment", "I'm just here to chat."),
            }

    except Exception as e:
        print(f"[ERROR] Bob Cognitive Core failure: {e}")
        raise HTTPException(status_code=500, detail=f"Bob is sleeping... ({str(e)})")


if __name__ == "__main__":
    # Start the local development server
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)