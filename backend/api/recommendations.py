"""Deterministic ingredient matching, independent of API clients and secrets."""

import math
from typing import Iterable


def normalize_name(name: str) -> str:
    """Ignore casing and whitespace, without guessing ingredient synonyms."""
    return " ".join(name.split()).casefold()


def normalize_inventory(inventory: Iterable[str]) -> set[str]:
    return {normalized for name in inventory if (normalized := normalize_name(name))}


def match_recipes(recipes: list[dict], inventory: Iterable[str]) -> dict:
    available = normalize_inventory(inventory)
    perfect_matches = []
    almost_matches = []

    for recipe_id, recipe in enumerate(recipes):
        # Count distinct ingredients; repeated recipe slots are not extra supplies.
        required = {}
        for component in recipe.get("components", []):
            original_name = component["ingredient_name"]
            normalized = normalize_name(original_name)
            if normalized:
                required.setdefault(normalized, original_name)
        if not required:
            continue

        missing = [original for name, original in required.items() if name not in available]
        total = len(required)
        matched = total - len(missing)
        summary = {
            "id": recipe_id,
            "name": recipe.get("name"),
            "glass_type": recipe.get("glass_type"),
            "missing_count": len(missing),
            "missing_ingredients": missing,
            "matched_count": matched,
            "total_ingredients": total,
            "match_ratio": matched / total,
        }
        if not missing:
            perfect_matches.append(summary)
        elif matched > 0 and len(missing) <= 2:
            almost_matches.append(summary)

    almost_matches.sort(key=lambda item: (
        item["missing_count"], -item["match_ratio"], normalize_name(item["name"] or "")
    ))
    return {"perfect_matches": perfect_matches, "almost_matches": almost_matches}


def rank_substitutes(ingredients: dict, ingredient: str, inventory: Iterable[str]) -> list[dict]:
    """Rank physical similarity within a category, never flavor equivalence."""
    target_name = normalize_name(ingredient)
    target = ingredients[target_name]
    available = normalize_inventory(inventory)
    candidates = []
    for name, data in ingredients.items():
        if name == target_name or data["category"] != target["category"]:
            continue
        source, replacement = target["physics"], data["physics"]
        difference = (
            abs(source["abv"] - replacement["abv"])
            + abs(source["brix"] - replacement["brix"])
            + abs(source["ph"] - replacement["ph"]) * 5
            + math.sqrt(sum((a - b) ** 2 for a, b in zip(
                source["color_rgb"], replacement["color_rgb"]
            ))) / 25.5
        )
        candidates.append({
            "ingredient_name": data["original_name"],
            "match_score": max(0, 100 - int(difference * 2)),
            "physics_baseline": replacement,
            "in_inventory": name in available,
        })
    candidates.sort(key=lambda item: (
        not item["in_inventory"], -item["match_score"], normalize_name(item["ingredient_name"])
    ))
    return candidates


def find_exact_recipe(candidates: list[tuple[int, dict]], recommendation: str):
    """Accept only a normalized exact name from the permitted candidate set."""
    target = normalize_name(recommendation)
    if not target:
        return None
    return next(((recipe_id, recipe) for recipe_id, recipe in candidates
                 if normalize_name(recipe["name"]) == target), None)
