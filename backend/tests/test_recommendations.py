"""Run: python -B -m unittest discover -s backend/tests -v

Fixtures replace dotenv, the recipe file, and AI calls; no secrets or network.
"""

import builtins
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

API_DIR = Path(__file__).resolve().parents[1] / "api"
sys.path.insert(0, str(API_DIR))
from recommendations import find_exact_recipe, match_recipes, normalize_inventory


def component(name, category="Spirit", abv=40):
    return {"ingredient_name": name, "category": category, "volume_ml": 30,
            "physics_baseline": {"abv": abv, "brix": 0, "ph": 7,
                                 "opacity": 0, "color_rgb": [255, 255, 255]}}


RECIPES = [
    {"name": "Gin Tonic", "glass_type": "highball", "components": [
        component("Gin"), component("Tonic Water", "Mixer", 0)]},
    {"name": "Vodka Tonic", "components": [
        component("Vodka"), component("Tonic Water", "Mixer", 0)]},
    {"name": "Gin Fizz", "components": [
        component("Gin"), component("Soda Water", "Mixer", 0), component("Lemon", "Juice", 0)]},
    {"name": "Rum Tonic", "components": [
        component("Rum", abv=50), component("Tonic Water", "Mixer", 0)]},
]


class MatchingTests(unittest.TestCase):
    def test_inventory_normalizes_case_whitespace_and_duplicates(self):
        self.assertEqual(normalize_inventory([" Gin ", "GIN", "tonic\t  water", "", "  "]),
                         {"gin", "tonic water"})
        matched = match_recipes(RECIPES, [" Gin ", "GIN", "tonic  WATER"])["perfect_matches"][0]
        self.assertEqual(matched["name"], "Gin Tonic")
        self.assertEqual((matched["matched_count"], matched["total_ingredients"], matched["match_ratio"]),
                         (2, 2, 1))

    def test_empty_or_unrelated_inventory_is_not_almost_ready(self):
        for inventory in ([], [" ", ""], ["Coffee"]):
            with self.subTest(inventory=inventory):
                self.assertEqual(match_recipes(RECIPES, inventory),
                                 {"perfect_matches": [], "almost_matches": []})

    def test_almost_ranks_missing_count_then_coverage(self):
        result = match_recipes(RECIPES, ["Gin", "Soda Water"])["almost_matches"]
        self.assertEqual([item["name"] for item in result], ["Gin Fizz", "Gin Tonic"])
        self.assertEqual(result[0]["missing_ingredients"], ["Lemon"])
        self.assertAlmostEqual(result[0]["match_ratio"], 2 / 3)

    def test_recipe_duplicates_and_empty_recipes_do_not_inflate_requirements(self):
        recipes = [{"name": "Duplicate", "components": [component("Gin"), component(" gin "), component("Lemon")]},
                   {"name": "Empty", "components": []}]
        result = match_recipes(recipes, ["Gin"])["almost_matches"]
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["total_ingredients"], 2)
        self.assertEqual(result[0]["missing_ingredients"], ["Lemon"])

    def test_does_not_invent_synonym_equivalence(self):
        self.assertFalse(match_recipes(RECIPES, ["Gin", "Tonic"])["perfect_matches"])

    def test_exact_selection_rejects_substrings_and_outside_candidates(self):
        candidates = [(0, RECIPES[0])]
        self.assertEqual(find_exact_recipe(candidates, "  GIN   tonic ")[0], 0)
        for name in ("Gin", "Gin Tonic Special", "Vodka Tonic", ""):
            with self.subTest(name=name):
                self.assertIsNone(find_exact_recipe(candidates, name))


