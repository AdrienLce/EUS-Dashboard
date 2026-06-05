<script setup lang="ts">
import type { ServiceConfig, StatusLevel, CustomMapping } from "~/types";
import { LEVEL_LABELS } from "~/types";
import { PRESET_SERVICES } from "~/adapters/index";
import { autoDetectLevel, getValueAtPath } from "~/adapters/custom";
import { rssToStructured } from "~/adapters/rss";
import { runAdapter } from "~/adapters/index";

interface SiblingEntry {
  id: string;
  name: string;
  adapter: string;
}

const props = defineProps<{
  open: boolean;
  editing?: ServiceConfig | null;
  siblings?: SiblingEntry[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", config: Omit<ServiceConfig, "id" | "createdAt">): void;
  (e: "select-sibling", sibling: SiblingEntry): void;
}>();

const ADAPTERS = [
  { value: "github", label: "GitHub Status" },
  { value: "atlassian", label: "Atlassian / Statuspage" },
  { value: "aws", label: "AWS Health" },
  { value: "azuredevops", label: "Azure DevOps" },
  { value: "rss", label: "RSS / Atom" },
  { value: "notion", label: "Notion" },
  { value: "custom", label: "Personnalisé (mapping)" },
  { value: "auto", label: "Auto-détection" },
];

const LEVELS = Object.entries(LEVEL_LABELS).map(([value, label]) => ({
  value: value as StatusLevel,
  label,
}));

const AUTH_TYPES = [
  { value: "none", label: "Aucune" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "apikey", label: "API Key (header)" },
];

// ── Form state ──────────────────────────────────────────────
const defaultForm = () => ({
  name: "",
  url: "",
  method: "GET" as const,
  adapter: "auto",
  headers: [] as { key: string; value: string }[],
  body: "",
  group: "",
  pollInterval: 60,
  enabled: true,
});

const defaultAuth = () => ({
  type: "none" as "none" | "bearer" | "basic" | "apikey",
  token: "",
  username: "",
  password: "",
  headerName: "X-API-Key",
  headerValue: "",
  showSecret: false,
});

const defaultMapping = (): CustomMapping => ({
  statusPath: "",
  messagePath: "",
  levelMap: {},
});

const form = reactive(defaultForm());
const auth = reactive(defaultAuth());
const mapping = reactive(defaultMapping());

// ── Adapter path metadata ────────────────────────────────────
const ADAPTER_PATHS: Record<
  string,
  { statusPath: string; messagePath?: string; note?: string }
> = {
  atlassian: {
    statusPath: "status.indicator",
    messagePath: "status.description",
  },
  github: { statusPath: "status.indicator", messagePath: "status.description" },
  notion: { statusPath: "status.indicator", messagePath: "status.description" },
  azuredevops: { statusPath: "status.health", messagePath: "status.message" },
  aws: {
    statusPath: "",
    note: "Basé sur current_events[] — pas de chemin unique",
  },
  rss: {
    statusPath: "entries.0.title",
    messagePath: "entries.0.summary",
    note: "Flux RSS parsé — chemins sur structure convertie (entries.0.title, entry_count…)",
  },
};

const adapterInfo = computed(() => ADAPTER_PATHS[form.adapter] ?? null);

const resolvedAdapterValues = computed(() => {
  if (!testResult.value || !adapterInfo.value) return null;
  const info = adapterInfo.value;
  if (!info.statusPath) return null;
  // Pour RSS : utiliser la structure parsée, pas le XML brut
  const source = isRawXml.value ? rssStructured.value : testResult.value;
  const statusVal = getValueAtPath(source, info.statusPath);
  const messageVal = info.messagePath
    ? getValueAtPath(source, info.messagePath)
    : undefined;
  return {
    statusPath: info.statusPath,
    statusValue: String(statusVal ?? "—"),
    messagePath: info.messagePath,
    messageValue: messageVal !== undefined ? String(messageVal) : undefined,
    note: info.note,
  };
});

// ── Test / preview state ─────────────────────────────────────
const rightTab = ref<"response" | "preview">("response");
const testResult = ref<unknown>(null);
const testError = ref<string | null>(null);
const testLoading = ref(false);
const testHttpStatus = ref<number | null>(null);

// Détection flux RSS brut
const isRawXml = computed(() => {
  if (!testResult.value || typeof testResult.value !== "object") return false;
  const raw = (testResult.value as { _raw?: unknown })._raw;
  if (typeof raw !== "string") return false;
  return raw.includes("<?xml") || raw.includes("<feed") || raw.includes("<rss");
});

// Structure navigable du flux RSS (pour le JSON tree)
const rssStructured = computed(() => {
  if (!isRawXml.value || !testResult.value) return null;
  const raw = (testResult.value as { _raw: string })._raw;
  return rssToStructured(raw);
});

// Ce qu'on affiche dans l'arbre JSON : structure parsée pour RSS, JSON brut sinon
const treeData = computed(() =>
  isRawXml.value ? rssStructured.value : testResult.value,
);

// Popup "mapper cette clé"
const mapPopup = ref<{ path: string; value: unknown } | null>(null);
const mapTarget = ref<"status" | "message">("status");

// Highlighted paths in JSON tree
const highlightedPaths = computed(() => {
  const paths: string[] = [];
  if (mapping.statusPath) paths.push(mapping.statusPath);
  if (mapping.messagePath) paths.push(mapping.messagePath);
  return paths;
});

// Preview of parsed result
const parsedPreview = computed(() => {
  if (!testResult.value) return null;
  try {
    const adapter = form.adapter === "custom" ? "custom" : form.adapter;
    return runAdapter(adapter, testResult.value, {
      statusPath: mapping.statusPath,
      messagePath: mapping.messagePath || undefined,
      levelMap: mapping.levelMap,
    });
  } catch {
    return null;
  }
});

// ── Load existing service for edit ──────────────────────────
function detectAuthFromHeaders(headers: Record<string, string>): string | null {
  Object.assign(auth, defaultAuth());
  const authEntry = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "authorization",
  );
  if (authEntry) {
    const val = authEntry[1];
    if (val.startsWith("Bearer ")) {
      auth.type = "bearer";
      auth.token = val.slice(7);
      return authEntry[0];
    }
    if (val.startsWith("Basic ")) {
      auth.type = "basic";
      try {
        const d = atob(val.slice(6));
        const s = d.indexOf(":");
        auth.username = d.slice(0, s);
        auth.password = d.slice(s + 1);
      } catch {}
      return authEntry[0];
    }
  }
  const apiEntry = Object.entries(headers).find(
    ([k, v]) =>
      k.toLowerCase() !== "authorization" &&
      v.length > 8 &&
      !k.toLowerCase().startsWith("content"),
  );
  if (apiEntry) {
    auth.type = "apikey";
    auth.headerName = apiEntry[0];
    auth.headerValue = apiEntry[1];
    return apiEntry[0];
  }
  return null;
}

