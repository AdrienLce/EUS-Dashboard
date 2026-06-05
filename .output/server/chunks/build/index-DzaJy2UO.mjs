import { computed, defineComponent, mergeProps, unref, ref, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderClass, ssrInterpolate } from 'vue/server-renderer';

const LEVEL_LABELS = {
  operational: "Op\xE9rationnel",
  leger: "L\xE9g\xE8re perturbation",
  mineur: "Incident mineur",
  majeur: "Incident majeur",
  maintenance: "Maintenance"
};
const LEVEL_COLORS = {
  operational: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    dot: "bg-green-500"
  },
  leger: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
    dot: "bg-yellow-500"
  },
  mineur: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    dot: "bg-orange-500"
  },
  majeur: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500"
  },
  maintenance: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500"
  }
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "StatusBadge",
  __ssrInlineRender: true,
  props: {
    level: {},
    size: {}
  },
  setup(__props) {
    const props = __props;
    const size = computed(() => {
      var _a;
      return (_a = props.size) != null ? _a : "md";
    });
    const colors = computed(() => LEVEL_COLORS[props.level]);
    const label = computed(() => LEVEL_LABELS[props.level]);
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<span${ssrRenderAttrs(mergeProps({
        class: ["inline-flex items-center gap-1.5 rounded-full font-medium", [
          unref(colors).bg,
          unref(colors).text,
          unref(colors).border,
          "border",
          unref(size) === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
        ]]
      }, _attrs))}><span class="${ssrRenderClass([[
        unref(colors).dot,
        unref(size) === "sm" ? "w-1.5 h-1.5" : "w-2 h-2",
        __props.level === "operational" ? "" : "animate-pulse"
      ], "rounded-full shrink-0"])}"></span> ${ssrInterpolate(unref(label))}</span>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/StatusBadge.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const services = ref([]);
