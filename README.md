# 📦 Project Setup & Installation Guide

This README provides step-by-step instructions to clone, configure, and run the project locally.

---

## 📁 Getting the Project

### Option 1: Clone the Git Repository
```bash
git clone "repo-link"
```

### Option 2: Using ZIP File
1. Download the ZIP file
2. Extract it
3. Open the folder in VS Code or any code editor

---

## 🔐 Environment Variables (API Keys Required)

Create a `.env` file in the **backend** directory and add the following keys:

```env
GROQ_API_KEY=your_groq_api_key_here
SUPABASE_CONNECTION_STRING=your_supabase_or_postgres_connection_string_here
TAVILY_API_KEY=your_tavily_api_key_here
```

> ⚠️ Notes:
> * You can use **Supabase PostgreSQL** or **Local PostgreSQL (pgAdmin)** connection string
> * Make sure `.env` is not committed to GitHub

---

## 🖥️ Backend Setup & Run

```bash
cd backend
npm install
npx prisma generate
node server.js
```

Backend server will start on the configured port.

---

## 🌐 Frontend Setup & Run

```bash
cd frontend
npm install
npm run dev
```

Frontend development server will start (usually on `http://localhost:5173` or similar).

---

## 🧩 Tech Stack

* Node.js
* Express.js
* Prisma ORM
* PostgreSQL / Supabase
* React / Vite (Frontend)

---

## 🎙️ Django WebSocket Backend (AI Doctor)

The consultation page connects to a separate Django Channels backend that handles real-time audio streaming, ASR, and the AI doctor agent.

### Prerequisites

- Python 3.10+
- Docker (for Redis)

### Redis Setup

Redis is required as the channel layer for Django Channels. It acts as the message broker between WebSocket connections.

```bash
# Pull and start Redis via Docker
docker run -d --name redis-aavaaz -p 6379:6379 redis:alpine

# Verify Redis is running
docker exec -it redis-aavaaz redis-cli ping
# Expected: PONG
```

### Django Backend Setup

Create a `.env` file in the `dj_websocket` directory:

```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
GROQ_API_KEY=your_groq_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
DJANGO_SECRET_KEY=your_secret_key_here
```

```bash
cd dj_websocket

# Create and activate virtual environment
python -m venv venv
venv\Scripts\Activate.ps1       # Windows
source venv/bin/activate         # Mac/Linux

# Install dependencies
pip install django channels channels-redis daphne elevenlabs websockets python-dotenv langchain langchain-groq tavily-python langchain-community httpx

# Run migrations
python manage.py migrate

# Start Django WebSocket server
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

Server will start at `http://localhost:8000`  
WebSocket available at `ws://localhost:8000/ws/speech/`

### Running Everything Together

| Terminal | Command |
|---|---|
| Terminal 1 | `docker start redis-aavaaz` |
| Terminal 2 | `daphne -b 0.0.0.0 -p 8000 config.asgi:application` |
| Terminal 3 | `cd backend && node server.js` |
| Terminal 4 | `cd frontend && npm run dev` |

---

## ❗ Common Issues

* Missing `.env` file
* Invalid API keys
* Database connection errors
* Prisma not generated
* Redis not running — run `docker start redis-aavaaz`
* Django port 8000 conflict — make sure no other service is on 8000

Fix by checking:

```bash
npx prisma generate
docker start redis-aavaaz
```

and verifying `.env` values.

---

## 📩 Support

For any issues, installation problems, or setup errors, contact:  
📧 **[nsaxenacse@gmail.com](mailto:nsaxenacse@gmail.com)**

---

## ✅ Quick Start Summary

```bash
# Redis
docker start redis-aavaaz

# Django WebSocket Backend
cd dj_websocket
venv\Scripts\Activate.ps1
daphne -b 0.0.0.0 -p 8000 config.asgi:application

# Node Backend
cd backend
npm install
npx prisma generate
node server.js

# Frontend
cd frontend
npm install
npm run dev
```

---

✨ Project ready for development and testing.
