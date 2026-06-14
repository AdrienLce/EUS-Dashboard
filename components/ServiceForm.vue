<script setup lang="ts">
import type { ServiceConfig, StatusLevel, CustomMapping } from "~/types";
import { LEVEL_LABELS } from "~/types";
import { PRESET_SERVICES, ADAPTER_META } from "~/adapters/index";
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
  inComposite?: boolean;
  inheritedAdapter?: string;
  inheritedMapping?: import("~/types").CustomMapping;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", config: Omit<ServiceConfig, "id" | "createdAt">): void;
  (e: "save-and-close", config: Omit<ServiceConfig, "id" | "createdAt">): void;
  (e: "select-sibling", sibling: SiblingEntry): void;
  (
    e: "set-as-default",
    payload: { adapter: string; mapping: import("~/types").CustomMapping },
  ): void;
}>();

const LEVELS = Object.entries(LEVEL_LABELS).map(([value, label]) => ({
  value: value as StatusLevel,
  label,
}));

const AUTH_TYPES = [
  { value: "none", label: "None" },
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
  pollInterval: 300,
  enabled: true,
  // RSS filter (rss adapter only) — 0/empty/false means no filtering
  rssWindowHours: 0,
  rssKeywords: "",
  rssExcludeResolved: false,
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
  incidentsPath: "",
  incidentTitlePath: "",
  incidentLevelPath: "",
  incidentMessagePath: "",
});

const form = reactive(defaultForm());
const auth = reactive(defaultAuth());
const mapping = reactive(defaultMapping());

// ── Adapter path metadata — derived from ADAPTER_META (single source in adapters/index.ts)
const ADAPTER_PATHS = Object.fromEntries(
  ADAPTER_META.filter((a) => a.statusPath !== undefined).map((a) => [
    a.value,
    { statusPath: a.statusPath!, messagePath: a.messagePath, note: a.note },
  ]),
);

const adapterInfo = computed(() => ADAPTER_PATHS[form.adapter] ?? null);

// Inheritance from the parent composite
const isInheritingAdapter = computed(
  () => !!props.inheritedAdapter && (!form.adapter || form.adapter === "auto"),
);
const isInheritingMapping = computed(
  () => !!props.inheritedMapping && !mapping.statusPath,
);
const effectiveAdapter = computed(() =>
  isInheritingAdapter.value ? props.inheritedAdapter : form.adapter,
);
const effectiveMapping = computed(() =>
  isInheritingMapping.value ? props.inheritedMapping : null,
);

