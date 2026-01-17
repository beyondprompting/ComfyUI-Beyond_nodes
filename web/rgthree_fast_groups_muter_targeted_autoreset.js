// rgthree_fast_groups_muter_targeted_autoreset.js
//
// Frontend-only (VIRTUAL) controller node.
// Resets ONLY the configured rgthree Fast Groups Muter nodes after a successful run.
//
// IMPORTANT:
// - This node MUST be virtual, otherwise ComfyUI will try to serialize it into the prompt and throw:
//   "node is missing the class_type property"
// - Therefore we set: isVirtualNode = true (and mode = LiteGraph.NEVER).
//
// Usage:
// 1) Add node: beyond/Fast Groups Muter Auto-Reset (Targeted)
// 2) Select one or more Fast Groups Muter nodes, click "Add selected"
// 3) Queue a run; on execution_success it will reset those targets (toggle off)

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXT_NAME = "Beyond_nodes.fg_muter_targeted_autoreset";
const NODE_PATH = "Fast Groups Muter Auto-Reset (Targeted) -Beyond_nodes";
const NODE_TITLE = "Fast Groups Muter Auto-Reset (Targeted)";

// --- behavior ---
const RESET_ON_SUCCESS = true;

// leave connected but commented for later:
// const RESET_ON_ERROR = true;
// const RESET_ON_INTERRUPTED = true;

// --- internal ---
const instances = new Set();
let listenersInstalled = false;
let nodeRegistered = false;
let didInit = false;

function log(...a) { console.log("[FG Targeted AutoReset]", ...a); }
function warn(...a) { console.warn("[FG Targeted AutoReset]", ...a); }

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

function isLikelyFastGroupsMuter(node) {
  // Heuristic: title/type contains "fast groups" AND has widget(s) with doModeChange()
  if (!node) return false;
  const t = String(node.type ?? node.title ?? "").toLowerCase();
  if (!t.includes("fast groups")) return false;
  const ws = node.widgets;
  return Array.isArray(ws) && ws.some(w => typeof w?.doModeChange === "function");
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

function resetMuterNode(node) {
  if (!node) return false;

  let changed = false;
  for (const w of (node.widgets || [])) {
    if (typeof w?.doModeChange === "function") {
      try {
        // force off; skip "only one"/"always one" constraints
        w.doModeChange(false, true);
        changed = true;
      } catch (e) {
        warn("doModeChange failed", e);
      }
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

  for (const id of ids) {
    const node = graph.getNodeById?.(id);
    if (node) resetMuterNode(node);
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

  // leave for later:
  // api.addEventListener("execution_error", resetAllInstances);
  // api.addEventListener("execution_interrupted", resetAllInstances);
}

function addSelectedTargetsToInstance(inst) {
  const selected = getSelectedNodes();
  const muters = selected.filter(isLikelyFastGroupsMuter);

  const current = parseIds(inst.__targetIdsWidget?.value);
  const next = current.concat(muters.map(n => n.id));

  inst.__targetIdsWidget.value = formatIds(next);
  try { inst.setDirtyCanvas?.(true, true); } catch {}
}

function clearTargets(inst) {
  inst.__targetIdsWidget.value = "";
  try { inst.setDirtyCanvas?.(true, true); } catch {}
}

function resetNow(inst) {
  resetTargetsForInstance(inst);
}

async function registerNodeType() {
  if (nodeRegistered) return;

  const LiteGraph = await waitFor(() => getLiteGraph(), { tries: 240, intervalMs: 50 });
  await waitFor(() => typeof LiteGraph?.registerNodeType === "function", { tries: 240, intervalMs: 50 });

  if (LiteGraph.registered_node_types?.[NODE_PATH]) {
    nodeRegistered = true;
    return;
  }

  class TargetedAutoResetNode extends LiteGraph.LGraphNode {
    constructor() {
      super();

      // ---- CRITICAL: mark as virtual so ComfyUI does NOT include it in prompt ----
      this.isVirtualNode = true;
      this.serialize_widgets = false;

      // Optional: keep LiteGraph from treating it like an executable node
      try {
        this.mode = LiteGraph.NEVER;
      } catch {}

      this.title = NODE_TITLE;
      this.size = [440, 175];

      this.__targetIdsWidget = this.addWidget(
        "text",
        "target_ids (comma-separated node ids)",
        "",
        (v) => {
          const ids = parseIds(v);
          this.__targetIdsWidget.value = ids.length ? formatIds(ids) : "";
        }
      );

      this.addWidget("button", "Add selected FastGroupsMuter", "", () => addSelectedTargetsToInstance(this));
      this.addWidget("button", "Clear targets", "", () => clearTargets(this));
      this.addWidget("button", "Reset now", "", () => resetNow(this));
    }

    // Extra safety: some builds consult this for serialization
    isVirtual() { return true; }

    onAdded() {
      instances.add(this);
      installListenersOnce();
    }

    onRemoved() {
      instances.delete(this);
    }

    // Extra safety: ensure serialization doesn’t add anything backend-relevant
    onSerialize(o) {
      o.isVirtualNode = true;
      o.serialize_widgets = false;
    }
  }

  LiteGraph.registerNodeType(NODE_PATH, TargetedAutoResetNode);
  nodeRegistered = true;
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

// Late-load (dynamic import) path:
initNow();
