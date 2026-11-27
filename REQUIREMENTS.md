# Sage X3 Desk — Machine Requirements & Automated Setup Guide

Complete system, runtime, database, AI, and networking requirements to deploy **Sage X3 Desk** on a fresh Windows machine.

---

## 1. System & Runtime Requirements

| Component | Version / Package | Required? | Purpose | Port |
|---|---|---|---|---|
| **OS** | Windows 10 / 11 (x64) | Yes | Target environment (`restart.bat` / `setup.bat`) | — |
| **Node.js** | `v20.20.0` (LTS v20+) | Yes | Backend API, Vite build, startup scripts | — |
| **npm** | `v10+` (tested `11.19.0`) | Yes | Dependency management (`root`, `server`, `client`) | — |
| **MongoDB** | Community Server (`7.x` / `8.x`) | Yes | Primary database (`sage_x3_desk`) | `27017` |
| **Ollama** | `v0.34+` | Yes (for X3 AI) | Local LLM runtime | `11434` |
| **Ollama Model** | `qwen2.5-coder:1.5b` | Yes (for X3 AI) | X3 AI intent routing, OCR drafting & chat | — |
| **Git** | `2.47+` | Optional | Cloning repository updates | — |
| **Tailscale** | Latest Windows client | Optional | Private mesh VPN / remote HTTPS access across machines | — |

---

## 2. NPM Dependencies (Installed Automatically by `setup.bat`)

- **Root (`package.json`)**: `concurrently@^9.1.0`
- **Backend (`server/package.json`)**:
  - Core: `express@^4.21.2`, `mongoose@^8.9.5`, `socket.io@^4.8.1`, `dotenv@^16.4.7`, `cors@^2.8.5`
  - Security & Auth: `helmet@^8.0.0`, `express-rate-limit@^7.5.0`, `jsonwebtoken@^9.0.2`, `bcryptjs@^2.4.3`
  - Uploads, OCR, Mail & Validation: `multer@^1.4.5-lts.1`, `tesseract.js@^7.0.0`, `nodemailer@^6.9.16`, `zod@^3.24.1`, `dayjs@^1.11.13`, `morgan@^1.10.0`
- **Frontend (`client/package.json`)**:
  - Core: `react@^18.3.1`, `react-dom@^18.3.1`, `react-router-dom@^7.1.1`, `vite@^6.0.6`
  - UI & Data: `tailwindcss@^3.4.17`, `lucide-react@^0.469.0`, `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts@^2.15.0`, `axios@^1.7.9`, `socket.io-client@^4.8.1`, `react-hook-form@^7.54.2`, `dayjs@^1.11.13`

---

## 3. Environment Configuration (`server/.env`)

If `server/.env` does not exist on the new machine, `setup.bat` creates it with:

```env
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/sage_x3_desk
JWT_SECRET=sage_x3_desk_dev_secret_change_in_production_2026
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5174,http://localhost:5173
UPLOAD_DIR=uploads
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:1.5b
OLLAMA_TIMEOUT_MS=180000
```

> **Note:** On a new machine, change `JWT_SECRET` for production and add your Vercel/Tailscale URLs to `CLIENT_URL` if accessing remotely.

---

## 4. One-Command Automated Setup & Start

### Option A — Full Automated Setup + Start (`setup.bat`)
Double-click **`setup.bat`** or run from CMD/PowerShell in the project folder:
```bat
setup.bat
```
This automatically:
1. Installs **Node.js LTS**, **MongoDB Community Server**, and **Ollama** via `winget` (if missing).
2. Starts the **MongoDB** service.
3. Runs `npm install` in **root**, **`server/`**, and **`client/`**.
4. Creates `server/.env` if missing.
5. Starts **Ollama** silently and pulls **`qwen2.5-coder:1.5b`**.
6. Seeds initial demo users/clients (only on fresh install or with `setup.bat --seed`).
7. Starts **Ollama AI (`11434`)**, **Backend (`5001`)**, and **Frontend (`5174`)** silently in the background.

### Option B — Quick Copy-Paste CMD Commands (Manual / Scripted)
```bat
winget install -e --id OpenJS.NodeJS.LTS && winget install -e --id MongoDB.Server && winget install -e --id Ollama.Ollama && net start MongoDB && npm install && npm --prefix server install && npm --prefix client install && ollama pull qwen2.5-coder:1.5b && npm run seed && npm run start:bg
```

### Option C — Tailscale Setup (Optional, for Remote Access Between Machines)
```bat
winget install -e --id Tailscale.Tailscale
tailscale up
tailscale serve --bg 5001
```
Then add the machine's `https://<machine-name>.<tailnet>.ts.net` URL to `CLIENT_URL` in `server/.env`.

---

## 5. Daily Startup Commands (After Initial Setup)

| Command | Behavior |
|---|---|
| `restart.bat` | Kills stale ports, starts Ollama AI + Backend + Frontend silently in background (no CMD popups) |
| `npm run start:bg` | Same as `restart.bat` from terminal (background mode, logs in `logs/`) |
| `npm run start` | Kills stale ports, starts Ollama AI in background, runs Backend in current terminal |
| `npm run start:full` | Kills stale ports, starts Ollama AI in background, runs Backend + Frontend in current terminal |
