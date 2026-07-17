# 🍸 Molecular Mixology AI Agent (Cocktail Physics)

[![Version](https://img.shields.io/badge/version-v2.1.0--stable-blue.svg)]()
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688.svg)]()
[![AI](https://img.shields.io/badge/AI-Local_LLM_(Ollama)-orange.svg)]()
[![Voice](https://img.shields.io/badge/Voice-Whisper_Base-purple.svg)]()
[![Frontend](https://img.shields.io/badge/Frontend-React_Native_Expo-61DAFB.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A full-stack, physics-driven molecular mixology application featuring a robust recipe database, real-time thermodynamic simulation, and an empathetic AI bartender.

This project completely redefines the traditional cocktail recipe application. It shifts away from static text lists by introducing a **Fluid Physics Simulation Engine** and a **Local-First LLM Bartender ("Bob")** equipped with a **Whisper-powered hearing system**. 

With a newly expanded 5-tab architecture, users can seamlessly explore a massive library of 400+ real-world cocktails, dynamically mutate ingredients to instantly observe changes in fluid properties (ABV, Brix, Color, and Specific Gravity layering), and consult an empathetic AI for personalized recommendations. Users can now curate their own menu by saving their favorite recipes with a simple heart toggle, and utilize the new Inventory Lab to discover drinks based on ingredients they already own.

---

## ✨ Core Features & Innovations

### 📚 The Library, Search & Saved Favorites
* **Massive Authentic Database**: Contains over 400 meticulously curated real-world cocktail recipes with detailed mixing instructions and physical baselines.
* **Horizontal Category Feed**: The library interface has been upgraded to a sleek horizontal scrolling waterfall layout, automatically categorizing cocktails into professional mixology families (e.g., *Aperitifs*, *Spirit-Forward*, *Tiki & Tropical*).
* **Saved Favorites**: Users can easily curate a personal collection by tapping the heart icon on any recipe image, saving it instantly to a dedicated tab for quick access.
* **Fuzzy Search & Caching**: A dedicated search interface with real-time Levenshtein-distance fault tolerance and an enterprise-grade disk caching system (`expo-image`) for lightning-fast thumbnail rendering.

### 🧪 The Recipe Mutation Lab
* **Photo-to-Physics Auto-Switch**: By default, recipes display stunning, real-world photography (fetched dynamically). The moment a user adjusts an ingredient, the UI instantly crossfades into the 2D Vector Physics Engine to show a side-by-side comparison.
* **AI-Powered Ingredient Substitution**: Users can freely swap any ingredient in the recipe. The system calculates Euclidean distances based on chemical properties to recommend the most scientifically similar alternatives.
* **Mutation Impact Analysis**: Whenever an ingredient is swapped, the app generates a smart flavor profile analysis, explaining exactly how the taste, sweetness, or strength has changed compared to the original recipe.
* **Real-Time Fluid Telemetry**: Altering ingredients instantly recalculates the final ABV (Alcohol by Volume), Brix (sugar concentration/sweetness), and RGB optical blending using logarithmic absorbance approximations.
* **Dynamic Physical States**: Seamlessly toggle between "Mixed" (homogeneous optical blending) and "Layered" (physically stacked based on specific gravity calculations).
* **Smart Glassware Constraints**: Fluid automatically molds to the geometry of distinct glassware (Highball, Martini, Flute, Coupe, etc.) with strict volume capacity warnings.

### 🗄️ The Inventory Lab
* **Smart Pantry**: Users can select and manage the ingredients they currently own from a comprehensive interactive list.
* **Match Engine**: The system runs advanced subset and intersection algorithms against the entire database to reveal "Perfect Matches" (drinks you can make right now) and "Almost There" recommendations (missing only 1-2 ingredients).

### 🤖 "Bob" - The Empathetic AI Bartender
* **Context-Aware Interactions**: Powered by a local Llama 3 model, Bob acts as a veteran bartender. He consoles you when you're down, celebrates your victories, and recommends the perfect drink tailored to your current emotional state.
* **Local Voice-to-Text**: Integrated with OpenAI's Whisper model locally. Users can utilize a hands-free "Hold to Talk" mechanic to speak directly to Bob.
* **Flawless Chat UX**: Features an adaptive chat interface with intelligent Keyboard Occlusion handling (`KeyboardAvoidingView`), dynamic Day/Night theme contrast switching, and custom avatar masking.

---

## 🏗️ System Architecture 

The system follows a strict decoupling between the mobile presentation layer, the AI reasoning layer, and the physics calculation layer.

```text
    [ Mobile App (React Native / Expo Router - 5 Tab Architecture) ]
           |
           | REST API (JSON over LAN/Tunnel)
           v
    [ FastAPI Core Backend ] 
           |---> 🧮 Physics & Fluid Engine (Calculates ABV, Brix, RGB, Dilution)
           |---> 🧠 Local LLM Gateway (Ollama API -> Llama 3)
           |---> 🎧 Hearing Engine (Local Whisper Base Model)
           |---> 🗄️ SQLite Database (SQLAlchemy ORM + 400 Recipes)
```

---

## 🚀 Getting Started

### Prerequisites

* Python 3.9+
* [Ollama](https://ollama.ai/) installed locally (for the AI Agent).
* FFmpeg installed (required for Whisper audio decoding).
* Node.js 18+ (for frontend development) & Expo Go app on your mobile device.

### 1. Backend Setup & Run

```bash
# Clone the repository
git clone https://github.com/yourusername/cocktail-agent.git
cd cocktail-agent

# Install Python dependencies
pip install fastapi uvicorn sqlalchemy pydantic openai openai-whisper python-multipart

# Seed the initial knowledge graph and 400+ recipes
python scripts/seed_db.py
python scripts/seed_recipes.py

# Start the FastAPI server (Exposed to LAN)
python api/main.py
```

### 2. Local AI Agent Setup

Ensure Ollama is running in the background, then pull the required model:

```bash
ollama run llama3
```

### 3. Frontend Setup & Run (Mobile Testing)

**Important:** Ensure the API fetch URLs in your frontend code point to your computer's local IPv4 address (e.g., `[http://192.168.](http://192.168.)x.x:8000`) instead of `localhost` or `127.0.0.1`.

```bash
cd mobile
npm install

# Start the app using a tunnel (bypasses firewall & network restrictions)
npx expo start -c
```
Scan the generated QR code with the **Expo Go** app on your phone to enter the bar.

---

## 🗺️ Project Roadmap

* [x] **v0.5**: Database ORM design and Knowledge Graph initialization.
* [x] **v0.6**: Fluid Physics Engine implementation (ABV, Brix, RGB tracking).
* [x] **v0.8**: Integration of Local LLM ("Bob") via Ollama API.
* [x] **v1.0**: Frontend UI/UX implementation & Global Dark Theme setup.
* [x] **v1.2**: Voice-to-Text integration for the agent chat.
* [x] **v1.5**: Expansion to 400+ real-world recipes with database seeding.
* [x] **v2.0**: Massive UI overhaul: 5-Tab Navigation, Smart Category Library, Real-time Image/Physics toggling, and Empathetic Contextual AI upgrades.
* [x] **v2.1**: **The Inventory Lab** - Advanced subset & intersection algorithms to determine mixable cocktails based on available user inventory.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.