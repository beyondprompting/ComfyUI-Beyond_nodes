// beyond_fg_muter_autoreset_by_group.js
//
// Frontend-only (VIRTUAL) controller node.
// After execution_success, it turns OFF only the Fast Groups Muter toggles whose group.title matches your list.
//
// Why this works:
// - rgthree creates one widget per group, with widget.group.title and label `Enable ${group.title}` :contentReference[oaicite:2]{index=2}
// - The widget has doModeChange(force, skipOtherNodeCheck) that actually changes the modes of the group nodes :contentReference[oaicite:3]{index=3}
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

  // rgthree toggle-row widget has name "RGTHREE_TOGGLE_AND_NAV" :contentReference[oaicite:4]{index=4}
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

function addSelectedTargetsToInstance(inst) {
  const selected = getSelectedNodes();
  const muters = selected.filter(isFastGroupsMuterNode);

  const current = parseIds(inst.__targetIdsWidget?.value);
  const next = current.concat(muters.map(n => n.id));

  inst.__targetIdsWidget.value = formatIds(next);
  try { inst.setDirtyCanvas?.(true, true); } catch {}
}

function clearTargets(inst) {
  inst.__targetIdsWidget.value = "";
  try { inst.setDirtyCanvas?.(true, true); } catch {}
}

/**
 * This is the key: ONLY reset widgets whose group.title matches your patterns.
 * And we reset them "properly" by calling doModeChange(false, true) so the group nodes modes flip back. :contentReference[oaicite:5]{index=5}
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
      // skipOtherNodeCheck avoids the "max one / always one" logic affecting other widgets. :contentReference[oaicite:6]{index=6}
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

      this.title = NODE_TITLE;
      this.size = [560, 240];

      this.__targetIdsWidget = this.addWidget(
        "text",
        "target_muter_node_ids (comma-separated)",
        "",
        (v) => {
          const ids = parseIds(v);
          this.__targetIdsWidget.value = ids.length ? formatIds(ids) : "";
        }
      );

      this.__groupNamesWidget = this.addWidget(
        "text",
        "group titles (comma or newline separated)",
        "",
        () => {}
      );

      this.__matchModeWidget = this.addWidget(
        "combo",
        "match mode",
        "exact",
        () => {},
        { values: ["exact", "contains", "startswith", "regex"] }
      );

      this.__onlyIfOnWidget = this.addWidget(
        "toggle",
        "only reset if ON",
        true,
        () => {}
      );

      this.addWidget("button", "Add selected Fast Groups Muter", "", () => addSelectedTargetsToInstance(this));
      this.addWidget("button", "Clear targets", "", () => clearTargets(this));
      this.addWidget("button", "Reset now (by group)", "", () => resetTargetsForInstance(this));
    }

    isVirtual() { return true; }

    onAdded() {
      instances.add(this);
      installListenersOnce();
    }

    onRemoved() {
      instances.delete(this);
    }

    onSerialize(o) {
      o.isVirtualNode = true;
      o.serialize_widgets = false;
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
