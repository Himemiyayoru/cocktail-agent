import json
import math
import os
import time
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from openai import AsyncOpenAI, OpenAI
from dotenv import load_dotenv

if __package__:
    from . import billing, store_receipts
    from .recommendations import find_exact_recipe, match_recipes, normalize_inventory, normalize_name, rank_substitutes
else:
    import billing
    import store_receipts
    from recommendations import find_exact_recipe, match_recipes, normalize_inventory, normalize_name, rank_substitutes

# Load environment variables from .env file
load_dotenv()

# ==========================================
# 1. Cloud Model Initialization (Groq & OpenAI)
# ==========================================
# Groq decommissioned llama-3.1-8b-instant on 2026-08-16.
# gpt-oss-20b is the recommended replacement and supports JSON mode.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

# Catalog, inventory, and substitution tools remain available without AI keys.
groq_api_key = (os.getenv("GROQ_API_KEY") or "").strip()
openai_api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
groq_client = AsyncOpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=groq_api_key,
    max_retries=0,
) if groq_api_key else None

# Initialize synchronous client for OpenAI (Whisper API)
openai_client = OpenAI(
    api_key=openai_api_key,
    max_retries=0,
) if openai_api_key else None

print("[SYSTEM] Optional cloud clients configured.")

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
        name_lower = normalize_name(comp["ingredient_name"])
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
    user_message: str = Field(min_length=1, max_length=4000)
    inventory: Optional[List[str]] = None
    use_inventory: bool = False


class BobSubscriptionRequest(BaseModel):
    platform: str
    product_id: str
    purchase_token: str = Field(min_length=1, max_length=20000)


def require_bob_subscriber(request: Request) -> str:
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    state, account_id = billing.access_state(token)
    if state == "expired":
        raise HTTPException(status_code=402, detail=billing.EXPIRED_MESSAGE)
    if state != "active" or account_id is None:
        raise HTTPException(status_code=401, detail=billing.PAYWALL_MESSAGE)
    return account_id


def with_allowance(account_id, payload):
    payload.update(billing.public_allowance(account_id))
    return payload


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


@app.get("/health")
def health():
    """Report readiness only when the catalog and billing storage are accessible."""
    if not COCKTAILS_DB:
        raise HTTPException(status_code=503, detail="The recipe catalog is unavailable.")
    try:
        billing.check_storage()
    except (RuntimeError, OSError, billing.sqlite3.Error) as exc:
        print(f"[STORAGE] Billing readiness check failed: {exc}")
        raise HTTPException(status_code=503, detail="Billing storage is unavailable.") from exc
    return {"status": "ok", "billing_storage": "ready", "commit": os.getenv("RENDER_GIT_COMMIT")}


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
    return {"status": "success", **match_recipes(COCKTAILS_DB, req.inventory)}


@app.get("/api/v2/substitute")
def find_substitute(
    ingredient: str,
    limit: int = Query(default=3, ge=1, le=20),
    inventory: Optional[List[str]] = Query(default=None),
):
    """Offer same-category alternatives, prioritizing ingredients already owned."""
    target = INGREDIENTS_DICT.get(normalize_name(ingredient))
    if not target:
        raise HTTPException(status_code=404, detail="Ingredient not found in database")

    candidates = rank_substitutes(INGREDIENTS_DICT, ingredient, inventory or [])
    return {
        "status": "success",
        "target": target["original_name"],
        "substitutes": candidates[:limit],
        "score_description": "Physical similarity only (ABV, sugar, acidity, and color). Flavor and recipe balance may change.",
    }


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
@app.get("/api/v2/bob/access")
def bob_access(request: Request):
    account_id = require_bob_subscriber(request)
    return {"status": "success", **billing.public_allowance(account_id)}


@app.post("/api/v2/bob/subscription")
def activate_bob_subscription(req: BobSubscriptionRequest):
    try:
        account_id, expires_at = store_receipts.verify(req.platform, req.product_id, req.purchase_token)
        token = billing.activate_subscription(account_id, expires_at)
    except store_receipts.BillingNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (store_receipts.InvalidReceipt, ValueError) as exc:
        raise HTTPException(status_code=402, detail=billing.PAYWALL_MESSAGE) from exc
    return {"status": "success", "access_token": token, **billing.public_allowance(account_id)}


