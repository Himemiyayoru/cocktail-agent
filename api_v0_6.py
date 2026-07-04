from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_  # 新增：用于数据库的"或"条件查询
import math

# 新增：除了 Ingredient，我们需要把 Recipe 和 RecipeItem 也导入进来
from database import SessionLocal, Ingredient, Recipe, RecipeItem


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------- 请求模型定义 -----------------
class RecipeComponent(BaseModel):
    ingredient_name: str = Field(..., description="数据库中的成分名称")
    volume_ml: float = Field(..., gt=0, description="液体体积")


class SimulateDBRequest(BaseModel):
    recipe_name: str
    method: str = Field(..., pattern="^(shake|stir|build)$")
    components: List[RecipeComponent]


app = FastAPI(title="Cocktail App API", version="0.6")


# ==========================================
# [新增] 接口 1：获取首页瀑布流推荐酒单
# ==========================================
@app.get("/api/v2/recipes/featured")
def get_featured_recipes(db: Session = Depends(get_db)):
    # 从数据库获取前 20 个配方
    recipes = db.query(Recipe).limit(20).all()

    result = []
    for r in recipes:
        result.append({
            "id": r.id,
            "name": r.name,
            "method": r.method,
            # 这里的图片 URL 先用假地址占位，前端拿到后可以渲染 UI
            "preview_image": f"https://mock-image-server.com/{r.name.replace(' ', '_').lower()}.jpg",
            "tags": ["Classic"]
        })
    return {"status": "success", "count": len(result), "data": result}


# ==========================================
# [新增] 接口 2：首页全局顶部搜索栏
# ==========================================
@app.get("/api/v2/recipes/search")
def search_recipes(query: str, db: Session = Depends(get_db)):
    search_term = f"%{query}%"

    # 核心查询逻辑：名字匹配，或者其包含的成分名字匹配
    results = db.query(Recipe).join(RecipeItem).join(Ingredient).filter(
        or_(
            Recipe.name.ilike(search_term),
            Ingredient.name.ilike(search_term)
        )
    ).distinct().all()

    data = [{"id": r.id, "name": r.name, "method": r.method} for r in results]
    return {"status": "success", "count": len(data), "data": data}


# ==========================================
# 接口 3：我们之前写好的核心物理推演引擎
# ==========================================
@app.post("/api/v2/simulate_from_db")
def simulate_from_db(req: SimulateDBRequest, db: Session = Depends(get_db)):
    extracted_ingredients = []

    for comp in req.components:
        db_ing = db.query(Ingredient).filter(Ingredient.name == comp.ingredient_name).first()
        if not db_ing:
            raise HTTPException(status_code=404, detail=f"图谱缺失：找不到成分 '{comp.ingredient_name}'")

        extracted_ingredients.append({
            "name": db_ing.name,
            "volume_ml": comp.volume_ml,
            "abv": db_ing.abv,
            "brix": db_ing.brix,
            "ph": db_ing.ph,
            "color_rgb": (db_ing.color_r, db_ing.color_g, db_ing.color_b),
            "opacity": db_ing.opacity
        })

    # --- 物理公式计算区 ---
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
# [新增] 接口 4：获取单个配方的完整详情 (用于详情页)
# ==========================================
@app.get("/api/v2/recipes/{recipe_id}")
def get_recipe_details(recipe_id: int, db: Session = Depends(get_db)):
    # 查找主配方
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="找不到该配方")

    # 查找该配方下的所有成分清单
    items = db.query(RecipeItem).filter(RecipeItem.recipe_id == recipe_id).all()

    components = []
    for item in items:
        # 获取成分的详细理化参数
        ing = db.query(Ingredient).filter(Ingredient.id == item.ingredient_id).first()
        components.append({
            "ingredient_name": ing.name,
            "category": ing.category,
            "volume_ml": item.volume_ml,
            "physics_baseline": {
                "abv": ing.abv,
                "brix": ing.brix,
                "opacity": ing.opacity,
                "color_rgb": [ing.color_r, ing.color_g, ing.color_b]
            }
        })

    return {
        "status": "success",
        "data": {
            "id": recipe.id,
            "name": recipe.name,
            "method": recipe.method,
            "components": components
        }
    }


# ----------------- Tab 2 请求模型 -----------------
class InventoryRequest(BaseModel):
    owned_ingredients: List[str] = Field(..., description="用户拥有的材料名称列表")
    allow_missing: int = Field(default=0, ge=0, description="允许缺少的最大材料数。0为严格匹配，1为允许缺1样")


