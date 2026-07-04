from database import SessionLocal, Ingredient, Recipe, RecipeItem

db = SessionLocal()

# 检查是否已经存在该配方，防止重复注入
if not db.query(Recipe).filter_by(name="Classic Margarita").first():
    print("正在向数据库注入经典玛格丽特配方...")

    # 1. 从数据库中捞出我们之前注入的基酒原料
    tequila = db.query(Ingredient).filter_by(name="Tequila").first()
    cointreau = db.query(Ingredient).filter_by(name="Cointreau").first()
    lime = db.query(Ingredient).filter_by(name="Lime Juice").first()

    if not all([tequila, cointreau, lime]):
        print("❌ 注入失败：找不到基础原料。请确保你之前运行过 seed_db.py")
    else:
        # 2. 创建主配方记录
        margarita = Recipe(name="Classic Margarita", method="shake")
        db.add(margarita)
        db.commit()  # 提交以获取自增的 ID
        db.refresh(margarita)

        # 3. 创建配方与原料的关联记录 (记录具体的毫升数)
        items = [
            RecipeItem(recipe_id=margarita.id, ingredient_id=tequila.id, volume_ml=50.0),
            RecipeItem(recipe_id=margarita.id, ingredient_id=cointreau.id, volume_ml=20.0),
            RecipeItem(recipe_id=margarita.id, ingredient_id=lime.id, volume_ml=20.0)
        ]

        db.add_all(items)
        db.commit()
        print("✅ 经典玛格丽特配方注入成功！")
else:
    print("数据库中已存在该配方，跳过注入。")