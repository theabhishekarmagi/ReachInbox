import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5001',
      '/auth': 'http://localhost:5001'
    }
  }
});