# ==========================================
# [新增] 接口 5：Tab 2 核心功能 - 基于库存反向推演可做的酒
# ==========================================
@app.post("/api/v2/recipes/inventory_match")
def match_recipes_by_inventory(req: InventoryRequest, db: Session = Depends(get_db)):
    # 将用户拥有的材料转化为 Set 集合，方便做数学减法运算
    owned_set = set(req.owned_ingredients)

    # 提取数据库里所有的配方
    all_recipes = db.query(Recipe).all()

    results = []
    for r in all_recipes:
        # 获取这个配方需要的所有材料
        recipe_items = db.query(RecipeItem).filter(RecipeItem.recipe_id == r.id).all()
        recipe_ingredients = []
        for item in recipe_items:
            ing = db.query(Ingredient).filter(Ingredient.id == item.ingredient_id).first()
            if ing:
                recipe_ingredients.append(ing.name)

        recipe_set = set(recipe_ingredients)

        # 核心算法：用配方需要的集合 减去 用户拥有的集合 = 缺失的材料
        missing_ingredients = recipe_set - owned_set

        # 如果缺失的数量在用户允许的容错范围内（比如 allow_missing = 1）
        if len(missing_ingredients) <= req.allow_missing:
            # 计算匹配度百分比
            match_rate = 0
            if len(recipe_set) > 0:
                match_rate = round((len(recipe_set) - len(missing_ingredients)) / len(recipe_set) * 100, 1)

            results.append({
                "recipe_id": r.id,
                "recipe_name": r.name,
                "match_rate_percent": match_rate,
                "missing_count": len(missing_ingredients),
                "missing_items": list(missing_ingredients)  # 明确告诉前端缺了什么
            })

    # 按照匹配度从高到低排序，如果匹配度一样，把完全不缺材料的排在前面
    results.sort(key=lambda x: (x["match_rate_percent"], -x["missing_count"]), reverse=True)

    return {"status": "success", "count": len(results), "data": results}


import json
import os
from openai import AsyncOpenAI  # 引入 OpenAI 异步客户端

# 请确保你在环境变量中设置了 OPENAI_API_KEY，或者在这里直接传入 api_key="sk-..." (不推荐明文)
client = AsyncOpenAI()


# ----------------- Tab 3 请求模型 -----------------
class HimeChatRequest(BaseModel):
    user_message: str = Field(..., description="用户的自然语言需求")


# ==========================================
# [新增] 接口 6：Project Hime 核心代理引擎
# ==========================================
@app.post("/api/v2/chat_with_hime")
async def chat_with_hime(req: HimeChatRequest, db: Session = Depends(get_db)):
    # 1. 动态获取当前的知识图谱，让 Hime 知道“吧台里有什么”
    all_ingredients = db.query(Ingredient).all()
    ingredient_context = "\n".join([
        f"- {i.name} (分类: {i.category}, ABV: {i.abv * 100}%, 糖度 Brix: {i.brix}, 浊度: {i.opacity})"
        for i in all_ingredients
    ])

    # 2. 极其核心的 System Prompt (赋予 Hime 灵魂和边界)
    system_prompt = f"""
你叫 Project Hime，是一个具备物理学和化学知识的顶级分子调酒 AI 助理。
你的任务是听取用户的需求，并从【可用成分库】中挑选材料，精准设计出一份鸡尾酒配方。

【可用成分库】：
{ingredient_context}

【你的思考准则】：
1. 严格遵守物理规律。如果要“偏酸”，必须加入酸度高的果汁（如 Lime Juice）；如果要“度数低”，必须控制 Spirit（烈酒）的比例。
2. 只能使用【可用成分库】中存在的名字，绝对不能捏造不存在的成分！
3. 给出你作为调酒师的专业评价（hime_comment）。

【强制输出格式】：
你必须只输出一个合法的 JSON 对象，不要包含任何 markdown 标记（如 ```json），不要有任何前言后语。JSON 必须符合以下结构：
{{
    "recipe_name": "你为这杯酒起的名字",
    "method": "shake", // 只能是 shake, stir, build 之一
    "components": [
        {{"ingredient_name": "Tequila", "volume_ml": 30}},
        {{"ingredient_name": "Lime Juice", "volume_ml": 15}}
    ],
    "hime_comment": "Hime: 为您特调了这杯...它的口感将会..."
}}
"""

    try:
        # 3. 调用 LLM 大脑进行思考
        response = await client.chat.completions.create(
            model="gpt-4o",  # 建议使用极其聪明的模型来处理逻辑
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.user_message}
            ],
            temperature=0.7  # 给予一定的创造力
        )

        raw_output = response.choices[0].message.content.strip()

        # 4. 解析 Hime 输出的 JSON
        hime_recipe = json.loads(raw_output)

        # =========================================================
        # 魔法时刻：将 Hime 生成的配方，直接丢进我们的物理引擎进行校验！
        # =========================================================
        # 借用我们之前写好的 SimulateDBRequest 和 simulate_from_db 逻辑
        simulation_req = SimulateDBRequest(
            recipe_name=hime_recipe["recipe_name"],
            method=hime_recipe["method"],
            components=[RecipeComponent(**c) for c in hime_recipe["components"]]
        )

        physics_result = simulate_from_db(simulation_req, db)

        # 5. 返回给前端：Hime 的情感解说 + 冰冷的真实物理数据
        return {
            "status": "success",
            "hime_response": hime_recipe["hime_comment"],
            "ai_generated_recipe": hime_recipe["components"],
            "physics_simulation": physics_result  # 包含最终颜色、酒精度、糖度
        }

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Hime 的思维出现混乱，未能输出标准的配方格式。")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"内部系统错误: {str(e)}")