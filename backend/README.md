# FABREU FTTH API

API Node/Express separada do frontend.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

API local: `http://localhost:4000/api`

## Endpoints base

- Health: `GET /api/health`
- Login provedor: `POST /api/auth/login`
- Login admin global: `POST /api/system/auth/login`

## Variaveis

- `PORT` ou `API_PORT`
- `API_JWT_SECRET`
- `API_TOKEN_TTL`
- `API_CORS_ORIGIN`
- `SYSTEM_ADMIN_USERNAME`
- `SYSTEM_ADMIN_DISPLAY_NAME`
- `SYSTEM_ADMIN_PASSWORD` ou `SYSTEM_ADMIN_PASSWORD_HASH`
- `FTTH_DATA_DIR` (opcional)