function load() {
  return;
}
function addService(config) {
  const service = {
    ...config,
    id: crypto.randomUUID(),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  services.value.push(service);
  return service;
}
function updateService(id, updates) {
  const idx = services.value.findIndex((s) => s.id === id);
  if (idx === -1) return;
  services.value[idx] = { ...services.value[idx], ...updates };
}
function removeService(id) {
  services.value = services.value.filter((s) => s.id !== id);
}
function toggleService(id) {
  const svc = services.value.find((s) => s.id === id);
  if (svc) updateService(id, { enabled: !svc.enabled });
}
function useServices() {
  return {
    services: computed(() => services.value),
    enabledServices: computed(() => services.value.filter((s) => s.enabled)),
    addService,
    updateService,
    removeService,
    toggleService,
    reload: load
  };
}
const MAX_HISTORY_PER_SERVICE = 50;
const currentStatus = ref({});
const history = ref({});
function pushSnapshot(snapshot) {
  currentStatus.value[snapshot.serviceId] = snapshot;
  if (!history.value[snapshot.serviceId]) {
    history.value[snapshot.serviceId] = [];
  }
  const arr = history.value[snapshot.serviceId];
  const last = arr[0];
  const changed = !last || last.level !== snapshot.level || last.message !== snapshot.message;
  if (changed) {
    arr.unshift(snapshot);
    if (arr.length > MAX_HISTORY_PER_SERVICE) {
      arr.splice(MAX_HISTORY_PER_SERVICE);
    }
  }
}
function getHistory(serviceId) {
  var _a;
  return (_a = history.value[serviceId]) != null ? _a : [];
}
function clearHistory(serviceId) {
  delete history.value[serviceId];
}
function useStatusStore() {
  return {
    currentStatus,
    getHistory,
    pushSnapshot,
    clearHistory
  };
}
function mapGithubIndicator(indicator) {
  switch (indicator) {
    case "none":
      return "operational";
    case "minor":
      return "leger";
    case "major":
      return "mineur";
    case "critical":
      return "majeur";
    case "maintenance":
      return "maintenance";
    default:
      return "operational";
  }
}
function mapGithubIncidentImpact(impact) {
  switch (impact) {
    case "none":
      return "operational";
    case "minor":
      return "leger";
    case "major":
      return "mineur";
    case "critical":
      return "majeur";
    case "maintenance":
      return "maintenance";
    default:
      return "leger";
  }
}
function parseGithub(data) {
  var _a, _b, _c, _d, _e;
  const summary = data;
  const incidents = ((_a = summary.incidents) != null ? _a : []).map((inc) => {
    var _a2, _b2;
    return {
      id: inc.id,
      title: inc.name,
      level: mapGithubIncidentImpact(inc.impact),
      startedAt: inc.created_at,
      updatedAt: inc.updated_at,
      message: (_b2 = (_a2 = inc.incident_updates) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.body,
      url: inc.shortlink
    };
  });
  return {
    level: mapGithubIndicator((_c = (_b = summary.status) == null ? void 0 : _b.indicator) != null ? _c : "none"),
    message: (_e = (_d = summary.status) == null ? void 0 : _d.description) != null ? _e : "Statut inconnu",
    incidents
  };
}
function mapIndicator(indicator) {
  switch (indicator) {
    case "none":
      return "operational";
    case "minor":
      return "leger";
    case "major":
      return "mineur";
    case "critical":
      return "majeur";
    case "maintenance":
      return "maintenance";
    default:
      return "operational";
  }
}
function mapImpact(impact) {
  switch (impact) {
    case "none":
      return "operational";
    case "minor":
      return "leger";
    case "major":
      return "mineur";
    case "critical":
      return "majeur";
    case "maintenance":
      return "maintenance";
    default:
      return "leger";
  }
}
function parseAtlassian(data) {
  var _a, _b, _c, _d, _e;
  const summary = data;
  const incidents = ((_a = summary.incidents) != null ? _a : []).map((inc) => {
    var _a2, _b2;
    return {
      id: inc.id,
      title: inc.name,
      level: mapImpact(inc.impact),
      startedAt: inc.created_at,
      updatedAt: inc.updated_at,
      message: (_b2 = (_a2 = inc.incident_updates) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.body,
      url: inc.shortlink
    };
  });
  return {
    level: mapIndicator((_c = (_b = summary.status) == null ? void 0 : _b.indicator) != null ? _c : "none"),
    message: (_e = (_d = summary.status) == null ? void 0 : _d.description) != null ? _e : "Statut inconnu",
    incidents
  };
}
function mapAwsStatus(status) {
  const s = status.toLowerCase();
  if (s.includes("operating normally") || s.includes("service is operating normally")) return "operational";
  if (s.includes("informational")) return "leger";
  if (s.includes("service degradation") || s.includes("degraded")) return "mineur";
  if (s.includes("service disruption") || s.includes("disruption")) return "majeur";
  if (s.includes("maintenance")) return "maintenance";
  return "leger";
}
function parseAws(data) {
  var _a;
  const feed = data;
  const current = (_a = feed.current_events) != null ? _a : [];
  if (current.length === 0) {
    return {
      level: "operational",
      message: "Tous les services op\xE9rationnels",
      incidents: []
    };
  }
  const incidents = current.map((entry, i) => ({
    id: `aws-${i}-${entry.date}`,
    title: `[${entry.service_name}] ${entry.summary}`,
    level: mapAwsStatus(entry.status),
    startedAt: entry.date,
    updatedAt: entry.date,
    message: entry.status,
    url: entry.url
  }));
  const worstLevel = incidents.reduce((worst, inc) => {
    const order = ["operational", "maintenance", "leger", "mineur", "majeur"];
    return order.indexOf(inc.level) > order.indexOf(worst) ? inc.level : worst;
  }, "operational");
  return {
    level: worstLevel,
    message: `${current.length} \xE9v\xE9nement(s) en cours`,
    incidents
  };
}
const ADAPTERS = {
  github: parseGithub,
  atlassian: parseAtlassian,
  notion: parseAtlassian,
  aws: parseAws
};
function runAdapter(adapterKey, data) {
  const fn = ADAPTERS[adapterKey];
  if (fn) return fn(data);
  if (typeof data === "object" && data !== null && "status" in data) {
    const d = data;
    if (typeof d.status === "object" && d.status !== null && "indicator" in d.status) {
      return parseAtlassian(data);
    }
  }
  return {
    level: "operational",
    message: "Format non reconnu",
    incidents: []
  };
}
const PRESET_SERVICES = [
  {
    name: "GitHub",
    url: "https://www.githubstatus.com/api/v2/summary.json",
    method: "GET",
    adapter: "github",
    headers: {}
  },
  {
    name: "Notion",
    url: "https://status.notion.so/api/v2/summary.json",
    method: "GET",
    adapter: "atlassian",
    headers: {}
  },
  {
    name: "AWS",
    url: "https://health.aws.amazon.com/health/status",
    method: "GET",
    adapter: "aws",
    headers: {}
  }
];

export { LEVEL_COLORS as L, PRESET_SERVICES as P, _sfc_main as _, useStatusStore as a, runAdapter as r, useServices as u };
//# sourceMappingURL=index-DzaJy2UO.mjs.map
