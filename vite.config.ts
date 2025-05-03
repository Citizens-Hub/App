import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(), 
    react(),
    // obfuscatorPlugin({
    //   options: {
    //     // your javascript-obfuscator options
    //     // debugProtection: true,
    //     // ...  [See more options](https://github.com/javascript-obfuscator/javascript-obfuscator)
    //   },
    // }),
  ],
})
