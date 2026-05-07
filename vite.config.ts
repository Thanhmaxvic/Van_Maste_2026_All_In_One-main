import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: false,
      host: 'localhost',
      proxy: {
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              const url = new URL(req.url || '', 'http://localhost');
              const model = url.searchParams.get('model') || 'gemini-3-flash-preview';
              const newUrl = new URL(`/v1beta/models/${model}:generateContent`, 'https://generativelanguage.googleapis.com');

              const apiKey = env.GOOGLE_API_KEY || env.VITE_GOOGLE_API_KEY || '';
              newUrl.searchParams.append('key', apiKey);
              proxyReq.path = newUrl.pathname + newUrl.search;
            });
          }
        },
        '/api/tts': {
          target: 'https://texttospeech.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tts/, '/v1/text:synthesize'),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              const url = new URL(proxyReq.path, 'http://localhost');
              const ttsKey = env.GOOGLE_TTS_API_KEY || env.VITE_GOOGLE_TTS_API_KEY || '';
              url.searchParams.append('key', ttsKey);
              proxyReq.path = url.pathname + url.search;
            });
          }
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database'],
            'vendor-docs': ['mammoth', 'docx-preview'],
            'vendor-react': ['react', 'react-dom'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
  };
})
