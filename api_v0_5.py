from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Tuple
import math


# 1. 定义前端传入的数据结构 (Pydantic 验证)
class IngredientInput(BaseModel):
    name: str
    volume_ml: float = Field(..., gt=0, description="液体体积")
    abv: float = Field(..., ge=0, le=1.0, description="酒精度百分比 (0-1)")
    brix: float = Field(..., ge=0, description="糖度")
    ph: float = Field(..., ge=0, le=14)
    color_rgb: Tuple[int, int, int]
    opacity: float = Field(..., ge=0, le=1.0)


class RecipeRequest(BaseModel):
    recipe_name: str
    method: str = Field(..., pattern="^(shake|stir|build)$")
    ingredients: List[IngredientInput]


# 2. 初始化 FastAPI 应用
app = FastAPI(title="Cocktail Physics & Flavor API", version="0.5")


# 3. 简化的物理引擎函数 (移植自我们的 v0.3)
def simulate_physics(req: RecipeRequest) -> dict:
    init_vol = sum(i.volume_ml for i in req.ingredients)
    pure_alc = sum(i.volume_ml * i.abv for i in req.ingredients)
    sugar_mass = sum(i.volume_ml * i.brix for i in req.ingredients)

    init_abv = pure_alc / init_vol if init_vol > 0 else 0

    if req.method == "shake":
        dilution_factor = 0.25 + (init_abv * 0.1)
    elif req.method == "stir":
        dilution_factor = 0.15 + (init_abv * 0.05)
    else:
        dilution_factor = 0.0

    final_vol = init_vol * (1 + dilution_factor)

    # 光学与浊度
    total_abs_R = sum(-math.log10(max(i.color_rgb[0], 1) / 255.0) * i.volume_ml for i in req.ingredients)
    total_abs_G = sum(-math.log10(max(i.color_rgb[1], 1) / 255.0) * i.volume_ml for i in req.ingredients)
    total_abs_B = sum(-math.log10(max(i.color_rgb[2], 1) / 255.0) * i.volume_ml for i in req.ingredients)

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
        "final_opacity_percent": round((sum(i.volume_ml * i.opacity for i in req.ingredients) / final_vol) * 100, 1)
    }


# 4. 暴露 API 路由端点
@app.post("/api/v1/simulate")
async def run_simulation(request: RecipeRequest):
    try:
        result = simulate_physics(request)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))