const resolvedAdapterValues = computed(() => {
  if (!testResult.value || !adapterInfo.value) return null;
  const info = adapterInfo.value;
  if (!info.statusPath) return null;
  // For RSS: use the parsed structure, not the raw XML
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

// Detection of raw RSS feed
const isRawXml = computed(() => {
  if (!testResult.value || typeof testResult.value !== "object") return false;
  const raw = (testResult.value as { _raw?: unknown })._raw;
  if (typeof raw !== "string") return false;
  return raw.includes("<?xml") || raw.includes("<feed") || raw.includes("<rss");
});

// Navigable structure of the RSS feed (for the JSON tree)
const rssStructured = computed(() => {
  if (!isRawXml.value || !testResult.value) return null;
  const raw = (testResult.value as { _raw: string })._raw;
  return rssToStructured(raw);
});

// What we display in the JSON tree: parsed structure for RSS, raw JSON otherwise
const treeData = computed(() =>
  isRawXml.value ? rssStructured.value : testResult.value,
);

// "Map this key" popup
const mapPopup = ref<{ path: string; value: unknown } | null>(null);
const mapTarget = ref<"status" | "message">("status");

// Highlighted paths in JSON tree
const highlightedPaths = computed(() => {
  const paths: string[] = [];
  if (mapping.statusPath) paths.push(mapping.statusPath);
  if (mapping.messagePath) paths.push(mapping.messagePath);
  if (mapping.incidentsPath) paths.push(mapping.incidentsPath);
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
      incidentsPath: mapping.incidentsPath || undefined,
      incidentTitlePath: mapping.incidentTitlePath || undefined,
      incidentLevelPath: mapping.incidentLevelPath || undefined,
      incidentMessagePath: mapping.incidentMessagePath || undefined,
    }, form.adapter === "rss" ? {
      windowHours: form.rssWindowHours || undefined,
      keywords: form.rssKeywords.split(",").map((k) => k.trim()).filter(Boolean),
      excludeResolved: form.rssExcludeResolved,
    } : undefined);
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
    form.rssWindowHours = props.editing.rss?.windowHours ?? 0;
    form.rssKeywords = (props.editing.rss?.keywords ?? []).join(", ");
    form.rssExcludeResolved = props.editing.rss?.excludeResolved ?? false;
    const detectedKey = detectAuthFromHeaders(props.editing.headers);
    form.headers = Object.entries(props.editing.headers)
      .filter(([k]) => k !== detectedKey)
      .map(([key, value]) => ({ key, value }));
    if (props.editing.customMapping) {
      const cm = props.editing.customMapping;
      mapping.statusPath = cm.statusPath;
      mapping.messagePath = cm.messagePath ?? "";
      mapping.levelMap = { ...cm.levelMap };
      mapping.incidentsPath = cm.incidentsPath ?? "";
      mapping.incidentTitlePath = cm.incidentTitlePath ?? "";
      mapping.incidentLevelPath = cm.incidentLevelPath ?? "";
      mapping.incidentMessagePath = cm.incidentMessagePath ?? "";
    } else {
      Object.assign(mapping, defaultMapping());
    }
  } else {
    Object.assign(form, defaultForm());
    Object.assign(auth, defaultAuth());
    Object.assign(mapping, defaultMapping());
  }
}

// Loads on mount if already open + when open becomes true + when editing changes (siblings navigation)
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
        isPing: form.adapter === "ping",
      },
    });
    testResult.value = data;
    testHttpStatus.value = form.adapter === "ping"
      ? (data as { _statusCode?: number })._statusCode ?? 200
      : 200;
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    testHttpStatus.value = e.statusCode ?? 0;
    testError.value = e.message ?? "Unknown error";
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
  // entries.0 → entries.* (whole item, end of path)
  const withWildEnd = path.replace(/\.(\d+)$/, ".*");
  return withWildEnd !== path ? withWildEnd : null;
});

// Whole item: entries.0.title → entries.* (without the field)
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

// ── Incidents mapping ─────────────────────────────────────────
// Path of the incidents array inferred from the click: "incidents.0.name" → "incidents"
// (.+? non-greedy → we take the FIRST array level encountered)
const incidentArrayPath = computed(() => {
  if (!mapPopup.value) return null;
  const m = mapPopup.value.path.match(/^(.+?)\.\d+(?:\..+)?$/);
  return m ? m[1] : null;
});

// Field relative to an incident item, inferred from the click: "incidents.0.name" → "name"
const incidentFieldFromClick = computed(() => {
  if (!mapPopup.value) return null;
  const m = mapPopup.value.path.match(/^.+?\.\d+\.(.+)$/);
  return m ? m[1] : null;
});

function applyIncidentsList() {
  if (!incidentArrayPath.value) return;
  mapping.incidentsPath = incidentArrayPath.value;
  form.adapter = "custom";
  mapPopup.value = null;
}

