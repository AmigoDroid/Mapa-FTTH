# FABREU FTTH

Plataforma FTTH multi-tenant com frontend e backend separados.

- Frontend (Vite): portal do provedor (`/`) e portal global (`/system`).
- Backend (Node/Express): API em `/api` com JWT, RBAC, licenciamento e multi-provedor.

## Arquitetura

### Frontend
- Rota provedor: `/`
- Rota admin global: `/system`
- URL da API via `VITE_API_BASE_URL`

### Backend
- API base: `/api`
- Login provedor: `POST /api/auth/login`
- Login admin global: `POST /api/system/auth/login`
- Health: `GET /api/health`

## Desenvolvimento local

1. Instale frontend e backend:

```bash
npm install
npm run api:install
```

2. Configure envs:

- Frontend: copie `.env.example` para `.env`
- Backend: copie `backend/.env.example` para `backend/.env`

3. Rode em 2 terminais:

```bash
npm run api:dev
```

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`

## Deploy recomendado

1. Deploy da API em serviço próprio (Render/Railway/Fly/etc.)
2. Configure envs da API (`API_JWT_SECRET`, `SYSTEM_ADMIN_*`, `API_CORS_ORIGIN`, etc.)
3. Deploy do frontend na Vercel
4. No frontend da Vercel, defina:

```bash
VITE_API_BASE_URL=https://SEU-BACKEND/api
```

5. Redeploy do frontend

## Scripts (root)

- `npm run dev`: frontend
- `npm run api:install`: instala dependencias do backend
- `npm run api:dev`: backend em watch (app separada)
- `npm run api:start`: backend sem watch
- `npm run build`: build frontend

## Persistencia de dados

- Em dev: `backend/data/db.json`
- Em ambiente Vercel, filesystem e efemero (`/tmp`).
- Para producao real (licenciamento), use banco externo.
