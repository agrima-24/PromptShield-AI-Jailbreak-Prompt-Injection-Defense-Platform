import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api goes to the backend on the app laptop (port 8080). In production the backend serves
// the built files itself, so nothing else is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8080' } },
});
