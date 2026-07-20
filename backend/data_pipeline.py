import requests
import json
import time
import os
import string
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

# ==========================================
# Configuration
# ==========================================
TCDB_API_URL = "https://www.thecocktaildb.com/api/json/v1/1/search.php?f="
openai_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=openai_key)
MODEL_NAME = "gpt-4o-mini"

SYSTEM_PROMPT = """
You are a master mixologist, a food scientist, and a cocktail historian.
I will give you a raw cocktail recipe from an old database.
Your job is to normalize this recipe into a highly structured, scientifically accurate JSON format.

RULES:
1. MEASUREMENTS: Convert ALL raw measurements into strict milliliters (ml) integers. (Assume 1 oz = 30ml, 1 dash = 1ml). If it says "fill to top", estimate a reasonable remaining volume for the recommended glass.
2. ICE LOGIC: Deduce the ICE requirement by reading the instructions.
3. PHYSICS: Estimate 'Brix' (0-100) and 'pH' (0-14). 
   CRITICAL FOR OPACITY: 0.0 means completely CLEAR/TRANSPARENT (like water, vodka, light rum). 1.0 means completely OPAQUE (like milk, Baileys, cream). Adjust accordingly!
4. GLASS TYPE: You MUST output ONLY one of these exact string keys: ["highball", "rocks", "martini", "coupe", "flute", "nicknora", "shot"].
5. DESCRIPTION & INSTRUCTIONS: Write a short engaging history, and break instructions into an array.
6. OUTPUT STRICTLY VALID JSON. DO NOT wrap it in markdown code blocks. DO NOT output total_volume_ml, the frontend will calculate it dynamically.

EXPECTED JSON SCHEMA:
{
  "name": "string",
  "description": "string",
  "glass_type": "string (MUST match the exact keys provided)",
  "method": "string (shaken, stirred, build, blend)",
  "instructions": ["step 1", "step 2"],
  "ice_logic": {
    "uses_ice": boolean,
    "ice_in_glass_grams": number
  },
  "components": [
    {
      "ingredient_name": "string",
      "category": "string (spirit, liqueur, juice, syrup, modifier)",
      "volume_ml": number,
      "physics_baseline": {
        "abv": number,
        "brix": number,
        "ph": number,
        "opacity": number (0.0=clear, 1.0=opaque),
        "color_rgb": [R, G, B]
      }
    }
  ]
}
"""

def fetch_drinks_by_first_letter(char):
    """Fetch all cocktails under a specific starting letter from TCDB."""
    print(f"\n[INFO] Requesting TCDB for character: '{char.upper()}' ...")
    try:
        response = requests.get(TCDB_API_URL + char, timeout=15)
        data = response.json()
    except Exception as e:
        print(f"[ERROR] Network or parsing error: {e}")
        return []

    if data and isinstance(data.get('drinks'), list) and len(data['drinks']) > 0:
        return data['drinks']

    print(f"[WARN] No valid data found for character '{char.upper()}'.")
    return []

def format_raw_for_ai(raw_drink):
    """Format raw payload for LLM processing."""
    ingredients = []
    for i in range(1, 16):
        ing = raw_drink.get(f'strIngredient{i}')
        meas = raw_drink.get(f'strMeasure{i}')
        if ing and str(ing).strip():
            meas_str = str(meas).strip() if meas else "to taste"
            ingredients.append(f"- {meas_str} {ing}")

    raw_text = f"Name: {raw_drink.get('strDrink', 'Unknown')}\n"
    raw_text += f"Glass: {raw_drink.get('strGlass', 'Unknown')}\n"
    raw_text += f"Instructions: {raw_drink.get('strInstructions', 'None')}\n"
    raw_text += "Ingredients:\n" + "\n".join(ingredients)
    return raw_text

def normalize_with_cloud_ai(raw_text, drink_name):
    """Invoke OpenAI to clean and normalize the recipe."""
    print(f"[INFO] Estimating physics and historical data via AI: {drink_name} ...")
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Process this raw recipe into the required JSON schema:\n\n{raw_text}"}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        result_content = response.choices[0].message.content
        return json.loads(result_content)
    except Exception as e:
        print(f"[ERROR] AI processing failed: {e}")
        return None

def main():
    print("[START] Initializing industrial cocktail data pipeline...")
    os.makedirs("db_checkpoints", exist_ok=True)
    search_chars = string.ascii_lowercase + string.digits
    all_normalized_cocktails = []

    for char in search_chars:
        drinks = fetch_drinks_by_first_letter(char)
        if not drinks:
            continue

        print(f"[INFO] Found {len(drinks)} drinks under '{char.upper()}'. Processing...")
        letter_database = []

        for raw_drink in drinks:
            drink_name = raw_drink.get('strDrink', 'Unknown')
            raw_text = format_raw_for_ai(raw_drink)
            perfect_json = normalize_with_cloud_ai(raw_text, drink_name)

            if perfect_json:
                print(f"  [SUCCESS] Database entry created: {perfect_json.get('name', 'Unknown')}")
                letter_database.append(perfect_json)
                all_normalized_cocktails.append(perfect_json)

            # Rate limit protection
            time.sleep(1.5)

        if letter_database:
            checkpoint_path = f"db_checkpoints/cocktails_part_{char}.json"
            with open(checkpoint_path, "w", encoding="utf-8") as f:
                json.dump(letter_database, f, indent=2, ensure_ascii=False)
            print(f"[CHECKPOINT] '{char.upper()}' data backed up to {checkpoint_path}")

    with open("FINAL_COCKTAIL_PHYSICS_DB.json", "w", encoding="utf-8") as f:
        json.dump(all_normalized_cocktails, f, indent=2, ensure_ascii=False)

    print(f"\n[DONE] Pipeline execution completed successfully.")
    print(f"[SUMMARY] Total cocktails processed and physics estimated: {len(all_normalized_cocktails)}")

if __name__ == "__main__":
    main()