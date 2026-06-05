<script setup lang="ts">
import { useTheme } from "~/composables/useTheme";
import { useDisplayMode } from "~/composables/useDisplayMode";
import { useAccessControl } from "~/composables/useAccessControl";
import { useLevelConfig } from "~/composables/useLevelConfig";
import { DEFAULT_LEVEL_CONFIGS } from "~/types";
import { levelStyles } from "~/composables/useLevelConfig";
import type { LevelConfig } from "~/types";

definePageMeta({ middleware: "auth" });
useHead({ title: "Paramètres — Status Concentrateur" });

const { theme, themes, setTheme } = useTheme();
const { pageStyle, setPageStyle } = useDisplayMode();
const {
  accessConfig,
  checkPassword,
  hashPassword,
  saveConfig,
  testSSOConfig,
  ssoTestResult,
  ssoTesting,
} = useAccessControl();
const { levels, save: saveLevels } = useLevelConfig();

// ── Niveaux ──────────────────────────────────────────────────
const levelDraft = ref<LevelConfig[]>([]);
watch(
  () => levels.value,
  (v) => {
    levelDraft.value = v.map((l) => ({ ...l }));
  },
  { immediate: true, deep: true },
);

function applyLevels() {
  levels.value = levelDraft.value.map((l) => ({ ...l }));
  saveLevels();
  savedLevels.value = true;
  setTimeout(() => {
    savedLevels.value = false;
  }, 2000);
}
function resetLevels() {
  levelDraft.value = DEFAULT_LEVEL_CONFIGS.map((l) => ({ ...l }));
}
const savedLevels = ref(false);

// ── Accès ────────────────────────────────────────────────────
const accessMode = computed({
  get: () => accessConfig.value.mode,
  set: (v) => {
    accessConfig.value.mode = v;
  },
});
const passwordInput = ref("");
const passwordConfirm = ref("");
const passwordError = ref("");
const passwordSaved = ref(false);
const showPass = ref(false);

async function savePassword() {
  passwordError.value = "";
  if (!passwordInput.value) {
    passwordError.value = "Mot de passe vide";
    return;
  }
  if (passwordInput.value !== passwordConfirm.value) {
    passwordError.value = "Les mots de passe ne correspondent pas";
    return;
  }
  accessConfig.value.passwordHash = await hashPassword(passwordInput.value);
  passwordInput.value = "";
  passwordConfirm.value = "";
  passwordSaved.value = true;
  setTimeout(() => {
    passwordSaved.value = false;
  }, 2000);
  // Persister dans la config serveur
  await $fetch("/api/config", {
    method: "POST",
    body: { accessControl: accessConfig.value },
  }).catch(() => {});
}

function removePassword() {
  accessConfig.value.passwordHash = undefined;
  accessConfig.value.mode = "none";
}

