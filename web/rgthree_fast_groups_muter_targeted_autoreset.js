// rgthree_fast_groups_muter_targeted_autoreset.js
//
// Targeted auto-reset controller node for rgthree "Fast Groups Muter" (frontend-only / virtual node).
// - Adds a NEW node to the menu:  beyond/Fast Groups Muter Auto-Reset (Targeted)
// - You configure target FastGroupsMuter node IDs (or click "Add selected").
// - After execution_success, it resets ONLY those target muter nodes (turns toggles off).
// - execution_error / execution_interrupted hooks are left in-place but commented, as requested.
//
// IMPORTANT:
// This file SELF-INITS on import, so it works both:
// - when loaded normally by ComfyUI at startup, and
// - when dynamically imported later (Comfy will not retro-call setup()).
//
// Put it somewhere served by your web folder, and ensure it's imported/executed at startup (or dynamically import it).

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXT_NAME = "beyond.fg_muter_targeted_autoreset";
const NODE_PATH = "beyond/Fast Groups Muter Auto-Reset (Targeted)";
const NODE_TITLE = "Fast Groups Muter Auto-Reset (Targeted)";

// ---- behavior switches ----
const RESET_ON_SUCCESS = true;

// Keep these connected but commented for later use:
// const RESET_ON_ERROR = true;
// const RESET_ON_INTERRUPTED = true;

// ---- internal state ----
const instances = new Set();
let listenersInstalled = false;
let nodeRegistered = false;
let didInit = false;

function log(...args) {
  console.log("[FG Targeted AutoReset]", ...args);
}

function warn(...args) {
  console.warn("[FG Targeted AutoReset]", ...args);
}

function waitFor(getter, { tries = 240, intervalMs = 50 } = {}) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tick = () => {
      try {
        const v = getter();
        if (v) return resolve(v);
      } catch (e) {
        // ignore and keep trying
      }
      i++;
      if (i >= tries) return reject(new Error("Timed out waiting for dependency"));
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
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

function formatIds(ids) {
  return [...new Set(ids)].sort((a, b) => a - b).join(", ");
}

function isLikelyFastGroupsMuter(node) {
  // We avoid hardcoding rgthree internal class names so this remains robust.
  // Heuristics:
  // 1) title/type includes "fast groups"
  // 2) it has at least one widget with doModeChange() (rgthree FastGroupsToggleRowWidget-like)
  if (!node) return false;
  const t = String(node.type ?? node.title ?? "").toLowerCase();
  if (!t.includes("fast groups")) return false;

  const ws = node.widgets;
  if (!Array.isArray(ws) || ws.length === 0) return false;

  return ws.some((w) => typeof w?.doModeChange === "function");
}

function getSelectedNodes() {
  const graph = getCurrentGraph();

  // Selection storage differs across builds; try the common ones.
  const sel =
    graph?.list_of_graphcanvas?.[0]?.selected_nodes ||
    app?.canvas?.selected_nodes ||
    graph?.selected_nodes;

  if (sel && typeof sel === "object") {
    return Object.values(sel);
  }

  // Fallback heuristic
  return (graph?._nodes || []).filter((n) => n?.isSelected);
}

function resetMuterNode(node) {
  if (!node) return false;

  let changed = false;
  const ws = node.widgets || [];

  for (const w of ws) {
    if (typeof w?.doModeChange === "function") {
      // rgthree toggle widgets: doModeChange(force, skipOtherNodeCheck)
      // Force OFF, skip "only-one"/"always-one" enforcement.
      try {
        w.doModeChange(false, true);
        changed = true;
      } catch (e) {
        // If rgthree changes signature, we fail gracefully.
        warn("Failed calling doModeChange on widget", e);
      }
    }
  }

  if (changed) {
    try {
      node.setDirtyCanvas?.(true, true);
      node.graph?.setDirtyCanvas?.(true, true);
      app.graph?.setDirtyCanvas?.(true, true);
    } catch {
      // ignore UI refresh failures
    }
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
    if (!node) continue;
    resetMuterNode(node);
  }
}

function resetAllInstances() {
  for (const inst of instances) {
    resetTargetsForInstance(inst);
  }
}

function installListenersOnce() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  if (RESET_ON_SUCCESS) {
    api.addEventListener("execution_success", resetAllInstances);
  }

  // Keep these ready but commented for later use:
  // if (RESET_ON_ERROR) {
  //   api.addEventListener("execution_error", resetAllInstances);
  // }
  // if (RESET_ON_INTERRUPTED) {
  //   api.addEventListener("execution_interrupted", resetAllInstances);
  // }
}

function addSelectedTargetsToInstance(inst) {
  const selected = getSelectedNodes();
  const muters = selected.filter(isLikelyFastGroupsMuter);

  const current = parseIds(inst.__targetIdsWidget?.value);
  const next = current.concat(muters.map((n) => n.id));

  inst.__targetIdsWidget.value = formatIds(next);

  try {
    inst.setDirtyCanvas?.(true, true);
  } catch {
    // ignore
  }
}

function clearTargets(inst) {
  inst.__targetIdsWidget.value = "";
  try {
    inst.setDirtyCanvas?.(true, true);
  } catch {
    // ignore
  }
}

function resetNow(inst) {
  resetTargetsForInstance(inst);
}

async function registerNodeType() {
  if (nodeRegistered) return;

  const LiteGraph = await waitFor(() => getLiteGraph(), { tries: 240, intervalMs: 50 });

  // Ensure registerNodeType exists
  await waitFor(() => typeof LiteGraph?.registerNodeType === "function", { tries: 240, intervalMs: 50 });

  // If already registered, do nothing.
  if (LiteGraph.registered_node_types?.[NODE_PATH]) {
    nodeRegistered = true;
    return;
  }

  class TargetedAutoResetNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = NODE_TITLE;
      this.size = [420, 170];

      // A text widget storing comma-separated target node IDs
      this.__targetIdsWidget = this.addWidget(
        "text",
        "target_ids (comma-separated node ids)",
        "",
        (v) => {
          // normalize on edit (optional)
          const ids = parseIds(v);
          this.__targetIdsWidget.value = ids.length ? formatIds(ids) : "";
        }
      );

      this.addWidget("button", "Add selected FastGroupsMuter", "", () => addSelectedTargetsToInstance(this));
      this.addWidget("button", "Clear targets", "", () => clearTargets(this));
      this.addWidget("button", "Reset now", "", () => resetNow(this));

      // No inputs/outputs required; controller node only.
    }

    onAdded() {
      instances.add(this);
      installListenersOnce();
    }

    onRemoved() {
      instances.delete(this);
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
    // Never throw (prevents breaking other extensions)
    warn("Init failed:", e);
  }
}

// Normal Comfy path: Comfy calls setup() during boot for discovered extensions
app.registerExtension({
  name: EXT_NAME,
  setup() {
    // If loaded at boot, setup will run
    initNow();
  },
});

// Late-load path: if you dynamically import this file, Comfy won't retro-call setup().
initNow();