function applyIncidentField(target: "title" | "level" | "message") {
  const field = incidentFieldFromClick.value;
  if (!field) return;
  // Make sure the incidents list is set
  if (!mapping.incidentsPath && incidentArrayPath.value) {
    mapping.incidentsPath = incidentArrayPath.value;
  }
  if (target === "title") mapping.incidentTitlePath = field;
  else if (target === "level") {
    mapping.incidentLevelPath = field;
    const val = String(mapPopup.value?.value ?? "");
    if (val && !mapping.levelMap[val]) {
      mapping.levelMap[val] = autoDetectLevel(val);
    }
  } else mapping.incidentMessagePath = field;
  form.adapter = "custom";
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
function buildPayload() {
  const headers: Record<string, string> = {};
  const authHeader = buildAuthHeader();
  if (authHeader) headers[authHeader.key] = authHeader.value;
  for (const h of form.headers) {
    if (h.key.trim()) headers[h.key.trim()] = h.value;
  }
  const customMapping: CustomMapping | undefined =
    form.adapter === "custom" && (mapping.statusPath || mapping.incidentsPath)
      ? {
          statusPath: mapping.statusPath,
          messagePath: mapping.messagePath || undefined,
          levelMap: { ...mapping.levelMap },
          incidentsPath: mapping.incidentsPath || undefined,
          incidentTitlePath: mapping.incidentTitlePath || undefined,
          incidentLevelPath: mapping.incidentLevelPath || undefined,
          incidentMessagePath: mapping.incidentMessagePath || undefined,
        }
      : undefined;

  const rssKeywords = form.rssKeywords.split(",").map((k) => k.trim()).filter(Boolean);
  const rss =
    form.adapter === "rss" &&
    (form.rssWindowHours > 0 || rssKeywords.length > 0 || form.rssExcludeResolved)
      ? {
          windowHours: form.rssWindowHours > 0 ? form.rssWindowHours : undefined,
          keywords: rssKeywords.length ? rssKeywords : undefined,
          excludeResolved: form.rssExcludeResolved || undefined,
        }
      : undefined;

  return {
    name: form.name.trim(),
    url: form.url.trim(),
    method: form.method,
    adapter: form.adapter,
    headers,
    customMapping,
    rss,
    body: form.body || undefined,
    group: form.group || undefined,
    pollInterval: Math.min(Math.max(form.pollInterval, 60), 1200),
    enabled: form.enabled,
  };
}

function submit() {
  if (!form.name.trim() || !form.url.trim()) return;
  emit("save", buildPayload());
}

function submitAndClose() {
  if (!form.name.trim() || !form.url.trim()) return;
  emit("save-and-close", buildPayload());
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
            class="relative w-full max-w-[95vw] h-full max-h-[92vh] bg-white rounded-2xl shadow-xl flex flex-col"
          >
            <!-- Header -->
            <div
              class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0"
            >
              <h2 class="font-semibold text-gray-900 text-lg">
                {{ editing ? "Edit service" : "Add a service" }}
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

            <!-- Body: two columns (+ siblings nav if composite) -->
            <div class="flex flex-col lg:flex-row flex-1 min-h-0">
              <!-- Navigation between sub-services of the same composite -->
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
                    Presets
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

                <!-- Name -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Name <span class="text-red-500">*</span></label
                  >
                  <input
                    v-model="form.name"
                    type="text"
                    placeholder="e.g. My API"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <!-- URL + method -->
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
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-sm font-medium text-gray-700"
                      >Adapter</label
                    >
                    <span
                      v-if="isInheritingAdapter"
                      class="text-xs text-emerald-600 flex items-center gap-1"
                    >
                      <svg
                        class="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                        />
                      </svg>
                      Inherited from group ({{ props.inheritedAdapter }})
                    </span>
                  </div>
                  <select
                    v-model="form.adapter"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option
                      v-for="a in ADAPTER_META"
                      :key="a.value"
                      :value="a.value"
                    >
                      {{ a.label }}
                    </option>
                  </select>
                </div>

                <!-- RSS filter (rss adapter only) -->
                <div
                  v-if="form.adapter === 'rss'"
                  class="rounded-xl border border-amber-100 bg-amber-50/40 p-4 space-y-3"
                >
                  <p class="text-xs font-medium text-amber-700 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                    RSS filter — scope a noisy feed (optional)
                  </p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">Window (hours, 0 = all)</label>
                      <input
                        v-model.number="form.rssWindowHours"
                        type="number"
                        min="0"
                        placeholder="24"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      />
                    </div>
                    <label class="flex items-end gap-2 pb-2 cursor-pointer select-none">
                      <input v-model="form.rssExcludeResolved" type="checkbox" class="w-4 h-4 accent-amber-600" />
                      <span class="text-xs text-gray-600">Exclude resolved entries</span>
                    </label>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Keywords (comma-separated — match any)</label>
                    <input
                      v-model="form.rssKeywords"
                      type="text"
                      placeholder="eu-west-1, us-east-1, ap-southeast-1"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  <p class="text-[11px] text-gray-400">
                    Only entries within the window, matching a keyword, and not resolved count toward the status.
                  </p>
                </div>

                <!-- Mapping info — known adapters (read-only) -->
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
                    Adapter mapping
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
                        <span class="text-gray-500">Status path:</span>
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
                        <span class="text-gray-500">Message path:</span>
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
                      Run a test to see resolved values
                    </p>
                  </template>
                </div>

                <!-- Notice: mapping inherited from the parent composite -->
                <div
                  v-if="isInheritingMapping && inComposite"
                  class="rounded-xl border border-emerald-100 bg-emerald-50 p-3 space-y-2"
                >
                  <div class="flex items-center justify-between">
                    <p
                      class="text-xs font-medium text-emerald-700 flex items-center gap-1.5"
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
                          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                        />
                      </svg>
                      Mapping inherited from group
                    </p>
                    <button
                      type="button"
                      class="text-xs text-emerald-600 hover:text-emerald-800 underline"
                      @click="
                        mapping.statusPath = effectiveMapping?.statusPath ?? '';
                        mapping.messagePath =
                          effectiveMapping?.messagePath ?? '';
                        mapping.levelMap = {
                          ...(effectiveMapping?.levelMap ?? {}),
                        };
                        mapping.incidentsPath =
                          effectiveMapping?.incidentsPath ?? '';
                        mapping.incidentTitlePath =
                          effectiveMapping?.incidentTitlePath ?? '';
                        mapping.incidentLevelPath =
                          effectiveMapping?.incidentLevelPath ?? '';
                        mapping.incidentMessagePath =
                          effectiveMapping?.incidentMessagePath ?? '';
                        form.adapter = 'custom';
                      "
                    >
                      Customize
                    </button>
                  </div>
                  <div
                    class="grid grid-cols-2 gap-2 text-xs font-mono text-emerald-800"
                  >
                    <div>
                      <span class="text-emerald-500">status:</span>
                      {{ effectiveMapping?.statusPath }}
                    </div>
                    <div v-if="effectiveMapping?.messagePath">
                      <span class="text-emerald-500">message:</span>
                      {{ effectiveMapping?.messagePath }}
                    </div>
                  </div>
                </div>

                <!-- Custom mapping (visible if adapter=custom) -->
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
                    Custom mapping — click a key in the response →
                  </p>

                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Status path</label
                      >
                      <input
                        v-model="mapping.statusPath"
                        type="text"
                        placeholder="e.g. status.indicator"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Message path</label
                      >
                      <input
                        v-model="mapping.messagePath"
                        type="text"
                        placeholder="e.g. status.description"
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>

                  <!-- Incidents mapping -->
                  <div class="pt-2 border-t border-blue-100 space-y-2">
                    <label class="block text-xs text-gray-500">
                      Incidents path (list)
                      <span class="text-gray-400 font-normal normal-case">— optional</span>
                    </label>
                    <input
                      v-model="mapping.incidentsPath"
                      type="text"
                      placeholder="e.g. incidents · result.incidents"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <div v-if="mapping.incidentsPath" class="grid grid-cols-3 gap-2">
                      <div>
                        <label class="block text-[11px] text-gray-400 mb-1">Title field</label>
                        <input
                          v-model="mapping.incidentTitlePath"
                          type="text"
                          placeholder="name"
                          class="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label class="block text-[11px] text-gray-400 mb-1">Level field</label>
                        <input
                          v-model="mapping.incidentLevelPath"
                          type="text"
                          placeholder="impact"
                          class="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label class="block text-[11px] text-gray-400 mb-1">Message field</label>
                        <input
                          v-model="mapping.incidentMessagePath"
                          type="text"
                          placeholder="body"
                          class="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>
                    <p v-if="mapping.incidentsPath" class="text-[11px] text-gray-400">
                      The level uses the mapping table below. Empty fields = auto-detect
                      (name/title · impact/status · body/description).
                    </p>
                  </div>

                  <!-- Level map entries -->
                  <div
                    v-if="Object.keys(mapping.levelMap).length > 0"
                    class="space-y-1.5"
                  >
                    <label class="block text-xs text-gray-500"
                      >Value → level mapping
                      <span class="text-gray-400 font-normal normal-case"
                        >· exact, <code class="font-mono">*wildcard*</code>,
                        <code class="font-mono">~contains</code>,
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
                        placeholder="API value"
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
                    + Add mapping
                  </button>
                </div>

                <!-- "Global mapping" button — only visible inside a composite -->
                <button
                  v-if="inComposite && mapping.statusPath"
                  class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  type="button"
                  @click="
                    emit('set-as-default', {
                      adapter: form.adapter,
                      mapping: {
                        statusPath: mapping.statusPath,
                        messagePath: mapping.messagePath || undefined,
                        levelMap: { ...mapping.levelMap },
                        incidentsPath: mapping.incidentsPath || undefined,
                        incidentTitlePath: mapping.incidentTitlePath || undefined,
                        incidentLevelPath: mapping.incidentLevelPath || undefined,
                        incidentMessagePath: mapping.incidentMessagePath || undefined,
                      },
                    })
                  "
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
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                    />
                  </svg>
                  Set as the group's default mapping
                </button>

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
                      >Authentication</label
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
                        {{ auth.showSecret ? "Hide" : "Show" }}
                      </button>
                    </div>
                  </div>
                  <div v-if="auth.type === 'basic'" class="space-y-2">
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="block text-xs text-gray-500 mb-1"
                          >Username</label
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
                          >Password</label
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
                            {{ auth.showSecret ? "Hide" : "Show" }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="auth.type === 'apikey'" class="space-y-2">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1"
                        >Header name</label
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
                        >Value</label
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
                          {{ auth.showSecret ? "Hide" : "Show" }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Additional headers -->
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
                        >Additional headers</label
                      >
                    </div>
                    <button
                      class="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      @click="addHeader"
                    >
                      + Add
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
                        placeholder="Key"
                        class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <input
                        v-model="header.value"
                        type="text"
                        placeholder="Value"
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
                    No additional headers
                  </p>
                </div>

                <!-- Body POST -->
                <div v-if="form.method === 'POST'">
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                    >Body (JSON)</label
                  >
                  <textarea
                    v-model="form.body"
                    rows="3"
                    placeholder='{"key": "value"}'
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <!-- Interval + Group -->
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1"
                      >Interval</label
                    >
                    <select
                      v-model.number="form.pollInterval"
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option v-for="m in 20" :key="m" :value="m * 60">
                        {{ m }} minute{{ m > 1 ? "s" : "" }}
                      </option>
                    </select>
                  </div>
                  <div v-if="!siblings?.length">
                    <label class="block text-sm font-medium text-gray-700 mb-1"
                      >Section</label
                    >
                    <input
                      v-model="form.group"
                      type="text"
                      placeholder="e.g. Infrastructure"
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
                    Test
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
                    >RSS / Atom — parsed</span
                  >

                  <!-- Response / Preview tabs -->
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
                      Response
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
                      Preview
                    </button>
                  </div>
                </div>

                <!-- Mapping popup -->
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
                    Use this field as:
                  </p>
                  <!-- Single key buttons -->
                  <div class="flex gap-2 mb-2">
                    <button
                      class="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      @click="applyMapping('status')"
                    >
                      Status
                    </button>
                    <button
                      class="flex-1 px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                      @click="applyMapping('message')"
                    >
                      Message
                    </button>
                  </div>
                  <!-- Wildcard buttons (if inside an array) -->
                  <div
                    v-if="wildcardPath || wildcardItemPath"
                    class="space-y-2 pt-2 border-t border-blue-100"
                  >
                    <!-- Specific field: entries.*.title -->
                    <div v-if="wildcardPath">
                      <p class="text-xs text-blue-500 mb-1.5">
                        All
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
                          All → Status
                        </button>
                        <button
                          class="flex-1 px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                          @click="applyMapping('message', true)"
                        >
                          All → Message
                        </button>
                      </div>
                    </div>
                    <!-- Whole item: entries.* -->
                    <div v-if="wildcardItemPath">
                      <p class="text-xs text-blue-500 mb-1.5">
                        Whole item
                        <code class="font-mono bg-blue-100 px-1 rounded">{{
                          wildcardItemPath
                        }}</code>
                        (title + description + date):
                      </p>
                      <button
                        class="w-full px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                        @click="applyMappingItem('message')"
                      >
                        All → Message (whole items)
                      </button>
                    </div>
                  </div>
                  <!-- Incident buttons (if inside an array) -->
                  <div
                    v-if="incidentArrayPath"
                    class="space-y-2 pt-2 border-t border-blue-100"
                  >
                    <p class="text-xs text-blue-500 mb-1.5">
                      Incidents — list
                      <code class="font-mono bg-blue-100 px-1 rounded">{{ incidentArrayPath }}</code>
                      :
                    </p>
                    <button
                      class="w-full px-3 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                      @click="applyIncidentsList"
                    >
                      Set as incident list
                    </button>
                    <div v-if="incidentFieldFromClick" class="grid grid-cols-3 gap-2">
                      <button
                        class="px-2 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                        @click="applyIncidentField('title')"
                      >
                        → Title
                      </button>
                      <button
                        class="px-2 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                        @click="applyIncidentField('level')"
                      >
                        → Level
                      </button>
                      <button
                        class="px-2 py-1.5 text-xs font-medium bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                        @click="applyIncidentField('message')"
                      >
                        → Message
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
                  v-if="parsedPreview && (mapping.statusPath || mapping.incidentsPath)"
                  class="mx-5 mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center gap-3 shrink-0"
                >
                  <StatusBadge :level="parsedPreview.level" size="sm" />
                  <span class="text-xs text-gray-500 truncate">{{
                    parsedPreview.message
                  }}</span>
                </div>

                <!-- Tab content -->
                <div class="flex-1 overflow-y-auto px-5 py-4">
                  <!-- Response tab -->
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
                        RSS/Atom feed converted to navigable JSON.<br />
                        <strong>Status</strong>:
                        <code class="font-mono">entries.0.title</code> (single
                        item) or
                        <code class="font-mono">entries.*.title</code> (worst
                        level of all → generates incidents)<br />
                        <strong>Message</strong>:
                        <code class="font-mono">entries.*.summary</code> (all
                        texts shown, without creating incidents)
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
                        Configure the URL<br />and click Test
                      </p>
                    </div>
                  </template>

                  <!-- Preview tab -->
                  <template v-else>
                    <div
                      v-if="!testResult"
                      class="flex flex-col items-center justify-center h-full text-center py-12"
                    >
                      <p class="text-sm text-gray-400">
                        Run a test to see the preview
                      </p>
                    </div>
                    <div v-else class="space-y-4">
                      <!-- Previewed card -->
                      <div class="max-w-xs">
                        <ServiceCard
                          :name="form.name || 'Service name'"
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
                      <!-- Parsed detail -->
                      <div
                        v-if="parsedPreview"
                        class="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs space-y-2"
                      >
                        <p
                          class="font-medium text-gray-600 uppercase tracking-wider"
                        >
                          Parsed result
                        </p>
                        <div class="flex items-center gap-2">
                          <span class="text-gray-500">Level:</span>
                          <StatusBadge :level="parsedPreview.level" size="sm" />
                        </div>
                        <div>
                          <span class="text-gray-500">Message:</span>
                          <span class="ml-1 text-gray-700">{{
                            parsedPreview.message
                          }}</span>
                        </div>
                        <div v-if="parsedPreview.incidents.length">
                          <span class="text-gray-500">Incidents:</span>
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
                Cancel
              </button>
              <button
                class="px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                :disabled="!form.name.trim() || !form.url.trim()"
                @click="submit"
              >
                {{ editing ? "Save" : "Add" }}
              </button>
              <button
                class="px-4 py-2 text-sm font-medium bg-accent text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                :disabled="!form.name.trim() || !form.url.trim()"
                @click="submitAndClose"
              >
                {{ editing ? "Save & Close" : "Add & Close" }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
