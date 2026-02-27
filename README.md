# FABREU FTTH Doc

Plataforma FTTH multi-tenant com dois portais:

- Portal do provedor (`/`): gestor do provedor gerencia usuarios, permissoes e projetos do proprio ambiente.
- Portal global (`/system`): administrador total gerencia provedores e licencas.

## Arquitetura

### 1) Portal Provedor
- Login por `providerSlug + usuario + senha`
- Ambiente isolado por provedor (usuarios, roles, projetos, auditoria e licenca)
- Gestor pode:
  - criar/editar/remover usuarios do seu provedor
  - ajustar permissoes por perfil no seu provedor
  - operar projetos FTTH no seu workspace

### 2) Portal Global
- Rota especial: `/system`
- Login do admin global separado do login de provedor
- Pode:
  - cadastrar provedores
  - autorizar/revogar provedores
  - editar/remover provedores
  - criar/editar/revogar licencas de cada provedor
  - auditar eventos globais

## Seguranca do Login Global

Credenciais do admin global ficam em arquivo separado:

- `backend/config/system-admin.js`

Voce pode sobrescrever por variaveis de ambiente:
- `SYSTEM_ADMIN_USERNAME`
- `SYSTEM_ADMIN_DISPLAY_NAME`
- `SYSTEM_ADMIN_PASSWORD` (simples/dev)
- `SYSTEM_ADMIN_PASSWORD_HASH` (recomendado)

## Execucao

```bash
npm install
npm run api:dev
```

Em outro terminal:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Portal global: `http://localhost:5173/system`

## Credenciais iniciais

### Provedor
- Nao existe mais criacao automatica de provedor demo.
- Primeiro acesse `/system` e cadastre o provedor com o gestor inicial.
- Se voce vier de base antiga, o provedor migrado permanece no banco.

### Admin global
- Usuario default: `masteradmin`
- Senha default correspondente ao hash em `backend/config/system-admin.js`

## Scripts

- `npm run dev`: frontend Vite
- `npm run api:dev`: backend com watch
- `npm run api:start`: backend sem watch
- `npm run build`: TypeScript + build frontend
- `npm run test`: testes unitarios
- `npm run lint`: ESLint

## Banco local

- Arquivo: `backend/data/db.json`
- Suporta migracao automatica de schema antigo para o novo multi-tenant.
