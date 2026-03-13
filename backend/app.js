import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { ensureDb } from './storage.js';
import { createProviderRouter } from './routes/provider.js';
import { createSystemRouter } from './routes/system.js';

const JWT_SECRET = process.env.API_JWT_SECRET || 'change-me-in-production';
const ACCESS_TOKEN_TTL = process.env.API_TOKEN_TTL || '10h';

const corsOrigin = process.env.API_CORS_ORIGIN
  ? process.env.API_CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
  : '*';

export const dbReadyPromise = ensureDb();

export const app = express();

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '20mb' }));

app.use(async (_req, _res, next) => {
  try {
    await dbReadyPromise;
    next();
  } catch (error) {
    next(error);
  }
});

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
