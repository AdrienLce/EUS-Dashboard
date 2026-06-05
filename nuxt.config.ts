import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  vite: {
    plugins: [tailwindcss()],
  },

  css: ['~/assets/css/main.css'],

  nitro: {
    storage: {
      // Stockage fichier — partagé entre tous les utilisateurs du déploiement
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
