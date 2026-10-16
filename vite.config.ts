import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'api-server-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/connections')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              status: 'connected',
              broker: 'XM Global',
              platform: 'MetaTrader 5',
              account: '1071031680',
              currency: 'USD',
              symbol: 'GOLD / XAUUSD',
              balance: 10428.50,
              equity: 10428.50,
              margin: 0,
              freeMargin: 10428.50,
              connectedAt: new Date().toISOString(),
              pingMs: 24,
              feedStatus: 'REALTIME_STREAM'
            }));
            return;
          }

          if (req.url?.startsWith('/api/market-data')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              symbol: 'XAUUSD',
              bid: 4148.20,
              ask: 4148.55,
              spread: 0.35,
              timestamp: new Date().toISOString()
            }));
            return;
          }

          next();
        });
      }
    }
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true
  }
});
