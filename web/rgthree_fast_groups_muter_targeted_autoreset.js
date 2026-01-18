// beyond_fg_muter_autoreset_by_group.js
//
// Frontend-only (VIRTUAL) controller node.
// After execution_success, it turns OFF only the Fast Groups Muter toggles whose group.title matches your list.
//
// Persistence note (IMPORTANT):
// - We keep `serialize_widgets = false` to avoid prompt/pipeline issues for virtual nodes.
// - Therefore, we persist config in `this.properties` (which *is* saved in the workflow JSON).
// - On load, we restore widget values from `this.properties` via onConfigure().
//
// Why this works:
// - rgthree creates one widget per group, with widget.group.title and label `Enable ${group.title}`
// - The widget has doModeChange(force, skipOtherNodeCheck) that actually changes the modes of the group nodes
// - We call doModeChange(false, true) only for matched group titles => only those switches reset.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXT_NAME = "Beyond_nodes.fg_muter_autoreset_by_group";
const NODE_PATH = "Group Muter Auto Reset - Beyond nodes";
const NODE_TITLE = "Group Muter Auto-Reset (By Group)";

// Only success by default (same rationale as before)
const RESET_ON_SUCCESS = true;
// Leave these ready for later:
// const RESET_ON_ERROR = false;
// const RESET_ON_INTERRUPTED = false;

const instances = new Set();
let listenersInstalled = false;
let didInit = false;

function log(...a) { console.log("[FG AutoReset By Group]", ...a); }
function warn(...a) { console.warn("[FG AutoReset By Group]", ...a); }

