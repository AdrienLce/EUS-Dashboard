import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        // Exclure le dossier data/ du watcher Vite — sinon chaque écriture
        // de config (theme, services...) déclenche un HMR reload en dev
        ignored: ['**/data/**'],
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
