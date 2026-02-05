import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // WICHTIG: Hier muss dein Repo-Name stehen, z.B. '/library-trainer/'
  base: '/library-trainer/', 
})