class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        cls.TestClient = TestClient
        real_open = builtins.open

        def open_fixture(path, *args, **kwargs):
            if os.fspath(path).endswith("FINAL_COCKTAIL_PHYSICS_DB.json"):
                return io.StringIO(json.dumps(RECIPES))
            return real_open(path, *args, **kwargs)

        spec = importlib.util.spec_from_file_location("bob_api_under_test", API_DIR / "main.py")
        cls.api = importlib.util.module_from_spec(spec)
        billing_file = tempfile.NamedTemporaryFile(prefix="bob-bill-", suffix=".sqlite", delete=False)
        billing_file.close()
        cls.billing_path = billing_file.name
        environment = patch.dict(os.environ, {
            "GROQ_API_KEY": "", "OPENAI_API_KEY": "",
            "BOB_BILLING_DB": cls.billing_path, "BILLING_TOKEN_SECRET": "test-secret",
        })
        environment.start()
        cls.addClassCleanup(environment.stop)
        with patch("dotenv.load_dotenv"), patch("builtins.open", side_effect=open_fixture):
            spec.loader.exec_module(cls.api)

    def subscriber_headers(self, account="route-subscriber"):
        token = self.api.billing.activate_subscription(account, int(time.time()) + 30 * 24 * 3600)
        return {"Authorization": f"Bearer {token}"}

    def setUp(self):
        self.api.IP_RATE_LIMIT.clear()
        self.api.groq_client = None
        self.api.openai_client = None
        self.client = self.TestClient(self.api.app)
        self.addCleanup(self.client.close)

    def mock_reply(self, payload):
        create = AsyncMock(return_value=SimpleNamespace(choices=[
            SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]))
        self.api.groq_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        return create

    def test_catalog_and_matching_work_without_keys(self):
        self.assertEqual(self.client.get("/api/v2/recipes").status_code, 200)
        self.assertEqual(self.client.get("/api/v2/ingredients").status_code, 200)
        response = self.client.post("/api/v2/match", json={"inventory": [" Gin ", "Tonic   water"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["perfect_matches"][0]["matched_count"], 2)

    def test_substitution_validates_limit(self):
        for limit in (-1, 0, 21, "invalid"):
            with self.subTest(limit=limit):
                response = self.client.get("/api/v2/substitute", params={"ingredient": "Gin", "limit": limit})
                self.assertEqual(response.status_code, 422)

    def test_owned_substitute_precedes_higher_physical_score(self):
        response = self.client.get("/api/v2/substitute", params=[
            ("ingredient", " GIN "), ("inventory", " RUM "), ("inventory", "Lemon")])
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual([item["ingredient_name"] for item in data["substitutes"]], ["Rum", "Vodka"])
        self.assertTrue(data["substitutes"][0]["in_inventory"])
        self.assertFalse(data["substitutes"][1]["in_inventory"])
        self.assertIn("Flavor", data["score_description"])
        self.assertEqual(self.client.get("/api/v2/substitute", params={"ingredient": "Unknown"}).status_code, 404)

    def test_old_substitution_request_remains_supported(self):
        data = self.client.get("/api/v2/substitute", params={"ingredient": "Gin"}).json()
        self.assertEqual(data["substitutes"][0]["ingredient_name"], "Vodka")
        self.assertIn("match_score", data["substitutes"][0])

    def test_empty_and_incomplete_shelf_avoid_ai_calls(self):
        create = self.mock_reply({})
        for inventory, status in (([], "empty_inventory"), (["Gin"], "no_available_recipes")):
            with self.subTest(inventory=inventory):
                response = self.client.post("/api/v2/chat_with_bob", headers=self.subscriber_headers(), json={
                    "user_message": "What can I make?", "inventory": inventory, "use_inventory": True})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["recommendation_status"], status)
                self.assertNotIn("recipe_id", response.json())
        create.assert_not_awaited()

    def test_inventory_constrains_prompt_and_recommendation(self):
        create = self.mock_reply({"bob_comment": "Try this.", "recommended_cocktail_name": " GIN   tonic "})
        response = self.client.post("/api/v2/chat_with_bob", headers=self.subscriber_headers(), json={
            "user_message": "What can I make?", "inventory": ["gin", "tonic water"], "use_inventory": True})
        self.assertEqual(response.json()["recipe_id"], 0)
        prompt = create.call_args.kwargs["messages"][0]["content"]
        self.assertIn("Gin Tonic", prompt)
        self.assertNotIn("Vodka Tonic", prompt)

    def test_outside_recommendations_discard_model_explanation(self):
        for name in ("Vodka Tonic", "Gin", "Gin Tonic Special"):
            with self.subTest(name=name):
                self.mock_reply({"bob_comment": "Unverified drink recommendation.", "recommended_cocktail_name": name})
                response = self.client.post("/api/v2/chat_with_bob", headers=self.subscriber_headers(), json={
                    "user_message": "Suggest one", "inventory": ["Gin", "Tonic Water"], "use_inventory": True})
                data = response.json()
                self.assertEqual(data["recommendation_status"], "unavailable_recommendation")
                self.assertNotIn("recipe_id", data)
                self.assertNotIn("Unverified drink", data["bob_says"])

    def test_old_chat_request_can_explore_full_menu(self):
        self.mock_reply({"bob_comment": "Here you go.", "recommended_cocktail_name": "Vodka Tonic"})
        response = self.client.post("/api/v2/chat_with_bob", headers=self.subscriber_headers(), json={"user_message": "Suggest one"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["recipe_id"], 1)

    def test_invalid_model_fields_are_recoverable(self):
        for payload in ([], {"bob_comment": "Hello", "recommended_cocktail_name": None},
                        {"bob_comment": ["Invalid"], "recommended_cocktail_name": "Gin Tonic"}):
            with self.subTest(payload=payload):
                self.mock_reply(payload)
                response = self.client.post("/api/v2/chat_with_bob", headers=self.subscriber_headers(), json={"user_message": "Hello"})
                self.assertEqual(response.status_code, 502)
                self.assertIn("try again", response.json()["detail"])

    def test_bob_requires_subscription_and_stops_at_four_dollars(self):
        denied = self.client.post("/api/v2/chat_with_bob", json={"user_message": "Hello"})
        self.assertEqual(denied.status_code, 401)
        create = self.mock_reply({"bob_comment": "Here you go.", "recommended_cocktail_name": "Gin Tonic"})
        headers = self.subscriber_headers("capped-account")
        self.api.billing.set_spent_nano("capped-account", self.api.billing.MONTHLY_BUDGET_NANO)
        blocked = self.client.post("/api/v2/chat_with_bob", headers=headers, json={"user_message": "Hello"})
        self.assertEqual(blocked.status_code, 402)
        self.assertIn("4.00", blocked.json()["detail"])
        create.assert_not_awaited()

    def test_voice_uses_same_budget_and_never_calls_provider_when_capped(self):
        from unittest.mock import Mock
        create = Mock(return_value=SimpleNamespace(text="Hello"))
        self.api.openai_client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))
        headers = self.subscriber_headers("voice-account")
        with patch("audio_meter.prepare_audio", return_value=(b"metered", 10.1)):
            response = self.client.post("/api/v2/transcribe", headers=headers, files={"audio_file": ("a.m4a", b"audio")})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["spent_usd"], "0.01")
            self.api.billing.set_spent_nano("voice-account", self.api.billing.MONTHLY_BUDGET_NANO)
            create.reset_mock()
            blocked = self.client.post("/api/v2/transcribe", headers=headers, files={"audio_file": ("a.m4a", b"audio")})
            self.assertEqual(blocked.status_code, 402)
            create.assert_not_called()

    def test_timeout_does_not_refund_potential_provider_cost(self):
        headers = self.subscriber_headers("timeout-account")
        create = self.mock_reply({})
        create.side_effect = TimeoutError("network")
        response = self.client.post("/api/v2/chat_with_bob", headers=headers, json={"user_message": "Hello"})
        self.assertEqual(response.status_code, 502)
        self.assertNotEqual(self.api.billing.public_allowance("timeout-account")["spent_usd"], "0.00")

    def test_ai_routes_return_503_without_keys(self):
        headers = self.subscriber_headers("no-key-account")
        unpaid_chat = self.client.post("/api/v2/chat_with_bob", json={"user_message": "Hello"})
        unpaid_audio = self.client.post("/api/v2/transcribe", files={"audio_file": ("test.m4a", b"fixture", "audio/m4a")})
        chat = self.client.post("/api/v2/chat_with_bob", headers=headers, json={"user_message": "Hello"})
        audio = self.client.post("/api/v2/transcribe", headers=headers, files={"audio_file": ("test.m4a", b"fixture", "audio/m4a")})
        self.assertEqual(unpaid_chat.status_code, 401)
        self.assertEqual(unpaid_audio.status_code, 401)
        self.assertEqual(chat.status_code, 503)
        self.assertEqual(audio.status_code, 503)


if __name__ == "__main__":
    unittest.main()
