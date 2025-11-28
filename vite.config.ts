import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import fs from "fs";

// https://vite.dev/config/
export default defineConfig(() => {
  const buildTime = JSON.stringify(new Date().toISOString())

  return {
    define: {
      __BUILD_TIME__: buildTime,
    },
    plugins: [
      tailwindcss(),
      react(),
      visualizer(),
      {
        name: "write-build-version",
        apply: "build",
        closeBundle() {
          const file = path.resolve("dist/build-version.txt");
          fs.writeFileSync(file, buildTime, "utf8");
          console.log(" build-version.txt written:", buildTime);
        },
      }
    ],
    build: {
      sourcemap: true,
      manifest: true,
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
  }
})
