import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so a production build works whether it is served
  // from a domain root or from a GitHub Pages project subpath
  // (username.github.io/repo-name/) without needing to be rebuilt.
  base: './',
})
