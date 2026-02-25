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

* You can use **Supabase PostgreSQL** or **Local PostgreSQL (pgAdmin)** connection string
* Make sure `.env` is not committed to GitHub

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

## ❗ Common Issues

* Missing `.env` file
* Invalid API keys
* Database connection errors
* Prisma not generated

Fix by checking:

```bash
npx prisma generate
```

and verifying `.env` values.

---

## 📩 Support

For any issues, installation problems, or setup errors, contact:

📧 **[nsaxenacse@gmail.com](mailto:nsaxenacse@gmail.com)**

---

## ✅ Quick Start Summary

```bash
# Backend
cd backend
npm i
npx prisma generate
node server.js

# Frontend
cd frontend
npm i
npm run dev
```

---

✨ Project ready for development and testing.
