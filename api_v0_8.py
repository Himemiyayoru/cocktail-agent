import math
import json
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import or_
from openai import AsyncOpenAI


# 导入数据库模块 (确保同目录下有 database.py)
from database import SessionLocal, Ingredient, Recipe, RecipeItem

# ==========================================
# 🔌 初始化本地大模型客户端 (Ollama)
# ==========================================
# 拔掉云端网线，接入本地 11434 端口
client = AsyncOpenAI(
    base_url="http://localhost:11434/v1",
    api_key="bob-is-local"  # 本地推理不需要真实的 Key
)

app = FastAPI(title="Cocktail Physics & Bob AI API (Local Edition)", version="0.8")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # 新增引入

app = FastAPI(title="Cocktail AI Agent API")

# ==== 新增：允许跨域请求 (CORS) ====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有前端地址（开发环境非常方便）
    allow_credentials=True,
    allow_methods=["*"],  # 允许 GET, POST, OPTIONS 等所有方法
    allow_headers=["*"],  # 允许所有请求头
)
# ==================================

# 下面是你原本的路由代码...
# @app.get("/api/v2/recipes/featured")

# 依赖注入：获取数据库会话
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# 🧱 Pydantic 请求数据模型
# ==========================================
class RecipeComponent(BaseModel):
    ingredient_name: str = Field(..., description="数据库中的成分名称")
    volume_ml: float = Field(..., gt=0, description="液体体积")


class SimulateDBRequest(BaseModel):
    recipe_name: str
    method: str = Field(..., pattern="^(shake|stir|build)$")
    components: List[RecipeComponent]


class InventoryRequest(BaseModel):
    owned_ingredients: List[str] = Field(..., description="用户拥有的材料名称列表")
    allow_missing: int = Field(default=0, ge=0, description="允许缺少的最大材料数")


class BobChatRequest(BaseModel):
    user_message: str = Field(..., description="用户对 Bob 说的话")


# ==========================================
# 🟢 Tab 1 接口：首页瀑布流与配方搜索
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
        raise HTTPException(status_code=404, detail="找不到该配方")

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
# 🔵 Tab 2 接口：库存匹配引擎
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
# ⚙️ 核心基建：物理与流体推演引擎
# ==========================================
@app.post("/api/v2/simulate_from_db")
def simulate_from_db(req: SimulateDBRequest, db: Session = Depends(get_db)):
    extracted_ingredients = []
    for comp in req.components:
        db_ing = db.query(Ingredient).filter(Ingredient.name == comp.ingredient_name).first()
        if not db_ing:
            raise HTTPException(status_code=404, detail=f"图谱缺失：找不到成分 '{comp.ingredient_name}'")
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
# 🤖 Tab 3 接口：Bob 的本地智能吧台
# ==========================================
@app.post("/api/v2/chat_with_bob")
async def chat_with_bob(req: BobChatRequest, db: Session = Depends(get_db)):
    all_ingredients = db.query(Ingredient).all()
    ingredient_context = "\n".join(
        [f"- {i.name} (分类: {i.category}, ABV: {i.abv * 100}%, Brix: {i.brix}, 浊度: {i.opacity})" for i in
         all_ingredients])

    system_prompt = f"""
    You are Bob, a veteran bartender who has been working at this corner bar for 30 years. You have sharp hospitality instincts, know how to read your customers' emotions, and speak directly, a bit roughly, but with genuine empathy.
    You also have a precise molecular chemistry calculator in your head. You deeply care about the physical balance of liquids (acid/sweet ratio, ABV, optical colors).

    [Your Bar Inventory]:
    {ingredient_context}

    [Bob's Rules of Conduct]:
    1. Respond to the customer's mood like an old friend. Give them hardcore comfort if they are down, or roast them humorously if they propose absurd physical proportions.
    2. Provide a physically accurate and perfectly balanced recipe. As a professional bartender, your recipe MUST NEVER be just a single straight spirit! It MUST contain at least 2 to 3 different ingredients combined!
    3. You can ONLY use ingredients that exist in [Your Bar Inventory].

    [Mandatory Output Format]:
    Strictly return a JSON object. Do NOT output any extra markdown. Use the following structure as a template, but GENERATE YOUR OWN UNIQUE VALUES based on the user's current input:
    {{
        "recipe_name": "<Generate a cool custom name for the drink>",
        "method": "<shake or stir>",
        "components": [
            {{"ingredient_name": "<Ingredient 1 from inventory>", "volume_ml": 45}},
            {{"ingredient_name": "<Ingredient 2 from inventory>", "volume_ml": 15}}
        ],
        "bob_comment": "<Your actual conversational response to whatever the user just said>"
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

        # ==== 🌟 新增：暴力清洗大模型的 Markdown 残留 ====
        raw_content = response.choices[0].message.content.strip()

        # 移除可能包含的 ```json 和 ``` 标记
        if raw_content.startswith("```json"):
            raw_content = raw_content[7:]
        elif raw_content.startswith("```"):
            raw_content = raw_content[3:]

        if raw_content.endswith("```"):
            raw_content = raw_content[:-3]

        raw_content = raw_content.strip()
        # ==================================================

        bob_recipe = json.loads(raw_content)

        # ==== 🌟 核心修复：物理引擎容错降级机制 ====
        components = bob_recipe.get("components", [])
        physics_result = None

        # 只有当大模型真的给出了配方材料时，才去调动物理引擎
        if len(components) > 0:
            try:
                simulation_req = SimulateDBRequest(
                    recipe_name=bob_recipe.get("recipe_name", "Bob's Special"),
                    method=bob_recipe.get("method", "shake"),
                    components=[RecipeComponent(**c) for c in components]
                )
                physics_result = simulate_from_db(simulation_req, db)
            except Exception as e:
                # 如果大模型出现了“幻觉”（捏造了库里没有的原料），或者引发了零除异常，直接拦截！
                # 不让后端崩溃，而是跳过物理推演，仅保留聊天文本。
                print(f"⚠️ Physics Engine bypassed due to LLM irregularity: {e}")

        return {
            "status": "success",
            "bob_says": bob_recipe.get("bob_comment", "There you go, buddy."),
            "recipe_data": components,
            "physics_metrics": physics_result
        }
        # ==================================================

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Bob JSON parsing failed.")
    except Exception as e:
        # 如果走到这里，说明是网络或其他严重故障
        raise HTTPException(status_code=500, detail=f"System offline: {str(e)}")