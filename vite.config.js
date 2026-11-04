import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(),react()],

  server: {
    proxy: {
      "/gutendex": {
        target: "https://gutendex.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gutendex/,"")
      }
    }
  }
})