function waitFor(getter, { tries = 240, intervalMs = 50 } = {}) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tick = () => {
      try {
        const v = getter();
        if (v) return resolve(v);
      } catch {}
      if (++i >= tries) return reject(new Error("Timed out waiting for dependency"));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function getLiteGraph() {
  return globalThis.LiteGraph || window.LiteGraph;
}

function getCurrentGraph() {
  return app?.canvas?.getCurrentGraph?.() || app?.graph;
}

function parseIds(raw) {
  return String(raw || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number(s))
    .filter(n => Number.isFinite(n));
}

function formatIds(ids) {
  return [...new Set(ids)].sort((a, b) => a - b).join(", ");
}

function parseGroupList(raw) {
  // accepts commas and/or newlines
  return String(raw || "")
    .split(/[\n,]/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function matchesTitle(title, patterns, mode) {
  const t = String(title || "");
  if (!t || !patterns.length) return false;

  if (mode === "exact") {
    const tl = t.toLowerCase();
    return patterns.some(p => tl === String(p).toLowerCase());
  }

  if (mode === "contains") {
    const tl = t.toLowerCase();
    return patterns.some(p => tl.includes(String(p).toLowerCase()));
  }

  if (mode === "startswith") {
    const tl = t.toLowerCase();
    return patterns.some(p => tl.startsWith(String(p).toLowerCase()));
  }

  // regex
  for (const p of patterns) {
    try {
      const re = new RegExp(p, "i");
      if (re.test(t)) return true;
    } catch {
      // ignore bad regex entries
    }
  }
  return false;
}

function isFastGroupsMuterNode(node) {
  if (!node) return false;
  const ws = node.widgets;
  if (!Array.isArray(ws) || !ws.length) return false;

  // rgthree toggle-row widget has name "RGTHREE_TOGGLE_AND_NAV"
  return ws.some(w => w?.name === "RGTHREE_TOGGLE_AND_NAV" && w?.group && typeof w.group.title === "string");
}

function getSelectedNodes() {
  const graph = getCurrentGraph();
  const sel =
    graph?.list_of_graphcanvas?.[0]?.selected_nodes ||
    app?.canvas?.selected_nodes ||
    graph?.selected_nodes;

  if (sel && typeof sel === "object") return Object.values(sel);
  return (graph?._nodes || []).filter(n => n?.isSelected);
}

// ---- Persistence helpers ----

const PROP_KEYS = Object.freeze({
  targetIds: "target_muter_node_ids",
  groupTitles: "group_titles",
  matchMode: "match_mode",
  onlyIfOn: "only_reset_if_on",
});

function ensureDefaultProperties(inst) {
  inst.properties = inst.properties || {};
  if (typeof inst.properties[PROP_KEYS.targetIds] !== "string") inst.properties[PROP_KEYS.targetIds] = "";
  if (typeof inst.properties[PROP_KEYS.groupTitles] !== "string") inst.properties[PROP_KEYS.groupTitles] = "";
  if (typeof inst.properties[PROP_KEYS.matchMode] !== "string") inst.properties[PROP_KEYS.matchMode] = "exact";
  if (typeof inst.properties[PROP_KEYS.onlyIfOn] !== "boolean") inst.properties[PROP_KEYS.onlyIfOn] = true;
}

function persistFromWidgets(inst) {
  // store widget state into properties so it survives workflow save/load
  try {
    ensureDefaultProperties(inst);
    inst.properties[PROP_KEYS.targetIds] = String(inst.__targetIdsWidget?.value ?? "");
    inst.properties[PROP_KEYS.groupTitles] = String(inst.__groupNamesWidget?.value ?? "");
    inst.properties[PROP_KEYS.matchMode] = String(inst.__matchModeWidget?.value ?? "exact");
    inst.properties[PROP_KEYS.onlyIfOn] = inst.__onlyIfOnWidget?.value !== false;
  } catch (e) {
    warn("persistFromWidgets failed", e);
  }
}

function restoreToWidgets(inst) {
  // restore widget UI from properties (called on load/configure)
  try {
    ensureDefaultProperties(inst);
    if (inst.__targetIdsWidget) inst.__targetIdsWidget.value = String(inst.properties[PROP_KEYS.targetIds] ?? "");
    if (inst.__groupNamesWidget) inst.__groupNamesWidget.value = String(inst.properties[PROP_KEYS.groupTitles] ?? "");
    if (inst.__matchModeWidget) inst.__matchModeWidget.value = String(inst.properties[PROP_KEYS.matchMode] ?? "exact");
    if (inst.__onlyIfOnWidget) inst.__onlyIfOnWidget.value = inst.properties[PROP_KEYS.onlyIfOn] !== false;

    inst.setDirtyCanvas?.(true, true);
  } catch (e) {
    warn("restoreToWidgets failed", e);
  }
}

// ---- existing behavior ----

function addSelectedTargetsToInstance(inst) {
  const selected = getSelectedNodes();
  const muters = selected.filter(isFastGroupsMuterNode);

  const current = parseIds(inst.__targetIdsWidget?.value);
  const next = current.concat(muters.map(n => n.id));

  inst.__targetIdsWidget.value = formatIds(next);
  persistFromWidgets(inst);
  try { inst.setDirtyCanvas?.(true, true); } catch {}
}

function clearTargets(inst) {
  inst.__targetIdsWidget.value = "";
  persistFromWidgets(inst);
  try { inst.setDirtyCanvas?.(true, true); } catch {}
}

/**
 * This is the key: ONLY reset widgets whose group.title matches your patterns.
 * And we reset them "properly" by calling doModeChange(false, true) so the group nodes modes flip back.
 */
function resetMuterNodeByGroup(node, patterns, matchMode, onlyIfOn = true) {
  if (!node || !Array.isArray(node.widgets)) return false;

  let changed = false;

  for (const w of node.widgets) {
    if (w?.name !== "RGTHREE_TOGGLE_AND_NAV") continue;

    const groupTitle = w?.group?.title;
    if (!matchesTitle(groupTitle, patterns, matchMode)) continue;

    const isOn = (typeof w.toggled === "boolean") ? w.toggled : (w?.value?.toggled === true);
    if (onlyIfOn && !isOn) continue;

    try {
      // doModeChange(force=false, skipOtherNodeCheck=true)
      // skipOtherNodeCheck avoids the "max one / always one" logic affecting other widgets.
      if (typeof w.doModeChange === "function") {
        w.doModeChange(false, true);
      } else {
        // fallback: keep UI consistent if rgthree changes internals
        if (w.value && typeof w.value === "object") w.value.toggled = false;
        if ("toggled" in w) w.toggled = false;
      }
      changed = true;
    } catch (e) {
      warn("Failed resetting widget for group:", groupTitle, e);
    }
  }

  if (changed) {
    try {
      node.setDirtyCanvas?.(true, true);
      node.graph?.setDirtyCanvas?.(true, true);
      app.graph?.setDirtyCanvas?.(true, true);
    } catch {}
  }

  return changed;
}

function resetTargetsForInstance(inst) {
  const graph = inst?.graph || getCurrentGraph();
  if (!graph) return;

  const ids = parseIds(inst.__targetIdsWidget?.value);
  if (!ids.length) return;

  const patterns = parseGroupList(inst.__groupNamesWidget?.value);
  if (!patterns.length) return;

  const matchMode = inst.__matchModeWidget?.value || "exact";
  const onlyIfOn = inst.__onlyIfOnWidget?.value !== false;

  for (const id of ids) {
    const node = graph.getNodeById?.(id);
    if (node) resetMuterNodeByGroup(node, patterns, matchMode, onlyIfOn);
  }
}

function resetAllInstances() {
  for (const inst of instances) resetTargetsForInstance(inst);
}

function installListenersOnce() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  if (RESET_ON_SUCCESS) {
    api.addEventListener("execution_success", resetAllInstances);
  }

  // leave wired but off:
  // api.addEventListener("execution_error", resetAllInstances);
  // api.addEventListener("execution_interrupted", resetAllInstances);
}

async function registerNodeType() {
  const LiteGraph = await waitFor(() => getLiteGraph(), { tries: 240, intervalMs: 50 });
  await waitFor(() => typeof LiteGraph?.registerNodeType === "function", { tries: 240, intervalMs: 50 });

  if (LiteGraph.registered_node_types?.[NODE_PATH]) return;

  class FGMuteAutoResetByGroup extends LiteGraph.LGraphNode {
    constructor() {
      super();

      // VIRTUAL: not serialized to backend prompt
      this.isVirtualNode = true;
      this.serialize_widgets = false;
      try { this.mode = LiteGraph.NEVER; } catch {}

      // --- PERSISTENT CONFIG STORAGE ---
      ensureDefaultProperties(this);

      this.title = NODE_TITLE;
      this.size = [560, 240];

      this.__targetIdsWidget = this.addWidget(
        "text",
        "target_muter_node_ids (comma-separated)",
        this.properties[PROP_KEYS.targetIds],
        (v) => {
          const ids = parseIds(v);
          const normalized = ids.length ? formatIds(ids) : "";
          this.__targetIdsWidget.value = normalized;
          this.properties[PROP_KEYS.targetIds] = normalized;
        }
      );

      this.__groupNamesWidget = this.addWidget(
        "text",
        "group titles (comma or newline separated)",
        this.properties[PROP_KEYS.groupTitles],
        (v) => {
          const val = String(v ?? "");
          this.__groupNamesWidget.value = val;
          this.properties[PROP_KEYS.groupTitles] = val;
        }
      );

      this.__matchModeWidget = this.addWidget(
        "combo",
        "match mode",
        this.properties[PROP_KEYS.matchMode],
        (v) => {
          const val = String(v ?? "exact");
          this.__matchModeWidget.value = val;
          this.properties[PROP_KEYS.matchMode] = val;
        },
        { values: ["exact", "contains", "startswith", "regex"] }
      );

      this.__onlyIfOnWidget = this.addWidget(
        "toggle",
        "only reset if ON",
        this.properties[PROP_KEYS.onlyIfOn],
        (v) => {
          const val = v !== false;
          this.__onlyIfOnWidget.value = val;
          this.properties[PROP_KEYS.onlyIfOn] = val;
        }
      );

      this.addWidget("button", "Add selected Fast Groups Muter", "", () => addSelectedTargetsToInstance(this));
      this.addWidget("button", "Clear targets", "", () => clearTargets(this));
      this.addWidget("button", "Reset now (by group)", "", () => resetTargetsForInstance(this));

      // Make sure widgets reflect persisted values even on weird load orders
      restoreToWidgets(this);
    }

    isVirtual() { return true; }

    onAdded() {
      instances.add(this);
      installListenersOnce();
      // In case onAdded happens after properties were configured
      restoreToWidgets(this);
    }

    onRemoved() {
      instances.delete(this);
    }

    onSerialize(o) {
      // Keep virtual flags (but properties will still be saved by ComfyUI)
      o.isVirtualNode = true;
      o.serialize_widgets = false;
    }

    onConfigure(info) {
      // Called when loading from workflow JSON
      ensureDefaultProperties(this);
      // If Comfy loaded properties into this.properties, reflect them in widgets
      restoreToWidgets(this);
      instances.add(this);
      installListenersOnce();
    }
  }

  LiteGraph.registerNodeType(NODE_PATH, FGMuteAutoResetByGroup);
  log("Registered node:", NODE_PATH);
}

async function initNow() {
  if (didInit) return;
  didInit = true;

  try {
    installListenersOnce();
    await registerNodeType();
  } catch (e) {
    warn("Init failed:", e);
  }
}

app.registerExtension({
  name: EXT_NAME,
  setup() {
    initNow();
  },
});

// late-load safe
initNow();
