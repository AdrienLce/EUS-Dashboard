import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        // Exclude the data/ folder from the Vite watcher — otherwise every config
        // write (theme, services...) triggers an HMR reload in dev
        ignored: ['**/data/**', '**/.git/**', '**/node_modules/**'],
        // Uses watchman (installed via brew) — avoids EMFILE on macOS
        usePolling: false,
      },
    },
  },

  css: ['~/assets/css/main.css'],

  nitro: {
    experimental: {
      websocket: true,
    },
    storage: {
      config: {
        driver: 'fs',
        base: './data',
      },
    },
  },

  runtimeConfig: {
    public: {},
  },
})
