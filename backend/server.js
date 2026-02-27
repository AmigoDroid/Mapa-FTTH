import { app, dbReadyPromise } from './app.js';
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
dbReadyPromise.then(() => {
  app.listen(PORT, () => {
    console.log(`API FTTH Multi-tenant em http://localhost:${PORT}`);
  });
});
