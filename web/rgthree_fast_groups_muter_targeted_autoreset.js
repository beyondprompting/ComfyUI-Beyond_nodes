import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

/**
 * Targeted auto-reset node for rgthree "Fast Groups Muter (rgthree)".
 * Frontend-only: listens to execution events and resets only the configured target node IDs.
 *
 * How to use:
 * 1) Add "Fast Groups Muter Auto-Reset (Targeted)" to your graph.
 * 2) Select one or more Fast Groups Muter nodes, click "Add selected".
 * 3) Queue a run. On success, only those targets get reset (toggled off).
 */

const EXT_NAME = "Beyond_nodes-targeted_fast_groups_muter_autoreset";
const NODE_TITLE = "Fast Groups Muter Auto-Reset (Targeted)";

const instances = new Set();
let listenersInstalled = false;

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
  if (!node) return false;

  // Most rgthree nodes use " (rgthree)" in the title/type, and this one contains "Fast Groups".
  const t = String(node.type ?? node.title ?? "").toLowerCase();
  if (!t.includes("fast groups")) return false;

  // The toggle widgets rgthree uses have doModeChange().
  const ws = node.widgets;
  if (!Array.isArray(ws) || ws.length === 0) return false;
  return ws.some(w => typeof w?.doModeChange === "function");
}

function resetTargetNode(node) {
  if (!node) return false;

  // Force any rgthree toggle-row widget to off.
  let changed = false;
  const ws = node.widgets || [];
  for (const w of ws) {
    if (typeof w?.doModeChange === "function") {
      // rgthree: doModeChange(force, skipOtherNodeCheck)
      w.doModeChange(false, true);
      changed = true;
    }
  }

  if (changed) {
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
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
    resetTargetNode(node);
  }
}

function resetAllInstances() {
  for (const inst of instances) resetTargetsForInstance(inst);
}

function installListenersOnce() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  api.addEventListener("execution_success", resetAllInstances);

  // --- keep these connected but commented for later ---
  // api.addEventListener("execution_error", resetAllInstances);
  // api.addEventListener("execution_interrupted", resetAllInstances);
}

function getSelectedNodes() {
  // LiteGraph selection shape varies; this is the safest common path:
  const graph = getCurrentGraph();
  const sel = graph?.list_of_graphcanvas?.[0]?.selected_nodes
           || app?.canvas?.selected_nodes
           || graph?.selected_nodes;

  if (sel && typeof sel === "object") return Object.values(sel);

  // Fallback: scan nodes and pick "isSelected" if present
  const nodes = graph?._nodes || [];
  return nodes.filter(n => n?.isSelected);
}

function addSelectedTargetsToInstance(inst) {
  const selected = getSelectedNodes();
  const muters = selected.filter(isLikelyFastGroupsMuter);

  const current = parseIds(inst.__targetIdsWidget?.value);
  const next = current.concat(muters.map(n => n.id));

  inst.__targetIdsWidget.value = formatIds(next);
  inst.setDirtyCanvas?.(true, true);
}

function clearTargets(inst) {
  inst.__targetIdsWidget.value = "";
  inst.setDirtyCanvas?.(true, true);
}

function resetNow(inst) {
  resetTargetsForInstance(inst);
}

function registerNode() {
  class TargetedAutoResetNode extends LiteGraph.LGraphNode {
    constructor() {
      super();
      this.title = NODE_TITLE;
      this.size = [360, 140];

      // Widget: target ids
      this.__targetIdsWidget = this.addWidget(
        "text",
        "target_ids (comma-separated node ids)",
        "",
        (v) => { this.__targetIdsWidget.value = v; }
      );

      // Controls
      this.addWidget("button", "Add selected", "", () => addSelectedTargetsToInstance(this));
      this.addWidget("button", "Clear", "", () => clearTargets(this));
      this.addWidget("button", "Reset now", "", () => resetNow(this));

      // Optional: no inputs/outputs needed; it’s a controller node
    }

    onAdded() {
      instances.add(this);
      installListenersOnce();
    }

    onRemoved() {
      instances.delete(this);
    }
  }

  LiteGraph.registerNodeType(`${EXT_NAME}/TargetedMuterAutoReset`, TargetedAutoResetNode);
}

app.registerExtension({
  name: EXT_NAME,
  setup() {
    registerNode();
    installListenersOnce();
  },
});