function loadForm() {
  testResult.value = null;
  testError.value = null;
  testHttpStatus.value = null;
  mapPopup.value = null;

  if (props.editing) {
    form.name = props.editing.name;
    form.url = props.editing.url;
    form.method = props.editing.method;
    form.adapter = props.editing.adapter;
    form.body = props.editing.body ?? "";
    form.group = props.editing.group ?? "";
    form.pollInterval = props.editing.pollInterval;
    form.enabled = props.editing.enabled;
    const detectedKey = detectAuthFromHeaders(props.editing.headers);
    form.headers = Object.entries(props.editing.headers)
      .filter(([k]) => k !== detectedKey)
      .map(([key, value]) => ({ key, value }));
    if (props.editing.customMapping) {
      mapping.statusPath = props.editing.customMapping.statusPath;
      mapping.messagePath = props.editing.customMapping.messagePath ?? "";
      mapping.levelMap = { ...props.editing.customMapping.levelMap };
    } else {
      Object.assign(mapping, defaultMapping());
    }
  } else {
    Object.assign(form, defaultForm());
    Object.assign(auth, defaultAuth());
    Object.assign(mapping, defaultMapping());
  }
}

// Charge au mount si déjà ouvert + quand open passe à true + quand editing change (navigation siblings)
watch(
  () => props.open,
  (open) => {
    if (open) loadForm();
  },
);
watch(
  () => props.editing?.id,
  () => {
    if (props.open) loadForm();
  },
);