// ── Style de page ────────────────────────────────────────────
const PAGE_STYLES = [
  {
    value: "box" as const,
    label: "Box",
    description: "Contenu centré, largeur max 1200px",
  },
  {
    value: "large" as const,
    label: "Large",
    description: "Pleine largeur d'écran",
  },
];
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Nav -->
    <nav class="bg-white border-gray-100 border-b sticky top-0 z-40">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center">
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/"
            class="p-1.5 rounded-lg text-gray-500 hover:bg-white transition-colors"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </NuxtLink>
          <span class="font-semibold text-gray-900">Paramètres</span>
        </div>
      </div>
    </nav>

    <main class="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <!-- ── Apparence ──────────────────────────────────────── -->
      <section>
        <h2 class="text-lg font-semibold text-gray-900 mb-1">Apparence</h2>
        <p class="text-sm text-gray-500 mb-6">
          Personnalisez l'affichage du tableau de bord.
        </p>

        <!-- Style de page -->
        <div class="bg-white border-gray-100 rounded-xl border p-5 mb-4">
          <h3 class="text-sm font-medium text-gray-900 mb-3">Style de page</h3>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="s in PAGE_STYLES"
              :key="s.value"
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
              :class="
                pageStyle === s.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              "
              @click="setPageStyle(s.value)"
            >
              <!-- Mockup -->
              <div
                class="w-full h-12 rounded-lg overflow-hidden border border-gray-200 flex items-center gap-1 p-1"
              >
                <div
                  v-if="s.value === 'box'"
                  class="mx-auto w-2/3 h-full bg-gray-200 rounded"
                />
                <div v-else class="w-full h-full bg-gray-200 rounded" />
              </div>
              <div class="text-center">
                <p class="text-sm font-medium text-gray-900">{{ s.label }}</p>
                <p class="text-xs text-gray-500">{{ s.description }}</p>
              </div>
            </button>
          </div>
        </div>

        <!-- Thème -->
        <div class="bg-white border-gray-100 rounded-xl border p-5">
          <h3 class="text-sm font-medium text-gray-900 mb-3">Thème</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              v-for="t in themes"
              :key="t.value"
              class="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all"
              :class="
                theme === t.value
                  ? 'border-blue-500'
                  : 'border-gray-200 hover:border-gray-300'
              "
              @click="setTheme(t.value)"
            >
              <!-- Pastilles de couleur du thème -->
              <div
                class="w-10 h-10 rounded-lg border"
                :class="{
                  'bg-white border-gray-200': t.value === 'light',
                  'bg-slate-800 border-slate-600': t.value === 'dark',
                }"
              />
              <div class="text-center">
                <p class="text-xs font-medium text-gray-900">{{ t.label }}</p>
                <p class="text-xs text-gray-400 hidden sm:block">
                  {{ t.description }}
                </p>
              </div>
            </button>
          </div>
        </div>
      </section>

      <!-- ── Niveaux de statut ──────────────────────────────── -->
      <section>
        <h2 class="text-lg font-semibold text-gray-900 mb-1">
          Niveaux de statut
        </h2>
        <p class="text-sm text-gray-500 mb-6">
          Personnalisez les libellés et couleurs de chaque niveau. La référence
          est fixe et rappelle la sémantique du niveau.
        </p>

        <div class="space-y-2">
          <div
            v-for="cfg in levelDraft"
            :key="cfg.id"
            class="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4"
          >
            <!-- Color picker discret -->
            <div class="relative shrink-0" :title="`Couleur : ${cfg.color}`">
              <span
                class="block w-5 h-5 rounded-full cursor-pointer ring-2 ring-offset-2 ring-transparent hover:ring-gray-300 transition-all"
                :style="{ backgroundColor: cfg.color }"
              />
              <input
                v-model="cfg.color"
                type="color"
                class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            <!-- Badge aperçu -->
            <span
              class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 w-44"
              :style="levelStyles(cfg.color).badge"
            >
              <span
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :style="levelStyles(cfg.color).dot"
              />
              {{ cfg.label }}
            </span>

            <!-- Référence immuable -->
            <span class="flex-1 text-xs text-gray-400 italic truncate">{{
              cfg.reference
            }}</span>

            <!-- Label éditable -->
            <input
              v-model="cfg.label"
              type="text"
              class="w-44 shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between mt-4">
          <button
            class="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            @click="resetLevels"
          >
            Réinitialiser
          </button>
          <button
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="
              savedLevels
                ? 'bg-green-600 text-white'
                : 'bg-gray-900 text-white hover:bg-gray-700'
            "
            @click="applyLevels"
          >
            <svg
              v-if="savedLevels"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            {{ savedLevels ? "Enregistré ✓" : "Enregistrer" }}
          </button>
        </div>
      </section>

      <!-- ── Sécurité ───────────────────────────────────────── -->
      <section>
        <h2 class="text-lg font-semibold text-gray-900 mb-1">Sécurité</h2>
        <p class="text-sm text-gray-500 mb-6">
          Protégez la page de gestion des services contre les modifications non
          autorisées.
        </p>

        <div class="bg-white border-gray-100 rounded-xl border p-5 space-y-5">
          <!-- Mode -->
          <div>
            <label class="block text-sm font-medium text-gray-900 mb-3"
              >Mode de protection</label
            >
            <div class="space-y-2">
              <label
                v-for="opt in [
                  {
                    value: 'none',
                    label: 'Aucune',
                    desc: 'Tout le monde peut modifier la configuration.',
                  },
                  {
                    value: 'password',
                    label: 'Mot de passe simple',
                    desc: 'Un mot de passe est demandé avant d\'accéder à la gestion.',
                  },
                  {
                    value: 'sso',
                    label: 'SSO / OIDC',
                    desc: 'Authentification déléguée à un fournisseur d\'identité (configuration manuelle requise).',
                  },
                ]"
                :key="opt.value"
                class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="
                  accessMode === opt.value
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-100'
                "
              >
                <input
                  type="radio"
                  :value="opt.value"
                  v-model="accessMode"
                  class="mt-0.5 accent-blue-600"
                />
                <div>
                  <p class="text-sm font-medium text-gray-900">
                    {{ opt.label }}
                  </p>
                  <p class="text-xs text-gray-500">{{ opt.desc }}</p>
                </div>
              </label>
            </div>
          </div>

          <!-- Config mot de passe -->
          <div
            v-if="accessMode === 'password'"
            class="space-y-3 pt-2 border-t border-gray-200"
          >
            <p class="text-xs text-gray-500">
              Le hash SHA-256 du mot de passe est stocké côté serveur. La
              session est maintenue dans sessionStorage (durée : onglet
              navigateur).
            </p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1"
                  >Nouveau mot de passe</label
                >
                <div class="flex gap-2">
                  <input
                    v-model="passwordInput"
                    :type="showPass ? 'text' : 'password'"
                    autocomplete="new-password"
                    class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  />
                  <button
                    type="button"
                    class="px-2 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-900"
                    @click="showPass = !showPass"
                  >
                    {{ showPass ? "Cacher" : "Voir" }}
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1"
                  >Confirmer</label
                >
                <input
                  v-model="passwordConfirm"
                  :type="showPass ? 'text' : 'password'"
                  autocomplete="new-password"
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                />
              </div>
            </div>
            <p v-if="passwordError" class="text-xs text-red-500">
              {{ passwordError }}
            </p>
            <div class="flex gap-3">
              <button
                class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                :class="
                  passwordSaved
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-900 text-white hover:bg-gray-700'
                "
                @click="savePassword"
              >
                {{ passwordSaved ? "Enregistré ✓" : "Définir le mot de passe" }}
              </button>
              <button
                v-if="accessConfig.passwordHash"
                class="px-3 py-2 text-sm text-red-500 hover:text-red-700 transition-colors"
                @click="removePassword"
              >
                Supprimer
              </button>
            </div>
            <p
              v-if="accessConfig.passwordHash"
              class="text-xs text-green-600 flex items-center gap-1"
            >
              <svg
                class="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Mot de passe défini
            </p>
          </div>

          <!-- Config SSO -->
          <div
            v-if="accessMode === 'sso'"
            class="space-y-3 pt-2 border-t border-gray-200"
          >
            <p class="text-xs text-gray-500">
              Flux OIDC PKCE — aucun client_secret requis. Compatible Keycloak,
              Auth0, Azure AD, Google, Okta…
            </p>

            <div>
              <label class="block text-xs text-gray-500 mb-1"
                >URL de découverte OIDC
                <span class="text-gray-400"
                  >(.well-known/openid-configuration)</span
                ></label
              >
              <div class="flex gap-2">
                <input
                  v-model="accessConfig.ssoDiscoveryUrl"
                  type="url"
                  placeholder="https://accounts.google.com/.well-known/openid-configuration"
                  class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                />
                <button
                  class="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600 disabled:opacity-50 whitespace-nowrap"
                  :disabled="!accessConfig.ssoDiscoveryUrl || ssoTesting"
                  @click="testSSOConfig"
                >
                  {{ ssoTesting ? "Test…" : "Tester" }}
                </button>
              </div>
              <!-- Résultat du test -->
              <div
                v-if="ssoTestResult"
                class="mt-2 rounded-lg border px-3 py-2 text-xs space-y-1"
                :class="
                  ssoTestResult.ok
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-600'
                "
              >
                <p v-if="ssoTestResult.ok" class="font-medium">
                  ✓ IdP accessible
                </p>
                <p v-if="ssoTestResult.authorizationEndpoint">
                  Auth :
                  <code class="font-mono">{{
                    ssoTestResult.authorizationEndpoint
                  }}</code>
                </p>
                <p v-if="ssoTestResult.tokenEndpoint">
                  Token :
                  <code class="font-mono">{{
                    ssoTestResult.tokenEndpoint
                  }}</code>
                </p>
                <p v-if="ssoTestResult.error">{{ ssoTestResult.error }}</p>
              </div>
            </div>

            <div>
              <label class="block text-xs text-gray-500 mb-1">Client ID</label>
              <input
                v-model="accessConfig.ssoClientId"
                type="text"
                placeholder="status-dashboard"
                class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              />
            </div>

            <div>
              <label class="block text-xs text-gray-500 mb-1">
                Redirect URI
                <span class="text-gray-400 font-normal"
                  >(laisser vide = auto-détection)</span
                >
              </label>
              <input
                v-model="accessConfig.ssoRedirectUri"
                type="url"
                :placeholder="`${$config.public.baseUrl ?? 'https://votre-domaine.com'}/auth/callback`"
                class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 font-mono"
              />
              <p class="text-xs text-gray-400 mt-1">
                À enregistrer comme redirect URI autorisée dans votre IdP.
              </p>
            </div>

            <button
              class="w-full px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              :disabled="
                !accessConfig.ssoDiscoveryUrl || !accessConfig.ssoClientId
              "
              @click="saveConfig"
            >
              Enregistrer la configuration SSO
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
