import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    host: 'localhost'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Firebase SDK — large, rarely changes
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database'],
          // Document processing libs
          'vendor-docs': ['mammoth', 'docx-preview'],
          // React core
          'vendor-react': ['react', 'react-dom'],
          // Icons
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
})