// ── Preset ───────────────────────────────────────────────────
function applyPreset(preset: (typeof PRESET_SERVICES)[number]) {
  form.name = preset.name;
  form.url = preset.url;
  form.method = preset.method;
  form.adapter = preset.adapter;
  form.headers = [];
  Object.assign(auth, defaultAuth());
  Object.assign(mapping, defaultMapping());
  testResult.value = null;
  testError.value = null;
}

// ── Test ─────────────────────────────────────────────────────
async function runTest() {
  if (!form.url.trim()) return;
  testLoading.value = true;
  testResult.value = null;
  testError.value = null;
  testHttpStatus.value = null;
  mapPopup.value = null;

  const headers: Record<string, string> = {};
  const authHeader = buildAuthHeader();
  if (authHeader) headers[authHeader.key] = authHeader.value;
  for (const h of form.headers) {
    if (h.key.trim()) headers[h.key.trim()] = h.value;
  }

  try {
    const data = await $fetch("/api/proxy", {
      method: "POST",
      body: {
        url: form.url.trim(),
        method: form.method,
        headers,
        body: form.body || undefined,
      },
    });
    testResult.value = data;
    testHttpStatus.value = 200;
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    testHttpStatus.value = e.statusCode ?? 0;
    testError.value = e.message ?? "Erreur inconnue";
  } finally {
    testLoading.value = false;
  }
}

// ── JSON key click → popup ────────────────────────────────────
function onJsonSelect(payload: { path: string; value: unknown }) {
  mapPopup.value = payload;
  mapTarget.value = "status";
}

const wildcardPath = computed(() => {
  if (!mapPopup.value) return null;
  const path = mapPopup.value.path;
  // entries.0.title → entries.*.title
  const withWild = path.replace(/\.(\d+)\./, ".*.");
  if (withWild !== path) return withWild;
  // entries.0 → entries.* (item complet, fin de chemin)
  const withWildEnd = path.replace(/\.(\d+)$/, ".*");
  return withWildEnd !== path ? withWildEnd : null;
});

// Item complet : entries.0.title → entries.* (sans le champ)
const wildcardItemPath = computed(() => {
  if (!mapPopup.value) return null;
  const path = mapPopup.value.path;
  // entries.0.title → entries.*
  const m = path.match(/^(.+)\.\d+\..+$/);
  return m ? `${m[1]}.*` : null;
});

function applyMapping(target: "status" | "message", useWildcard = false) {
  if (!mapPopup.value) return;
  const path =
    useWildcard && wildcardPath.value
      ? wildcardPath.value
      : mapPopup.value.path;

  if (target === "status") {
    mapping.statusPath = path;
    form.adapter = "custom";
    if (!useWildcard) {
      const val = String(mapPopup.value.value ?? "");
      if (val && !mapping.levelMap[val]) {
        mapping.levelMap[val] = autoDetectLevel(val);
      }
    }
  } else {
    mapping.messagePath = path;
  }
  mapPopup.value = null;
}

function applyMappingItem(target: "status" | "message") {
  if (!wildcardItemPath.value) return;
  if (target === "message") {
    mapping.messagePath = wildcardItemPath.value;
    form.adapter = "custom";
  }
  mapPopup.value = null;
}

function removeLevelEntry(val: string) {
  delete mapping.levelMap[val];
}

function addLevelEntry() {
  mapping.levelMap[""] = "operational";
}

function updateLevelKey(oldKey: string, newKey: string) {
  const val = mapping.levelMap[oldKey];
  delete mapping.levelMap[oldKey];
  mapping.levelMap[newKey] = val;
}

