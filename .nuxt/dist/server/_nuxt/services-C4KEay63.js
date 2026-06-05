import { _ as __nuxt_component_0 } from "./nuxt-link-CDp6iZ44.js";
import { P as PRESET_SERVICES, a as useServices, _ as _sfc_main$2, u as useStatusStore } from "./index-DzaJy2UO.js";
import { defineComponent, reactive, watch, unref, useSSRContext, ref, withCtx, openBlock, createBlock, createVNode } from "vue";
import { ssrRenderTeleport, ssrInterpolate, ssrRenderList, ssrRenderAttr, ssrIncludeBooleanAttr, ssrLooseContain, ssrLooseEqual, ssrRenderAttrs, ssrRenderComponent, ssrRenderClass } from "vue/server-renderer";
import { u as useHead } from "./v3-CJK_6TfU.js";
import "/Users/jordanetinault/Src/privee/dashboard-concentrateur-status/node_modules/ufo/dist/index.mjs";
import "../server.mjs";
import "/Users/jordanetinault/Src/privee/dashboard-concentrateur-status/node_modules/ofetch/dist/node.mjs";
import "#internal/nuxt/paths";
import "/Users/jordanetinault/Src/privee/dashboard-concentrateur-status/node_modules/hookable/dist/index.mjs";
import "/Users/jordanetinault/Src/privee/dashboard-concentrateur-status/node_modules/unctx/dist/index.mjs";
import "/Users/jordanetinault/Src/privee/dashboard-concentrateur-status/node_modules/h3/dist/index.mjs";
import "vue-router";
import "/Users/jordanetinault/Src/privee/dashboard-concentrateur-status/node_modules/defu/dist/defu.mjs";
import "/Users/jordanetinault/Src/privee/dashboard-concentrateur-status/node_modules/@unhead/vue/dist/index.mjs";
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ServiceForm",
  __ssrInlineRender: true,
  props: {
    open: { type: Boolean },
    editing: {}
  },
  emits: ["close", "save"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const ADAPTERS = [
      { value: "github", label: "GitHub Status" },
      { value: "atlassian", label: "Atlassian / Statuspage" },
      { value: "aws", label: "AWS Health" },
      { value: "notion", label: "Notion" },
      { value: "auto", label: "Auto-détection" }
    ];
    const defaultForm = () => ({
      name: "",
      url: "",
      method: "GET",
      adapter: "auto",
      headers: [],
      body: "",
      group: "",
      pollInterval: 60,
      enabled: true
    });
    const form = reactive(defaultForm());
    watch(
      () => props.open,
      (open) => {
        if (open) {
          if (props.editing) {
            form.name = props.editing.name;
            form.url = props.editing.url;
            form.method = props.editing.method;
            form.adapter = props.editing.adapter;
            form.headers = Object.entries(props.editing.headers).map(([key, value]) => ({ key, value }));
            form.body = props.editing.body ?? "";
            form.group = props.editing.group ?? "";
            form.pollInterval = props.editing.pollInterval;
            form.enabled = props.editing.enabled;
          } else {
            Object.assign(form, defaultForm());
          }
        }
      }
    );
    return (_ctx, _push, _parent, _attrs) => {
      ssrRenderTeleport(_push, (_push2) => {
        if (__props.open) {
          _push2(`<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"><div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>`);
          if (__props.open) {
            _push2(`<div class="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-xl flex flex-col"><div class="flex items-center justify-between px-6 py-4 border-b border-gray-100"><h2 class="font-semibold text-gray-900 text-lg">${ssrInterpolate(__props.editing ? "Modifier le service" : "Ajouter un service")}</h2><button class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div><div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">`);
            if (!__props.editing) {
              _push2(`<div><p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Préconfigurations</p><div class="flex flex-wrap gap-2"><!--[-->`);
              ssrRenderList(unref(PRESET_SERVICES), (preset) => {
                _push2(`<button class="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors">${ssrInterpolate(preset.name)}</button>`);
              });
              _push2(`<!--]--></div></div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`<div><label class="block text-sm font-medium text-gray-700 mb-1"> Nom <span class="text-red-500">*</span></label><input${ssrRenderAttr("value", unref(form).name)} type="text" placeholder="ex: GitHub" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"></div><div><label class="block text-sm font-medium text-gray-700 mb-1"> URL <span class="text-red-500">*</span></label><div class="flex gap-2"><select class="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"><option value="GET"${ssrIncludeBooleanAttr(Array.isArray(unref(form).method) ? ssrLooseContain(unref(form).method, "GET") : ssrLooseEqual(unref(form).method, "GET")) ? " selected" : ""}>GET</option><option value="POST"${ssrIncludeBooleanAttr(Array.isArray(unref(form).method) ? ssrLooseContain(unref(form).method, "POST") : ssrLooseEqual(unref(form).method, "POST")) ? " selected" : ""}>POST</option></select><input${ssrRenderAttr("value", unref(form).url)} type="url" placeholder="https://api.example.com/status" class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"></div></div><div><label class="block text-sm font-medium text-gray-700 mb-1">Adaptateur</label><select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"><!--[-->`);
            ssrRenderList(ADAPTERS, (a) => {
              _push2(`<option${ssrRenderAttr("value", a.value)}${ssrIncludeBooleanAttr(Array.isArray(unref(form).adapter) ? ssrLooseContain(unref(form).adapter, a.value) : ssrLooseEqual(unref(form).adapter, a.value)) ? " selected" : ""}>${ssrInterpolate(a.label)}</option>`);
            });
            _push2(`<!--]--></select></div><div><div class="flex items-center justify-between mb-2"><label class="text-sm font-medium text-gray-700">En-têtes HTTP</label><button class="text-xs text-blue-600 hover:text-blue-700 font-medium"> + Ajouter </button></div>`);
            if (unref(form).headers.length > 0) {
              _push2(`<div class="space-y-2"><!--[-->`);
              ssrRenderList(unref(form).headers, (header, i) => {
                _push2(`<div class="flex gap-2 items-center"><input${ssrRenderAttr("value", header.key)} type="text" placeholder="Clé" class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"><input${ssrRenderAttr("value", header.value)} type="text" placeholder="Valeur" class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"><button class="p-2 text-gray-400 hover:text-red-500 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div>`);
              });
              _push2(`<!--]--></div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`</div>`);
            if (unref(form).method === "POST") {
              _push2(`<div><label class="block text-sm font-medium text-gray-700 mb-1">Corps (JSON)</label><textarea rows="3" placeholder="{&quot;key&quot;: &quot;value&quot;}" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none">${ssrInterpolate(unref(form).body)}</textarea></div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`<div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1"> Intervalle (s) </label><input${ssrRenderAttr("value", unref(form).pollInterval)} type="number" min="10" max="120" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"><p class="text-xs text-gray-400 mt-1">10–120 secondes</p></div><div><label class="block text-sm font-medium text-gray-700 mb-1">Groupe</label><input${ssrRenderAttr("value", unref(form).group)} type="text" placeholder="ex: Infrastructure" class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div></div></div><div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3"><button class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"> Annuler </button><button class="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"${ssrIncludeBooleanAttr(!unref(form).name.trim() || !unref(form).url.trim()) ? " disabled" : ""}>${ssrInterpolate(__props.editing ? "Enregistrer" : "Ajouter")}</button></div></div>`);
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/ServiceForm.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "services",
  __ssrInlineRender: true,
  setup(__props) {
    useHead({ title: "Services — Status Concentrateur" });
    const { services, addService, updateService } = useServices();
    const { currentStatus } = useStatusStore();
    const formOpen = ref(false);
    const editingService = ref(null);
    const deleteConfirm = ref(null);
    function onSave(config) {
      if (editingService.value) {
        updateService(editingService.value.id, config);
      } else {
        addService(config);
      }
      formOpen.value = false;
    }
    const ADAPTER_LABELS = {
      github: "GitHub Status",
      atlassian: "Atlassian",
      notion: "Notion",
      aws: "AWS",
      auto: "Auto"
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_NuxtLink = __nuxt_component_0;
      const _component_StatusBadge = _sfc_main$2;
      const _component_ServiceForm = _sfc_main$1;
      _push(`<div${ssrRenderAttrs(_attrs)}><nav class="bg-white border-b border-gray-100 sticky top-0 z-40"><div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between"><div class="flex items-center gap-3">`);
      _push(ssrRenderComponent(_component_NuxtLink, {
        to: "/",
        class: "p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
      }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"${_scopeId}><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"${_scopeId}></path></svg>`);
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
                  d: "M15 19l-7-7 7-7"
                })
              ]))
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`<span class="font-semibold text-gray-900">Gestion des services</span></div><button class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Ajouter </button></div></nav><main class="max-w-6xl mx-auto px-4 sm:px-6 py-8">`);
      if (unref(services).length === 0) {
        _push(`<div class="text-center py-20"><div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4"><svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M12 5l7 7-7 7"></path></svg></div><h3 class="font-semibold text-gray-900 mb-1">Aucun service</h3><p class="text-gray-500 text-sm mb-5">Ajoutez votre premier service à surveiller</p><button class="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"> + Ajouter un service </button></div>`);
      } else {
        _push(`<div class="space-y-3"><!--[-->`);
        ssrRenderList(unref(services), (svc) => {
          _push(`<div class="${ssrRenderClass([{ "opacity-60": !svc.enabled }, "bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4"])}"><button class="${ssrRenderClass([svc.enabled ? "bg-green-500" : "bg-gray-200", "shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"])}"${ssrRenderAttr("title", svc.enabled ? "Désactiver" : "Activer")}><span class="${ssrRenderClass([svc.enabled ? "translate-x-4" : "translate-x-0.5", "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"])}"></span></button><div class="flex-1 min-w-0"><div class="flex items-center gap-2"><span class="font-medium text-gray-900 truncate">${ssrInterpolate(svc.name)}</span>`);
          if (unref(currentStatus)[svc.id]) {
            _push(ssrRenderComponent(_component_StatusBadge, {
              level: unref(currentStatus)[svc.id].level,
              size: "sm"
            }, null, _parent));
          } else {
            _push(`<!---->`);
          }
          if (svc.group) {
            _push(`<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">${ssrInterpolate(svc.group)}</span>`);
          } else {
            _push(`<!---->`);
          }
          _push(`</div><div class="flex items-center gap-3 mt-1 text-xs text-gray-400"><span class="truncate max-w-xs">${ssrInterpolate(svc.url)}</span><span class="shrink-0">${ssrInterpolate(ADAPTER_LABELS[svc.adapter] ?? svc.adapter)}</span><span class="shrink-0">${ssrInterpolate(svc.pollInterval)}s</span></div></div><div class="flex items-center gap-1 shrink-0"><button class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Modifier"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>`);
          if (unref(deleteConfirm) === svc.id) {
            _push(`<button class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"> Confirmer </button>`);
          } else {
            _push(`<button class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Supprimer"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>`);
          }
          _push(`</div></div>`);
        });
        _push(`<!--]--></div>`);
      }
      _push(`<div class="mt-8 p-4 rounded-xl bg-white border border-gray-100"><p class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Légende des niveaux</p><div class="flex flex-wrap gap-3">`);
      _push(ssrRenderComponent(_component_StatusBadge, {
        level: "operational",
        size: "sm"
      }, null, _parent));
      _push(ssrRenderComponent(_component_StatusBadge, {
        level: "leger",
        size: "sm"
      }, null, _parent));
      _push(ssrRenderComponent(_component_StatusBadge, {
        level: "mineur",
        size: "sm"
      }, null, _parent));
      _push(ssrRenderComponent(_component_StatusBadge, {
        level: "majeur",
        size: "sm"
      }, null, _parent));
      _push(ssrRenderComponent(_component_StatusBadge, {
        level: "maintenance",
        size: "sm"
      }, null, _parent));
      _push(`</div></div></main>`);
      _push(ssrRenderComponent(_component_ServiceForm, {
        open: unref(formOpen),
        editing: unref(editingService),
        onClose: ($event) => formOpen.value = false,
        onSave
      }, null, _parent));
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/services.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
export {
  _sfc_main as default
};
//# sourceMappingURL=services-C4KEay63.js.map
