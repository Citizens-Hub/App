import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    tailwindcss(), 
    react(),
    visualizer()
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react@')) return 'react-vendor';
          if (id.includes('node_modules/lucide-react@')) return 'react-vendor';
          if (id.includes('node_modules/@mui/')) return 'mui-vendor';
          if (id.includes('node_modules/react-joyride@')) return 'react-joyride-vendor';
          if (id.includes('node_modules/reactflow@')) return 'reactflow-vendor';
          if (id.includes('node_modules/react-redux@')) return 'react-redux-vendor';
          if (id.includes('node_modules/react-router@')) return 'react-router-vendor';
          if (id.includes('node_modules/react-helmet@')) return 'react-helmet-vendor';
          if (id.includes('node_modules/react-intl@')) return 'react-intl-vendor';
          if (id.includes('node_modules/refractor')) return 'refractor-vendor';
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    },
  },
})
