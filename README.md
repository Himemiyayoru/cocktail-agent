# 🍸 Molecular Mixology AI Agent (Cocktail Physics)

[![Version](https://img.shields.io/badge/version-v1.2.0--beta-blue.svg)]()
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688.svg)]()
[![AI](https://img.shields.io/badge/AI-Local_LLM_(Ollama)-orange.svg)]()
[![Voice](https://img.shields.io/badge/Voice-Whisper_Base-purple.svg)]()
[![Frontend](https://img.shields.io/badge/Frontend-React_Native_Expo-61DAFB.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A full-stack, physics-driven molecular mixology application powered by a local AI agent and Voice-to-Text engine. 

This project redefines the traditional recipe app by introducing a **Fluid Physics Simulation Engine** and a **Local-First LLM Bartender ("Bob")** with a **Whisper-powered hearing system**. Instead of static text, recipes are calculated in real-time based on thermodynamic dilution, ABV (Alcohol by Volume), Brix (sugar content), and RGB optical blending. 

Designed as a showcase of integrating deterministic algorithms (Physics Engine) with probabilistic generative models (Local LLM Agent) and audio transcription models.

## ✨ Core Features

*   🧪 **Fluid Physics Simulation Engine**: Real-time calculation of cocktail dilution, final ABV, sugar concentration (Brix), and color blending using optical absorbance approximations.
*   🥃 **3D Vector Glassware Rendering**: A custom-built SVG graphics engine that dynamically renders liquids to perfectly mold to different glass geometries (Highball, Martini, Flute, etc.) with real-time volume capacity limits and smart compression.
*   🔄 **Dynamic Physical States**: Seamlessly toggle between "Mixed" (homogeneous optical blending) and "Layered" (physically stacked based on specific gravity derived from ABV and Brix) representations.
*   🤖 **Local-First AI Agent ("Bob")**: Integrated with Ollama (Llama 3) for zero-cost, privacy-first natural language recipe generation. Bob is prompted to act as a veteran bartender with a distinct, humorous personality.
*   🎧 **Local Voice-to-Text System**: Utilizes OpenAI's Whisper model locally to transcribe user audio inputs into text, enabling a hands-free "Hold to Talk" bar experience.
*   🗄️ **Relational Knowledge Graph**: Built with SQLite and SQLAlchemy to manage ingredients, recipes, and their respective molecular properties.
*   📊 **Smart Inventory Matcher**: Advanced subset & intersection algorithms to determine mixable cocktails based on available user inventory.
*   📱 **Cross-Platform Mobile UI**: Architected with React Native and Expo Router, featuring a global fluid Day/Night theme system and real-time physical metrics rendering.

## 🏗️ System Architecture 

The system follows a strict decoupling between the UI, the AI reasoning layer, and the physics calculation layer.

    [ Mobile App (React Native / Expo Go) ]
           |
           | REST API (JSON over LAN/Tunnel)
           v
    [ FastAPI Core Backend ] 
           |---> 🧮 Physics & Fluid Engine (Calculates ABV, Brix, RGB, Dilution)
           |---> 🧠 Local LLM Gateway (Ollama API -> Llama 3)
           |---> 🎧 Hearing Engine (Local Whisper Base Model)
           |---> 🗄️ SQLite Database (SQLAlchemy ORM)

## 🚀 Getting Started

### Prerequisites

*   Python 3.9+
*   [Ollama](https://ollama.ai/) installed locally (for the AI Agent).
*   FFmpeg installed (required for Whisper audio decoding).
*   Node.js 18+ (for frontend development) & Expo Go app on your phone.

### 1. Backend Setup & Run

```bash
# Clone the repository
git clone [https://github.com/yourusername/cocktail-agent.git](https://github.com/yourusername/cocktail-agent.git)
cd cocktail-agent

# Install Python dependencies
pip install fastapi uvicorn sqlalchemy pydantic openai openai-whisper python-multipart

# Seed the initial knowledge graph and recipes
python seed_db.py
python seed_recipes.py

# Start the FastAPI server (Exposed to LAN)
uvicorn api_v1_2:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Local AI Agent Setup

Ensure Ollama is running in the background, then pull the required model:

```bash
ollama run llama3
```

### 3. Frontend Setup & Run (Mobile Testing)

**Important:** Ensure the API fetch URLs in your frontend code point to your computer's local IP address (e.g., `192.168.x.x:8000`) instead of `127.0.0.1`.

```bash
cd cocktail-app
npm install

# Start the app using a tunnel (bypasses firewall & network restrictions)
npm run start -- -c --tunnel
```
Scan the generated QR code with the **Expo Go** app on your phone to enter the bar.

## 🗺️ Project Roadmap

*   [x] **v0.5**: Database ORM design and Knowledge Graph initialization.
*   [x] **v0.6**: Fluid Physics Engine implementation (ABV, Brix, RGB tracking).
*   [x] **v0.7**: Inventory subset-matching algorithm.
*   [x] **v0.8**: Integration of Local LLM ("Bob") via Ollama API.
*   [x] **v0.9**: Frontend scaffolding (React Native + Expo Router) & Dark Theme setup.
*   [x] **v1.0**: Frontend UI/UX implementation (Classics Feed, Inventory Grid, Agent Chat UI).
*   [x] **v1.1**: Interactive "Mutation Lab" - side-by-side physical comparison visualizations with true 3D SVG glassware rendering.
*   [x] **v1.2**: Voice-to-Text integration for speaking directly to Bob.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.