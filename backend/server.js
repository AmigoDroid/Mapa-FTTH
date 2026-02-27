import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { ensureDb } from './storage.js';
import { createProviderRouter } from './routes/provider.js';
import { createSystemRouter } from './routes/system.js';

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const JWT_SECRET = process.env.API_JWT_SECRET || 'change-me-in-production';
const ACCESS_TOKEN_TTL = process.env.API_TOKEN_TTL || '10h';

const corsOrigin = process.env.API_CORS_ORIGIN
  ? process.env.API_CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
  : '*';

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '5mb' }));

app.use('/api', createProviderRouter({ jwtSecret: JWT_SECRET, accessTokenTtl: ACCESS_TOKEN_TTL }));
app.use('/api/system', createSystemRouter({ jwtSecret: JWT_SECRET, accessTokenTtl: ACCESS_TOKEN_TTL }));

app.use((error, _req, res, _next) => {
  res.status(500).json({
    message: 'Erro interno da API.',
    detail:
      process.env.NODE_ENV === 'development'
        ? String(error?.message || error)
        : undefined,
  });
});

ensureDb().then(() => {
  app.listen(PORT, () => {
    console.log(`API FTTH Multi-tenant em http://localhost:${PORT}`);
  });
});
