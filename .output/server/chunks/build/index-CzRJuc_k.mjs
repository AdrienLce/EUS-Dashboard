import { _ as __nuxt_component_0 } from './nuxt-link-CDp6iZ44.mjs';
import { u as useServices, a as useStatusStore, L as LEVEL_COLORS, _ as _sfc_main$3, r as runAdapter } from './index-DzaJy2UO.mjs';
import { defineComponent, ref, computed, watch, withCtx, openBlock, createBlock, createVNode, createTextVNode, unref, mergeProps, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderComponent, ssrRenderClass, ssrInterpolate, ssrRenderList, ssrRenderTeleport, ssrRenderAttr } from 'vue/server-renderer';
import { u as useHead } from './v3-CJK_6TfU.mjs';
import '../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';
import './server.mjs';
import '../routes/renderer.mjs';
import 'vue-bundle-renderer/runtime';
import 'unhead/server';
import 'devalue';
import 'unhead/utils';
import 'unhead/plugins';
import 'vue-router';

const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "ServiceCard",
  __ssrInlineRender: true,
  props: {
    service: {},
    snapshot: {},
    loading: { type: Boolean },
    error: {}
  },
  emits: ["click", "refresh"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const level = computed(() => {
      var _a, _b;
      return (_b = (_a = props.snapshot) == null ? void 0 : _a.level) != null ? _b : "operational";
    });
    const colors = computed(() => LEVEL_COLORS[level.value]);
    const lastUpdated = computed(() => {
      var _a;
      if (!((_a = props.snapshot) == null ? void 0 : _a.timestamp)) return null;
      return new Date(props.snapshot.timestamp).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit"
      });
    });
    const incidentCount = computed(() => {
      var _a, _b, _c;
      return (_c = (_b = (_a = props.snapshot) == null ? void 0 : _a.incidents) == null ? void 0 : _b.length) != null ? _c : 0;
    });
    return (_ctx, _push, _parent, _attrs) => {
      var _a;
      const _component_StatusBadge = _sfc_main$3;
      _push(`<button${ssrRenderAttrs(mergeProps({
        class: ["group w-full text-left rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2", [unref(colors).border, `focus-visible:ring-${unref(level) === "majeur" ? "red" : unref(level) === "mineur" ? "orange" : unref(level) === "leger" ? "yellow" : unref(level) === "maintenance" ? "blue" : "green"}-500`]]
      }, _attrs))}><div class="flex items-start justify-between gap-3"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><h3 class="font-semibold text-gray-900 truncate">${ssrInterpolate(__props.service.name)}</h3>`);
      if (__props.loading) {
        _push(`<span class="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin"></span>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div>`);
      _push(ssrRenderComponent(_component_StatusBadge, {
        level: unref(level),
        size: "sm"
      }, null, _parent));
      _push(`</div><button class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" title="Rafra\xEEchir"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button></div><p class="mt-3 text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]">`);
      if (__props.error) {
        _push(`<span class="text-red-600">${ssrInterpolate(__props.error)}</span>`);
      } else if ((_a = __props.snapshot) == null ? void 0 : _a.message) {
        _push(`<span>${ssrInterpolate(__props.snapshot.message)}</span>`);
      } else {
        _push(`<span class="text-gray-400 italic">En attente de donn\xE9es\u2026</span>`);
      }
      _push(`</p><div class="mt-3 flex items-center justify-between text-xs text-gray-400">`);
      if (unref(incidentCount) > 0) {
        _push(`<span class="flex items-center gap-1"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> ${ssrInterpolate(unref(incidentCount))} incident${ssrInterpolate(unref(incidentCount) > 1 ? "s" : "")}</span>`);
      } else {
        _push(`<span></span>`);
      }
      if (unref(lastUpdated)) {
        _push(`<span>${ssrInterpolate(unref(lastUpdated))}</span>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div></button>`);
    };
  }
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/ServiceCard.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "HistoryModal",
  __ssrInlineRender: true,
  props: {
    service: {},
    snapshots: {},
    open: { type: Boolean }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    function formatDate(iso) {
      return new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_StatusBadge = _sfc_main$3;
      ssrRenderTeleport(_push, (_push2) => {
        if (__props.open) {
          _push2(`<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"><div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>`);
          if (__props.open) {
            _push2(`<div class="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-xl flex flex-col"><div class="flex items-center justify-between px-6 py-4 border-b border-gray-100"><div><h2 class="font-semibold text-gray-900 text-lg">${ssrInterpolate(__props.service.name)}</h2><p class="text-sm text-gray-500">Historique des statuts</p></div><button class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div><div class="flex-1 overflow-y-auto px-6 py-4 space-y-6">`);
            if (__props.snapshots.length === 0) {
              _push2(`<div class="text-center py-12 text-gray-400"><svg class="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><p>Aucun historique disponible</p></div>`);
            } else {
              _push2(`<!--[-->`);
              ssrRenderList(__props.snapshots, (snap) => {
                _push2(`<div class="space-y-3"><div class="flex items-center gap-3">`);
                _push2(ssrRenderComponent(_component_StatusBadge, {
                  level: snap.level
                }, null, _parent));
                _push2(`<span class="text-sm text-gray-400 ml-auto">${ssrInterpolate(formatDate(snap.timestamp))}</span></div>`);
                if (snap.message) {
                  _push2(`<p class="text-sm text-gray-600 pl-1">${ssrInterpolate(snap.message)}</p>`);
                } else {
                  _push2(`<!---->`);
                }
                if (snap.incidents.length > 0) {
                  _push2(`<div class="space-y-2 pl-1"><!--[-->`);
                  ssrRenderList(snap.incidents, (incident) => {
                    _push2(`<div class="rounded-lg border border-gray-100 bg-gray-50 p-3"><div class="flex items-start gap-2">`);
                    _push2(ssrRenderComponent(_component_StatusBadge, {
                      level: incident.level,
                      size: "sm",
                      class: "mt-0.5 shrink-0"
                    }, null, _parent));
                    _push2(`<div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-800">${ssrInterpolate(incident.title)}</p>`);
                    if (incident.message) {
                      _push2(`<p class="text-xs text-gray-500 mt-1 line-clamp-3">${ssrInterpolate(incident.message)}</p>`);
                    } else {
                      _push2(`<!---->`);
                    }
                    _push2(`<div class="flex items-center gap-3 mt-2 text-xs text-gray-400"><span>${ssrInterpolate(formatDate(incident.updatedAt))}</span>`);
                    if (incident.url) {
                      _push2(`<a${ssrRenderAttr("href", incident.url)} target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline"> Voir d\xE9tail \u2192 </a>`);
                    } else {
                      _push2(`<!---->`);
                    }
                    _push2(`</div></div></div></div>`);
                  });
                  _push2(`<!--]--></div>`);
                } else {
                  _push2(`<!---->`);
                }
                _push2(`<hr class="border-gray-100 last:hidden"></div>`);
              });
              _push2(`<!--]-->`);
            }
            _push2(`</div></div>`);
          } else {
            _push2(`<!---->`);
          }
          _push2(`</div>`);
        } else {
          _push2(`<!---->`);
        }
      }, "body", false, _parent);
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/HistoryModal.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const intervalError = "[nuxt] `setInterval` should not be used on the server. Consider wrapping it with an `onNuxtReady`, `onBeforeMount` or `onMounted` lifecycle hook, or ensure you only call it in the browser by checking `false`.";
const setInterval = (() => {
  console.error(intervalError);
});
const loading = ref({});
const errors = ref({});
const timers = /* @__PURE__ */ new Map();
async function fetchService(service) {
  loading.value[service.id] = true;
  errors.value[service.id] = null;
  try {
    const data = await $fetch("/api/proxy", {
      method: "POST",
      body: {
        url: service.url,
        method: service.method,
        headers: service.headers,
        body: service.body
      }
    });
    const result = runAdapter(service.adapter, data);
    const snapshot = {
      serviceId: service.id,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: result.level,
      message: result.message,
      incidents: result.incidents
    };
    const { pushSnapshot } = useStatusStore();
    pushSnapshot(snapshot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur de r\xE9cup\xE9ration";
    errors.value[service.id] = msg;
    const { pushSnapshot } = useStatusStore();
    pushSnapshot({
      serviceId: service.id,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: "majeur",
      message: `Erreur: ${msg}`,
      incidents: []
    });
  } finally {
    loading.value[service.id] = false;
  }
}
function startPolling(service) {
  if (timers.has(service.id)) stopPolling(service.id);
  fetchService(service);
  Math.min(service.pollInterval, 120) * 1e3;
  const timer = setInterval();
  timers.set(service.id, timer);
}
function stopPolling(serviceId) {
  const timer = timers.get(serviceId);
  if (timer) {
    clearInterval(timer);
    timers.delete(serviceId);
  }
}
function stopAll() {
  timers.forEach((_, id) => stopPolling(id));
}
function refreshService(service) {
  fetchService(service);
}
function usePolling() {
  return {
    loading,
    errors,
    startPolling,
    stopPolling,
    stopAll,
    refreshService,
    activePolls: timers
  };
}
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  setup(__props) {
    useHead({ title: "Dashboard \u2014 Status Concentrateur" });
    const { enabledServices } = useServices();
    const { currentStatus, getHistory } = useStatusStore();
    const { loading: loading2, errors: errors2, startPolling: startPolling2, stopPolling: stopPolling2, refreshService: refreshService2 } = usePolling();
    const selectedService = ref(null);
    const historyOpen = ref(false);
    const globalLevel = computed(() => {
      const order = ["operational", "maintenance", "leger", "mineur", "majeur"];
      let worst = 0;
      for (const svc of enabledServices.value) {
        const snap = currentStatus.value[svc.id];
        if (snap) {
          const idx = order.indexOf(snap.level);
          if (idx > worst) worst = idx;
        }
      }
      return order[worst];
    });
    const LEVEL_LABELS_GLOBAL = {
      operational: "Tous les services op\xE9rationnels",
      leger: "L\xE9g\xE8re perturbation d\xE9tect\xE9e",
      mineur: "Incident mineur en cours",
      majeur: "Incident majeur en cours",
      maintenance: "Maintenance en cours"
    };
    const GLOBAL_COLORS = {
      operational: "bg-green-500",
      leger: "bg-yellow-500",
      mineur: "bg-orange-500",
      majeur: "bg-red-500",
      maintenance: "bg-blue-500"
    };
    function openHistory(service) {
      selectedService.value = service;
      historyOpen.value = true;
    }
    watch(enabledServices, (newList, oldList) => {
      const newIds = new Set(newList.map((s) => s.id));
      const oldIds = new Set(oldList.map((s) => s.id));
      for (const svc of newList) {
        if (!oldIds.has(svc.id)) startPolling2(svc);
      }
      for (const svc of oldList) {
        if (!newIds.has(svc.id)) stopPolling2(svc.id);
      }
    }, { deep: true });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_NuxtLink = __nuxt_component_0;
      const _component_ServiceCard = _sfc_main$2;
      const _component_HistoryModal = _sfc_main$1;
      _push(`<div${ssrRenderAttrs(_attrs)}><nav class="bg-white border-b border-gray-100 sticky top-0 z-40"><div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center"><svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg></div><span class="font-semibold text-gray-900">Status Dashboard</span></div>`);
      _push(ssrRenderComponent(_component_NuxtLink, {
        to: "/services",
        class: "flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"${_scopeId}><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"${_scopeId}></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"${_scopeId}></path></svg> G\xE9rer les services `);
          } else {
            return [
              (openBlock(), createBlock("svg", {
                class: "w-4 h-4",
                fill: "none",
                stroke: "currentColor",
                viewBox: "0 0 24 24"
              }, [
                createVNode("path", {
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                  "stroke-width": "2",
                  d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                }),
                createVNode("path", {
                  "stroke-linecap": "round",
                  "stroke-linejoin": "round",
                  "stroke-width": "2",
                  d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                })
              ])),
              createTextVNode(" G\xE9rer les services ")
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`</div></nav><main class="max-w-6xl mx-auto px-4 sm:px-6 py-8"><div class="${ssrRenderClass([GLOBAL_COLORS[unref(globalLevel)], "rounded-2xl p-5 mb-8 flex items-center gap-4 text-white"])}"><div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">`);
      if (unref(globalLevel) === "operational") {
        _push(`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>`);
      } else {
        _push(`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path>`);
      }
      _push(`</svg></div><div><p class="font-semibold text-lg">${ssrInterpolate(LEVEL_LABELS_GLOBAL[unref(globalLevel)])}</p><p class="text-white/80 text-sm">${ssrInterpolate(unref(enabledServices).length)} service${ssrInterpolate(unref(enabledServices).length > 1 ? "s" : "")} surveill\xE9${ssrInterpolate(unref(enabledServices).length > 1 ? "s" : "")}</p></div></div>`);
      if (unref(enabledServices).length === 0) {
        _push(`<div class="text-center py-20"><div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></div><h3 class="font-semibold text-gray-900 mb-1">Aucun service configur\xE9</h3><p class="text-gray-500 text-sm mb-5">Ajoutez des services pour commencer la surveillance</p>`);
        _push(ssrRenderComponent(_component_NuxtLink, {
          to: "/services",
          class: "inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        }, {
          default: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(` G\xE9rer les services \u2192 `);
            } else {
              return [
                createTextVNode(" G\xE9rer les services \u2192 ")
              ];
            }
          }),
          _: 1
        }, _parent));
        _push(`</div>`);
      } else {
        _push(`<div class="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"><!--[-->`);
        ssrRenderList(unref(enabledServices), (svc) => {
          _push(ssrRenderComponent(_component_ServiceCard, {
            key: svc.id,
            service: svc,
            snapshot: unref(currentStatus)[svc.id],
            loading: unref(loading2)[svc.id],
            error: unref(errors2)[svc.id],
            onClick: ($event) => openHistory(svc),
            onRefresh: ($event) => unref(refreshService2)(svc)
          }, null, _parent));
        });
        _push(`<!--]--></div>`);
      }
      _push(`</main>`);
      if (unref(selectedService)) {
        _push(ssrRenderComponent(_component_HistoryModal, {
          open: unref(historyOpen),
          service: unref(selectedService),
          snapshots: unref(getHistory)(unref(selectedService).id),
          onClose: ($event) => historyOpen.value = false
        }, null, _parent));
      } else {
        _push(`<!---->`);
      }
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-CzRJuc_k.mjs.map