@app.post("/api/v2/transcribe")
async def transcribe_audio(request: Request, audio_file: UploadFile = File(...)):
    """Meter chat and voice against the same server-side monthly allowance."""
    account_id = require_bob_subscriber(request)
    if openai_client is None:
        raise HTTPException(status_code=503, detail="Voice transcription is unavailable. You can still type your message.")
    from starlette.concurrency import run_in_threadpool
    try:
        from .audio_meter import prepare_audio
    except ImportError:
        from audio_meter import prepare_audio
    payload = await audio_file.read(10 * 1024 * 1024 + 1)
    if len(payload) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Please record a shorter message (maximum 2 minutes).")
    try:
        wav, seconds = await run_in_threadpool(prepare_audio, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Whisper: $0.006/minute, rounded up to a whole second.
    reserved = math.ceil(seconds) * 100_000
    period_id = billing.try_reserve(account_id, reserved)
    if not period_id:
        raise HTTPException(status_code=402, detail=billing.CAP_MESSAGE)
    try:
        result = await run_in_threadpool(
            openai_client.audio.transcriptions.create,
            model="whisper-1", file=("voice.wav", wav, "audio/wav"),
        )
        # Normalized PCM duration is known before sending; no client duration trusted.
        return with_allowance(account_id, {"status": "success", "text": result.text.strip()})
    except Exception as exc:
        # Keep the reservation: connection loss does not prove the call was unbilled.
        raise HTTPException(status_code=502, detail="Transcription could not finish. Please try again.") from exc


# ==========================================
# 7. Bob's Cognitive Core (LLM Integration)
# ==========================================
@app.post("/api/v2/chat_with_bob")
async def chat_with_bob(req: BobChatRequest, request: Request):
    """Handle conversational AI requests via Groq, incorporating rate limiting and strict JSON output formatting."""
    account_id = require_bob_subscriber(request)
    inventory = req.inventory or []
    candidates = list(enumerate(COCKTAILS_DB))
    if req.use_inventory:
        if not normalize_inventory(inventory):
            return with_allowance(account_id, {
                "status": "success",
                "bob_says": "Your cabinet is empty. Add the ingredients you have in My Cabinet, or turn off 'Use only my cabinet' to explore the full menu.",
                "recommendation_status": "empty_inventory",
            })
        makeable_ids = {item["id"] for item in match_recipes(COCKTAILS_DB, inventory)["perfect_matches"]}
        candidates = [(recipe_id, recipe) for recipe_id, recipe in candidates if recipe_id in makeable_ids]
        if not candidates:
            return with_allowance(account_id, {
                "status": "success",
                "bob_says": "I don't have a complete recipe for what's in your cabinet yet. Check the missing ingredients in My Cabinet, add more supplies, or turn off 'Use only my cabinet' to explore the full menu.",
                "recommendation_status": "no_available_recipes",
            })
    if not candidates:
        return with_allowance(account_id, {
            "status": "success",
            "bob_says": "The recipe catalog is unavailable right now. Please try again later.",
            "recommendation_status": "no_available_recipes",
        })
    if groq_client is None:
        raise HTTPException(status_code=503, detail="Bob's chat is unavailable. You can still browse recipes and match your cabinet.")

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

    cocktail_names = [recipe["name"] for _, recipe in candidates]
    available_cocktails_str = ", ".join(cocktail_names)
    inventory_rule = (
        "The menu has already been filtered to recipes the customer can make with their shelf. Do not suggest any other drink or extra ingredients."
        if req.use_inventory else
        "The customer is exploring the full menu. Do not claim they already own the required ingredients."
    )

    system_prompt = f"""
    You are Bob, a veteran bartender who has been working at this corner bar for 30 years. You have sharp hospitality instincts, know how to read your customers' emotions, and speak directly, a bit roughly, but with genuine empathy.

    [Available Cocktail Menu]:
    {available_cocktails_str}
    {inventory_rule}

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
        prompt_characters = len(system_prompt.encode("utf-8")) + len(req.user_message.encode("utf-8"))
        try:
            reserved = billing.estimate_request_nano(GROQ_MODEL, prompt_characters, 512)
        except billing.UnknownModelPrice as exc:
            raise HTTPException(status_code=503, detail="Bob's model price is not configured, so chat is paused.") from exc
        period_id = billing.try_reserve(account_id, reserved)
        if not period_id:
            raise HTTPException(status_code=402, detail=billing.CAP_MESSAGE)
        try:
            response = await groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": req.user_message}
                ],
                temperature=0.5,
                max_completion_tokens=512,
                response_format={"type": "json_object"},
                extra_body={
                    "reasoning_effort": "low",
                    "reasoning_format": "hidden",
                },
            )
            actual = billing.usage_nano(GROQ_MODEL, getattr(response, "usage", None))
            billing.settle(account_id, reserved, reserved if actual is None else actual, period_id)
        except Exception:
            # A timeout may still incur provider charges; keep the reservation.
            # No automatic retries are allowed on paid provider calls.
            raise

        raw_content = (response.choices[0].message.content or "").strip()
        if not raw_content:
            raise RuntimeError("Model returned an empty reply")

        if raw_content.startswith("```json"):
            raw_content = raw_content[7:]
        elif raw_content.startswith("```"):
            raw_content = raw_content[3:]
        if raw_content.endswith("```"):
            raw_content = raw_content[:-3]

        bob_recipe = json.loads(raw_content.strip())
        if not isinstance(bob_recipe, dict):
            raise ValueError("Model reply must be an object")
        rec_name = bob_recipe.get("recommended_cocktail_name", "")
        bob_comment = bob_recipe.get("bob_comment")
        if not isinstance(rec_name, str) or not isinstance(bob_comment, str) or not bob_comment.strip():
            raise ValueError("Model reply fields are invalid")

        matched = find_exact_recipe(candidates, rec_name)
        if rec_name.strip() and matched is None:
            return with_allowance(account_id, {
                "status": "success",
                "bob_says": "I couldn't verify that recommendation against the available menu. Try asking again, or pick a recipe from the library.",
                "recommendation_status": "unavailable_recommendation",
            })
        if matched is not None:
            matched_id, matched_recipe = matched
            return with_allowance(account_id, {
                "status": "success",
                "bob_says": bob_comment.strip(),
                "recipe_id": matched_id,
                "recipe_name": matched_recipe["name"],
                "glass_type": matched_recipe.get("glass_type", "Standard"),
                "recommendation_status": "recommended",
            })
        return with_allowance(account_id, {
            "status": "success",
            "bob_says": bob_comment.strip(),
            "recommendation_status": "no_recommendation",
        })

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Bob Cognitive Core failure: {e}")
        raise HTTPException(status_code=502, detail="Bob couldn't finish that reply. Please try again, or browse recipes while chat is unavailable.") from e


if __name__ == "__main__":
    # Start the local development server
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