// ── Auth helpers ─────────────────────────────────────────────
function addHeader() {
  form.headers.push({ key: "", value: "" });
}
function removeHeader(i: number) {
  form.headers.splice(i, 1);
}

function buildAuthHeader(): { key: string; value: string } | null {
  switch (auth.type) {
    case "bearer":
      if (!auth.token.trim()) return null;
      return { key: "Authorization", value: `Bearer ${auth.token.trim()}` };
    case "basic":
      if (!auth.username.trim()) return null;
      return {
        key: "Authorization",
        value: `Basic ${btoa(`${auth.username}:${auth.password}`)}`,
      };
    case "apikey":
      if (!auth.headerName.trim() || !auth.headerValue.trim()) return null;
      return { key: auth.headerName.trim(), value: auth.headerValue.trim() };
    default:
      return null;
  }
}

// ── Save ─────────────────────────────────────────────────────
function submit() {
  if (!form.name.trim() || !form.url.trim()) return;
  const headers: Record<string, string> = {};
  const authHeader = buildAuthHeader();
  if (authHeader) headers[authHeader.key] = authHeader.value;
  for (const h of form.headers) {
    if (h.key.trim()) headers[h.key.trim()] = h.value;
  }

  const customMapping: CustomMapping | undefined =
    form.adapter === "custom" && mapping.statusPath
      ? {
          statusPath: mapping.statusPath,
          messagePath: mapping.messagePath || undefined,
          levelMap: { ...mapping.levelMap },
        }
      : undefined;

  emit("save", {
    name: form.name.trim(),
    url: form.url.trim(),
    method: form.method,
    adapter: form.adapter,
    headers,
    customMapping,
    body: form.body || undefined,
    group: form.group || undefined,
    pollInterval: Math.min(Math.max(form.pollInterval, 10), 120),
    enabled: form.enabled,
  });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-sm"
          @click="emit('close')"
        />

        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0 translate-y-4 lg:scale-95"
          enter-to-class="opacity-100 translate-y-0 lg:scale-100"
        >
          <div
            v-if="open"
            class="relative w-full max-w-[95vw] max-h-[92vh] bg-white rounded-2xl shadow-xl flex flex-col"
          >
            <!-- Header -->
            <div
              class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
            >
              <h2 class="font-semibold text-gray-900 text-lg">
                {{ editing ? "Modifier le service" : "Ajouter un service" }}
              </h2>
              <button
                class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                @click="emit('close')"
              >
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <!-- Body: two columns (+ siblings nav si composite) -->
            <div class="flex flex-col lg:flex-row flex-1 min-h-0">
              <!-- Navigation entre sous-services du même composite -->
              <ServiceFormCompositeNav
                v-if="siblings && siblings.length > 0"
                :siblings="siblings"
                :current-id="editing?.id"
                @select="emit('select-sibling', $event)"
              />

              <!-- ── LEFT: Form ───────────────────────────────── -->
              <div
                class="flex-1 overflow-y-auto px-6 py-5 space-y-5 lg:border-r border-gray-100"
              >
                <!-- Presets -->
                <div
                  v-if="!editing && PRESET_SERVICES.length > 0"
                  class="space-y-3"
                >
                  <p
                    class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2"
                  >
                    Préconfigurations
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="preset in PRESET_SERVICES"
                      :key="preset.name"
                      class="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      @click="applyPreset(preset)"
                    >
                      {{ preset.name }}
                    </button>
                  </div>
                </div>

                <!-- Nom -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Nom <span class="text-red-500">*</span></label
                  >
                  <input
                    v-model="form.name"
                    type="text"
                    placeholder="ex: Mon API"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <!-- URL + méthode -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >URL <span class="text-red-500">*</span></label
                  >
                  <div class="flex gap-2">
                    <select
                      v-model="form.method"
                      class="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                    <input
                      v-model="form.url"
                      type="url"
                      placeholder="https://api.example.com/status"
                      class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <!-- Adapter -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Adaptateur</label
                  >
                  <select
                    v-model="form.adapter"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option
                      v-for="a in ADAPTERS"
                      :key="a.value"
                      :value="a.value"
                    >
                      {{ a.label }}
                    </option>
                  </select>
                </div>

                <!-- Mapping info — adapters connus (read-only) -->
                <div
                  v-if="adapterInfo && form.adapter !== 'custom'"
                  class="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-2"
                >
                  <p
                    class="text-xs font-medium text-blue-700 flex items-center gap-1.5"
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
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Mapping de l'adaptateur
                  </p>
                  <div
                    v-if="adapterInfo.note"
                    class="text-xs text-blue-600 italic"
                  >
                    {{ adapterInfo.note }}
                  </div>
                  <template v-else>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span class="text-gray-500">Chemin statut :</span>
                        <code
                          class="ml-1 font-mono bg-blue-100 px-1 rounded text-blue-800"
                          >{{ adapterInfo.statusPath }}</code
                        >
                        <span
                          v-if="resolvedAdapterValues"
                          class="ml-1 text-blue-700 font-medium"
                          >= "{{ resolvedAdapterValues.statusValue }}"</span
                        >
                      </div>
                      <div v-if="adapterInfo.messagePath">
                        <span class="text-gray-500">Chemin message :</span>
                        <code
                          class="ml-1 font-mono bg-blue-100 px-1 rounded text-blue-800"
                          >{{ adapterInfo.messagePath }}</code
                        >
                      </div>
                    </div>
                    <p
                      v-if="!resolvedAdapterValues"
                      class="text-xs text-blue-400 italic"
                    >
                      Lancez un test pour voir les valeurs résolues
                    </p>
                  </template>
                </div>

                <!-- Custom mapping (visible si adapter=custom) -->
                <div
                  v-if="form.adapter === 'custom'"
                  class="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3"
                >
                  <p
                    class="text-xs font-medium text-blue-700 flex items-center gap-1.5"
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Mapping personnalisé — cliquez sur une clé dans la réponse →
                  </p>

                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Chemin statut</label
                      >
                      <input
                        v-model="mapping.statusPath"
                        type="text"
                        placeholder="ex: status.indicator"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Chemin message</label
                      >
                      <input
                        v-model="mapping.messagePath"
                        type="text"
                        placeholder="ex: status.description"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>

                  <!-- Level map entries -->
                  <div
                    v-if="Object.keys(mapping.levelMap).length > 0"
                    class="space-y-1.5"
                  >
                    <label class="block text-xs text-gray-500"
                      >Correspondances valeur → niveau
                      <span class="text-gray-400 font-normal normal-case"
                        >· exact, <code class="font-mono">*wildcard*</code>,
                        <code class="font-mono">~contient</code>,
                        <code class="font-mono">/regex/i</code></span
                      ></label
                    >
                    <div
                      v-for="(level, val) in mapping.levelMap"
                      :key="val"
                      class="flex items-center gap-2"
                    >
                      <input
                        :value="val"
                        type="text"
                        placeholder="valeur API"
                        class="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        @change="
                          updateLevelKey(
                            String(val),
                            ($event.target as HTMLInputElement).value,
                          )
                        "
                      />
                      <span class="text-gray-400 text-xs">→</span>
                      <select
                        :value="level"
                        class="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        @change="
                          mapping.levelMap[String(val)] = (
                            $event.target as HTMLSelectElement
                          ).value as StatusLevel
                        "
                      >
                        <option
                          v-for="l in LEVELS"
                          :key="l.value"
                          :value="l.value"
                        >
                          {{ l.label }}
                        </option>
                      </select>
                      <button
                        class="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        @click="removeLevelEntry(String(val))"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <button
                    class="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    @click="addLevelEntry"
                  >
                    + Ajouter correspondance
                  </button>
                </div>

                <!-- Auth -->
                <div
                  class="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3"
                >
                  <div class="flex items-center gap-2">
                    <svg
                      class="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    <label class="text-sm font-medium text-gray-700"
                      >Authentification</label
                    >
                  </div>
                  <select
                    v-model="auth.type"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option
                      v-for="t in AUTH_TYPES"
                      :key="t.value"
                      :value="t.value"
                    >
                      {{ t.label }}
                    </option>
                  </select>
                  <div v-if="auth.type === 'bearer'">
                    <label class="block text-xs text-gray-500 mb-1"
                      >Token</label
                    >
                    <div class="flex gap-2">
                      <input
                        v-model="auth.token"
                        :type="auth.showSecret ? 'text' : 'password'"
                        placeholder="eyJhbGci..."
                        autocomplete="new-password"
                        class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <button
                        type="button"
                        class="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white text-xs"
                        @click="auth.showSecret = !auth.showSecret"
                      >
                        {{ auth.showSecret ? "Cacher" : "Voir" }}
                      </button>
                    </div>
                  </div>
                  <div v-if="auth.type === 'basic'" class="space-y-2">
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="block text-xs text-gray-500 mb-1"
                          >Utilisateur</label
                        >
                        <input
                          v-model="auth.username"
                          type="text"
                          autocomplete="username"
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-500 mb-1"
                          >Mot de passe</label
                        >
                        <div class="flex gap-1">
                          <input
                            v-model="auth.password"
                            :type="auth.showSecret ? 'text' : 'password'"
                            autocomplete="new-password"
                            class="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                          <button
                            type="button"
                            class="px-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white text-xs shrink-0"
                            @click="auth.showSecret = !auth.showSecret"
                          >
                            {{ auth.showSecret ? "Cacher" : "Voir" }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="auth.type === 'apikey'" class="space-y-2">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Nom du header</label
                      >
                      <input
                        v-model="auth.headerName"
                        type="text"
                        placeholder="X-API-Key"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Valeur</label
                      >
                      <div class="flex gap-2">
                        <input
                          v-model="auth.headerValue"
                          :type="auth.showSecret ? 'text' : 'password'"
                          autocomplete="new-password"
                          class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                        <button
                          type="button"
                          class="px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-white text-xs"
                          @click="auth.showSecret = !auth.showSecret"
                        >
                          {{ auth.showSecret ? "Cacher" : "Voir" }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Headers supplémentaires -->
                <div
                  class="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <svg
                        class="w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 6h16M4 12h16M4 18h7"
                        />
                      </svg>
                      <label class="text-sm font-medium text-gray-700"
                        >En-têtes supplémentaires</label
                      >
                    </div>
                    <button
                      class="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      @click="addHeader"
                    >
                      + Ajouter
                    </button>
                  </div>
                  <div v-if="form.headers.length > 0" class="space-y-2">
                    <div
                      v-for="(header, i) in form.headers"
                      :key="i"
                      class="flex gap-2 items-center"
                    >
                      <input
                        v-model="header.key"
                        type="text"
                        placeholder="Clé"
                        class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <input
                        v-model="header.value"
                        type="text"
                        placeholder="Valeur"
                        class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <button
                        class="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        @click="removeHeader(i)"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p v-else class="text-xs text-gray-400 italic">
                    Aucun en-tête supplémentaire
                  </p>
                </div>

                <!-- Body POST -->
                <div v-if="form.method === 'POST'">
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Corps (JSON)</label
                  >
                  <textarea
                    v-model="form.body"
                    rows="3"
                    placeholder='{"key": "value"}'
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <!-- Intervalle + Groupe -->
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1"
                      >Intervalle (s)</label
                    >
                    <input
                      v-model.number="form.pollInterval"
                      type="number"
                      min="30"
                      max="300"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p class="text-xs text-gray-400 mt-1">30–300 secondes</p>
                  </div>
                  <div v-if="!siblings?.length">
                    <label class="block text-sm font-medium text-gray-700 mb-1"
                      >Section</label
                    >
                    <input
                      v-model="form.group"
                      type="text"
                      placeholder="ex: Infrastructure"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <!-- ── RIGHT: Test & JSON preview ──────────────── -->
              <div
                class="flex-1 flex flex-col border-t lg:border-t-0 border-gray-100 min-w-0"
              >
                <!-- Test bar -->
                <div
                  class="px-5 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0"
                >
                  <button
                    class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                    :disabled="!form.url.trim() || testLoading"
                    @click="runTest"
                  >
                    <svg
                      v-if="testLoading"
                      class="w-4 h-4 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <svg
                      v-else
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Tester
                  </button>

                  <span
                    v-if="testHttpStatus !== null"
                    class="text-xs font-mono px-2 py-1 rounded"
                    :class="
                      testHttpStatus === 200
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    "
                  >
                    HTTP {{ testHttpStatus }}
                  </span>
                  <span
                    v-if="isRawXml"
                    class="text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 font-medium"
                    >RSS / Atom — parsé</span
                  >

                  <!-- Onglets Réponse / Aperçu -->
                  <div
                    v-if="testResult"
                    class="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-0.5"
                  >
                    <button
                      class="px-2.5 py-1 text-xs rounded-md transition-colors"
                      :class="
                        rightTab === 'response'
                          ? 'bg-white shadow-sm font-medium text-gray-900'
                          : 'text-gray-500 hover:text-gray-700'
                      "
                      @click="rightTab = 'response'"
                    >
                      Réponse
                    </button>
                    <button
                      class="px-2.5 py-1 text-xs rounded-md transition-colors"
                      :class="
                        rightTab === 'preview'
                          ? 'bg-white shadow-sm font-medium text-gray-900'
                          : 'text-gray-500 hover:text-gray-700'
                      "
                      @click="rightTab = 'preview'"
                    >
                      Aperçu
                    </button>
                  </div>
                </div>

                <!-- Popup mapping -->
                <div
                  v-if="mapPopup"
                  class="relative mx-5 mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 shrink-0 pr-8"
                >
                  <p class="text-xs font-medium text-blue-800 mb-2">
                    <code class="font-mono bg-blue-100 px-1 rounded">{{
                      mapPopup.path
                    }}</code>
                    =
                    <span class="font-mono text-blue-700"
                      >"{{ String(mapPopup.value) }}"</span
                    >
                  </p>
                  <p class="text-xs text-blue-600 mb-2">
                    Utiliser ce champ comme :
                  </p>
                  <!-- Boutons clé unique -->
                  <div class="flex gap-2 mb-2">
                    <button
                      class="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      @click="applyMapping('status')"
                    >
                      Statut
                    </button>
                    <button
                      class="flex-1 px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                      @click="applyMapping('message')"
                    >
                      Message
                    </button>
                  </div>
                  <!-- Boutons wildcard (si dans un tableau) -->
                  <div
                    v-if="wildcardPath || wildcardItemPath"
                    class="space-y-2 pt-2 border-t border-blue-100"
                  >
                    <!-- Champ spécifique : entries.*.title -->
                    <div v-if="wildcardPath">
                      <p class="text-xs text-blue-500 mb-1.5">
                        Tous les
                        <code class="font-mono bg-blue-100 px-1 rounded">{{
                          wildcardPath
                        }}</code>
                        :
                      </p>
                      <div class="flex gap-2">
                        <button
                          class="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
                          @click="applyMapping('status', true)"
                        >
                          Tous → Statut
                        </button>
                        <button
                          class="flex-1 px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                          @click="applyMapping('message', true)"
                        >
                          Tous → Message
                        </button>
                      </div>
                    </div>
                    <!-- Item complet : entries.* -->
                    <div v-if="wildcardItemPath">
                      <p class="text-xs text-blue-500 mb-1.5">
                        Item complet
                        <code class="font-mono bg-blue-100 px-1 rounded">{{
                          wildcardItemPath
                        }}</code>
                        (titre + description + date) :
                      </p>
                      <button
                        class="w-full px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                        @click="applyMappingItem('message')"
                      >
                        Tous → Message (items complets)
                      </button>
                    </div>
                  </div>
                  <button
                    class="absolute top-3 right-3 p-1 text-blue-400 hover:text-blue-600"
                    @click="mapPopup = null"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <!-- Parse preview -->
                <div
                  v-if="parsedPreview && mapping.statusPath"
                  class="mx-5 mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center gap-3 shrink-0"
                >
                  <StatusBadge :level="parsedPreview.level" size="sm" />
                  <span class="text-xs text-gray-500 truncate">{{
                    parsedPreview.message
                  }}</span>
                </div>

                <!-- Contenu onglet -->
                <div class="flex-1 overflow-y-auto px-5 py-4">
                  <!-- Onglet Réponse -->
                  <template v-if="rightTab === 'response'">
                    <div
                      v-if="testError"
                      class="text-sm text-red-600 bg-red-50 rounded-xl p-3"
                    >
                      {{ testError }}
                    </div>
                    <div
                      v-else-if="testResult"
                      class="bg-gray-50 rounded-xl p-3"
                    >
                      <div
                        v-if="isRawXml"
                        class="mb-3 text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2"
                      >
                        Flux RSS/Atom converti en JSON navigable.<br />
                        <strong>Statut</strong> :
                        <code class="font-mono">entries.0.title</code> (item
                        unique) ou
                        <code class="font-mono">entries.*.title</code> (pire
                        niveau de tous → génère des incidents)<br />
                        <strong>Message</strong> :
                        <code class="font-mono">entries.*.summary</code> (tous
                        les textes affichés, sans créer d'incidents)
                      </div>
                      <JsonTree
                        :data="treeData"
                        :highlight-paths="highlightedPaths"
                        @select="onJsonSelect"
                      />
                    </div>
                    <div
                      v-else
                      class="flex flex-col items-center justify-center h-full text-center py-12"
                    >
                      <div
                        class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3"
                      >
                        <svg
                          class="w-6 h-6 text-gray-300"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <p class="text-sm text-gray-400">
                        Configurez l'URL<br />et cliquez sur Tester
                      </p>
                    </div>
                  </template>

                  <!-- Onglet Aperçu -->
                  <template v-else>
                    <div
                      v-if="!testResult"
                      class="flex flex-col items-center justify-center h-full text-center py-12"
                    >
                      <p class="text-sm text-gray-400">
                        Lancez un test pour voir l'aperçu
                      </p>
                    </div>
                    <div v-else class="space-y-4">
                      <!-- Card prévisualisée -->
                      <div class="max-w-xs">
                        <ServiceCard
                          :name="form.name || 'Nom du service'"
                          :snapshot="
                            parsedPreview
                              ? {
                                  serviceId: '__preview__',
                                  timestamp: new Date().toISOString(),
                                  level: parsedPreview.level,
                                  message: parsedPreview.message,
                                  incidents: parsedPreview.incidents,
                                }
                              : undefined
                          "
                        />
                      </div>
                      <!-- Détail parsé -->
                      <div
                        v-if="parsedPreview"
                        class="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs space-y-2"
                      >
                        <p
                          class="font-medium text-gray-600 uppercase tracking-wider"
                        >
                          Résultat parsé
                        </p>
                        <div class="flex items-center gap-2">
                          <span class="text-gray-500">Niveau :</span>
                          <StatusBadge :level="parsedPreview.level" size="sm" />
                        </div>
                        <div>
                          <span class="text-gray-500">Message :</span>
                          <span class="ml-1 text-gray-700">{{
                            parsedPreview.message
                          }}</span>
                        </div>
                        <div v-if="parsedPreview.incidents.length">
                          <span class="text-gray-500">Incidents :</span>
                          <span class="ml-1 text-gray-700">{{
                            parsedPreview.incidents.length
                          }}</span>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div
              class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0"
            >
              <button
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                @click="emit('close')"
              >
                Annuler
              </button>
              <button
                class="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                :disabled="!form.name.trim() || !form.url.trim()"
                @click="submit"
              >
                {{ editing ? "Enregistrer" : "Ajouter" }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
