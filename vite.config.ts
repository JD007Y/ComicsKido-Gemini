import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR remounts App.tsx and dumps users mid-generation back to story/layout.
      // Opt in only with ENABLE_HMR=true. AI Studio sets DISABLE_HMR=true as well.
      hmr:
        process.env.DISABLE_HMR === 'true' || process.env.ENABLE_HMR !== 'true'
          ? false
          : true,
      watch:
        process.env.DISABLE_HMR === 'true' || process.env.ENABLE_HMR !== 'true'
          ? null
          : {
              ignored: [
                '**/model_usage_history.json',
                '**/.data/**',
                '**/server.ts',
                '**/.env',
                '**/.env.*',
                '**/node_modules/**',
                '**/.git/**',
              ],
            },
    },
  };
});
