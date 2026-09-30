# Uzhavan 360

**"Connecting Farms, Nourishing Lives"**

A hyper-local agricultural marketplace and operational intelligence platform connecting smallholder and commercial farmers directly with retail, bulk, and commercial buyers — eliminating predatory middlemen, reducing post-harvest loss, and valorizing crop residues.

Dual-channel by design: every business action is equally accessible through a mobile-first graphical interface **or** through **Uzhavan**, a voice-first AI assistant that speaks Tamil, English, and Tanglish.

---

## Project Status

| Phase | Level | Status |
| :--- | :--- | :--- |
| **Level 1** | Project Architecture & Specification | **Approved Baseline** ([ARCHITECTURE.md](./ARCHITECTURE.md)) |
| **Level 2** | Project Setup & Configuration | **Complete & Verified** |
| **Level 3** | Backend Development & Service Layer | *Next Phase* |
| **Level 4** | Database Schemas & Data Layer | *Scheduled* |
| **Level 5** | Frontend Development & Map Visualizer | *Scheduled* |
| **Level 6** | Integration, Testing & Deployment | *Scheduled* |

---

## Monorepo Structure

```
Uzhavan360/
├── client/                     # React + Vite + Tailwind CSS v4 PWA
│   ├── src/
│   │   ├── components/         # Reusable Button, Card, Badge, GoogleMapsProvider, UzhavanMicOverlay
│   │   ├── context/            # AuthContext (JWT session state)
│   │   ├── i18n/               # Multilingual translations (English & Tamil)
│   │   ├── layouts/            # MainLayout responsive shell with Uzhavan floating trigger
│   │   ├── pages/              # HomePage (live health ping), modular route placeholders
│   │   ├── routes/             # AppRoutes (React Router 7)
│   │   └── services/           # Centralized Axios client & module services
│   ├── .env.example
│   └── package.json
├── server/                     # Node.js + Express Modular Monolith
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/         # Namespace routers: health, auth, products, orders, inventory, etc.
│   │   │   └── app.js          # Express app with helmet, CORS, morgan, centralized error handling
│   │   ├── config/
│   │   │   ├── env.js          # Fail-fast environment validator
│   │   │   └── db.js           # Mongoose MongoDB Atlas connection & graceful shutdown
│   │   ├── middlewares/        # JWT auth, RBAC (FARMER, BUYER, ADMIN), errorHandler, logger
│   │   ├── services/           # Cloudinary & Uzhavan AI abstraction services
│   │   ├── utils/              # location (Haversine/jitter), freshness, API response helpers
│   │   └── server.js           # Server entry point with integration status reporting
│   ├── .env.example
│   └── package.json
├── shared/                     # Shared Domain Constants & Invariants
│   ├── constants/              # ROLES, REQUEST_STATES, ORDER_STATES, INVENTORY_TRANSACTION_TYPES, UNITS
│   └── index.js
├── docs/                       # Architecture and design documents
├── .env.example                # Master environment configuration template
├── ARCHITECTURE.md             # Level 1 Architectural Specification (Single Source of Truth)
└── package.json                # Root workspaces orchestration
```

---

## Prerequisites

- **Node.js**: v20.x or higher (tested on v24.13.0)
- **npm**: v10.x or higher (tested on v11.6.2)
- **MongoDB**: MongoDB Atlas URI or local MongoDB running at `mongodb://127.0.0.1:27017`

---

## Quick Start & Setup

### 1. Clone & Install Dependencies
```bash
git clone <repo-url>
cd "Uzhavan 360"
npm install
```

### 2. Configure Environment Variables
Copy the templates to `.env` files:
```bash
# Server configuration
cp server/.env.example server/.env

# Client configuration
cp client/.env.example client/.env
```

Ensure `server/.env` contains your `MONGODB_URI` and `JWT_SECRET`. Optional external integrations (Cloudinary, Google Maps, AI Provider) will default to safe development/mock modes if omitted.

### 3. Start Development Servers
Run both backend and frontend concurrently:
```bash
npm run dev
```

Or run services individually:
```bash
# Start backend API (http://localhost:5000)
npm run dev:server

# Start frontend PWA (http://localhost:5173)
npm run dev:client
```

### 4. Verify System Health
Open your browser to:
- Frontend: `http://localhost:5173`
- Backend Health Check: `http://localhost:5000/api/health`

---

## Available NPM Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs backend and frontend concurrently using workspaces |
| `npm run dev:server` | Starts Express server with nodemon auto-reload |
| `npm run dev:client` | Starts Vite React development server |
| `npm run build` | Builds the client for production (`client/dist`) |
| `npm run lint` | Runs ESLint on server and Oxlint on client |

---

## Architecture Compliance

This project strictly adheres to [ARCHITECTURE.md](./ARCHITECTURE.md). Under no circumstance should database schemas, business rules, or AI orchestration violate the Level 1 specification.
