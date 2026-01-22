// standalone_fast_groups_muter_autoreset.js
//
// Standalone (no rgthree dependency) Fast Groups Muter + Auto-Reset by group name.
// - Frontend-only (virtual node): does NOT enter backend prompt (no class_type errors).
// - Enumerates groups from graph(s) and creates one row per group: [toggle] [nav] Group Title
// - Mute/unmute affects nodes inside the group rectangle by setting node.mode:
//      muted:   LiteGraph.NEVER
//      unmuted: LiteGraph.ALWAYS
// - Auto-reset: after execution_success, turns OFF (unmutes) only the groups whose titles match your list.
//
// Install:
// - Serve this JS via your WEB_DIRECTORY and ensure it is executed at startup (imported from your entry JS).
//
// Node appears under:
//   beyond/Standalone Fast Groups Muter (AutoReset)

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXT_NAME = "Comfy.AutoresetGroupMuter-Beyond_nodes";
const NODE_PATH = "Standalone Fast Groups Muter (AutoReset)";
const NODE_TITLE = "🦾 Standalone Fast Groups Muter (AutoReset)";

// ---------- utils ----------
function log(...a) { console.log("[Standalone FGM]", ...a); }
function warn(...a) { console.warn("[Standalone FGM]", ...a); }

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

function LG() {
  return globalThis.LiteGraph || window.LiteGraph;
}

function currentGraph() {
  return app?.canvas?.getCurrentGraph?.() || app?.graph;
}

function normalizeLinesOrCsv(raw) {
  return String(raw || "")
    .split(/[\n,]/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function matchesTitle(title, patterns, mode) {
  const t = String(title || "");
  if (!t || !patterns?.length) return false;

  const tl = t.toLowerCase();
  if (mode === "exact") return patterns.some(p => tl === String(p).toLowerCase());
  if (mode === "contains") return patterns.some(p => tl.includes(String(p).toLowerCase()));
  if (mode === "startswith") return patterns.some(p => tl.startsWith(String(p).toLowerCase()));

  // regex
  for (const p of patterns) {
    try {
      const re = new RegExp(p, "i");
      if (re.test(t)) return true;
    } catch {
      // ignore invalid regex
    }
  }
  return false;
}

// ---------- group/node geometry ----------
function rectContainsPoint(rect, x, y) {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
}

function nodeIsInsideGroup(node, group) {
  // LiteGraph group has pos [x,y] and size [w,h]
  const gx = group.pos?.[0] ?? group.pos?.x ?? 0;
  const gy = group.pos?.[1] ?? group.pos?.y ?? 0;
  const gw = group.size?.[0] ?? group.size?.w ?? 0;
  const gh = group.size?.[1] ?? group.size?.h ?? 0;

  const rect = { x: gx, y: gy, w: gw, h: gh };

  // node pos is top-left
  const nx = node.pos?.[0] ?? 0;
  const ny = node.pos?.[1] ?? 0;

  // include nodes whose anchor point is inside the group rect
  return rectContainsPoint(rect, nx, ny);
}

function getNodesInGroup(graph, group) {
  const nodes = graph?._nodes || [];
  return nodes.filter(n => n && nodeIsInsideGroup(n, group));
}

// ---------- graph enumeration (supports subgraphs) ----------
function enumerateGraphs({ includeSubgraphs }) {
  const g0 = currentGraph();
  if (!g0) return [];

  if (!includeSubgraphs) return [g0];

  const out = [];
  const seen = new Set();
  const stack = [g0];

  while (stack.length) {
    const g = stack.pop();
    if (!g || seen.has(g)) continue;
    seen.add(g);
    out.push(g);

    // scan for subgraphs on nodes
    for (const n of (g._nodes || [])) {
      if (n?.subgraph && !seen.has(n.subgraph)) stack.push(n.subgraph);
    }
  }

  return out;
}

function enumerateGroups(graphs) {
  const groups = [];
  for (const g of graphs) {
    for (const grp of (g._groups || [])) {
      if (!grp) continue;
      const title = String(grp.title || "").trim();
      if (!title) continue;
      groups.push({ graph: g, group: grp, title });
    }
  }
  return groups;
}

// ---------- mode helpers ----------
function isNodeMuted(node) {
  const LiteGraph = LG();
  return node?.mode === LiteGraph?.NEVER;
}

function setNodeMuted(node, muted) {
  const LiteGraph = LG();
  if (!LiteGraph || !node) return;
  node.mode = muted ? LiteGraph.NEVER : LiteGraph.ALWAYS;
}

function isGroupMuted(graph, group) {
  // muted if ANY node in group is muted (matches common expectation)
  const nodes = getNodesInGroup(graph, group);
  return nodes.some(isNodeMuted);
}

function setGroupMuted(graph, group, muted) {
  const nodes = getNodesInGroup(graph, group);
  for (const n of nodes) {
    // Don’t touch the muter node itself if it’s inside the group
    if (n?.type === NODE_TITLE) continue;
    setNodeMuted(n, muted);
  }
}

// ---------- custom widget: toggle + nav ----------
class GroupRowWidget {
  constructor({ title, graph, group }) {
    this.name = "FGM_TOGGLE_NAV_ROW";
    this.type = "custom";
    this.title = title;
    this.graph = graph;
    this.group = group;

    this.value = { toggled: false }; // for persistence-ish patterns
    this.toggled = false;

    // layout constants
    this.h = 22;
    this.pad = 6;
  }

  _syncFromGraph() {
    // reflect current state
    const muted = isGroupMuted(this.graph, this.group);
    this.toggled = muted;
    this.value.toggled = muted;
  }

  _toggle(node, muted, { enforceOnlyOne = false, alwaysOne = false } = {}) {
    // enforce “only one” within THIS muter node (not globally)
    if (enforceOnlyOne && muted) {
      for (const w of (node.widgets || [])) {
        if (w === this) continue;
        if (w?.name !== "FGM_TOGGLE_NAV_ROW") continue;
        // turn others off
        setGroupMuted(w.graph, w.group, false);
        w.toggled = false;
        w.value.toggled = false;
      }
    }

    // apply
    setGroupMuted(this.graph, this.group, muted);
    this.toggled = muted;
    this.value.toggled = muted;

    if (alwaysOne) {
      // if user turned this OFF, ensure at least one stays ON by re-enabling itself
      const anyOn = (node.widgets || [])
        .filter(w => w?.name === "FGM_TOGGLE_NAV_ROW")
        .some(w => w.toggled === true);

      if (!anyOn) {
        setGroupMuted(this.graph, this.group, true);
        this.toggled = true;
        this.value.toggled = true;
      }
    }
  }

  _navToGroup() {
    // Center the canvas on the group rectangle
    const canvas = app?.canvas;
    if (!canvas || !this.group) return;

    const gx = this.group.pos?.[0] ?? 0;
    const gy = this.group.pos?.[1] ?? 0;
    const gw = this.group.size?.[0] ?? 300;
    const gh = this.group.size?.[1] ?? 200;

    const cx = gx + gw / 2;
    const cy = gy + gh / 2;

    // Move view so that (cx,cy) is centered. LiteGraph uses offset in graph space * scale.
    // These fields are fairly stable across builds.
    if (canvas.ds) {
      const ds = canvas.ds;
      const scale = ds.scale ?? 1;
      const w = canvas.canvas?.width ?? 800;
      const h = canvas.canvas?.height ?? 600;
      ds.offset[0] = w / 2 - cx * scale;
      ds.offset[1] = h / 2 - cy * scale;
    }

    canvas.setDirty(true, true);
  }

  draw(ctx, node, width, y, H) {
    this._syncFromGraph();

    const rowH = this.h;
    const x0 = 0;
    const y0 = y;

    // background
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.fillRect(x0, y0, width, rowH);

    // toggle box
    const box = { x: this.pad, y: y0 + 3, w: 16, h: 16 };
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    if (this.toggled) {
      ctx.fillRect(box.x + 3, box.y + 3, box.w - 6, box.h - 6);
    }

    // nav button (small)
    const nav = { x: box.x + box.w + 8, y: y0 + 3, w: 18, h: 16 };
    ctx.strokeRect(nav.x, nav.y, nav.w, nav.h);
    // simple arrow
    ctx.beginPath();
    ctx.moveTo(nav.x + 5, nav.y + 4);
    ctx.lineTo(nav.x + 13, nav.y + 8);
    ctx.lineTo(nav.x + 5, nav.y + 12);
    ctx.closePath();
    ctx.stroke();

    // title
    const tx = nav.x + nav.w + 8;
    const ty = y0 + 14;
    ctx.fillText(this.title, tx, ty);

    ctx.restore();

    // store hit rects for mouse
    this.__hit = { box, nav, y0, rowH };
  }

  mouse(event, pos, node) {
    // event is {type, x,y, ...}; pos is local within node
    if (!this.__hit) return false;
    const { box, nav, y0, rowH } = this.__hit;

    const x = pos[0];
    const y = pos[1];

    const insideRow = y >= y0 && y <= y0 + rowH;
    if (!insideRow) return false;

    const inRect = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (event.type === "mousedown") {
      // toggle
      if (inRect(box)) {
        const enforceOnlyOne = node.properties?.enforceOnlyOne === true;
        const alwaysOne = node.properties?.alwaysOne === true;
        this._toggle(node, !this.toggled, { enforceOnlyOne, alwaysOne });

        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        return true;
      }

      // nav
      if (inRect(nav)) {
        this._navToGroup();
        return true;
      }
    }

    return false;
  }
}

// ---------- node ----------
let listenersInstalled = false;

function installListenersOnce(handler) {
  if (listenersInstalled) return;
  listenersInstalled = true;

  api.addEventListener("execution_success", handler);

  // leave ready but commented:
  // api.addEventListener("execution_error", handler);
  // api.addEventListener("execution_interrupted", handler);
}

function requestRedraw(node) {
  try {
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
  } catch {}
}

async function registerNodeType() {
  const LiteGraph = await waitFor(() => LG(), { tries: 240, intervalMs: 50 });
  await waitFor(() => typeof LiteGraph?.registerNodeType === "function", { tries: 240, intervalMs: 50 });

  if (LiteGraph.registered_node_types?.[NODE_PATH]) return;

  class StandaloneFGMuterAutoReset extends LiteGraph.LGraphNode {
    constructor() {
      super();

      // Make it virtual so ComfyUI doesn't try to serialize it into the backend prompt
      this.isVirtualNode = true;
      this.serialize_widgets = false;
      try { this.mode = LiteGraph.NEVER; } catch {}

      this.title = NODE_TITLE;
      this.size = [520, 360];

      // conventional-ish features
      this.properties.showAllGraphs = true;
      this.properties.sortMode = "alpha"; // alpha | canvas
      this.properties.enforceOnlyOne = false;
      this.properties.alwaysOne = false;

      // auto-reset config
      this.properties.autoResetEnabled = true;
      this.properties.autoResetTitles = ""; // comma/newline list
      this.properties.autoResetMatchMode = "exact"; // exact | contains | startswith | regex

      // Controls
      this.addWidget("toggle", "show all graphs", this.properties.showAllGraphs, (v) => {
        this.properties.showAllGraphs = !!v;
        this.refreshRows();
      });

      this.addWidget("combo", "sort", this.properties.sortMode, (v) => {
        this.properties.sortMode = v;
        this.refreshRows();
      }, { values: ["alpha", "canvas"] });

      this.addWidget("toggle", "only one active", this.properties.enforceOnlyOne, (v) => {
        this.properties.enforceOnlyOne = !!v;
      });

      this.addWidget("toggle", "always one active", this.properties.alwaysOne, (v) => {
        this.properties.alwaysOne = !!v;
      });

      this.addWidget("toggle", "auto reset enabled", this.properties.autoResetEnabled, (v) => {
        this.properties.autoResetEnabled = !!v;
      });

      this.addWidget("combo", "auto reset match", this.properties.autoResetMatchMode, (v) => {
        this.properties.autoResetMatchMode = v;
      }, { values: ["exact", "contains", "startswith", "regex"] });

      this.addWidget("text", "auto reset group titles", this.properties.autoResetTitles, (v) => {
        this.properties.autoResetTitles = String(v ?? "");
      });

      this.addWidget("button", "Refresh groups", "", () => {
        this.refreshRows();
      });

      this.addWidget("button", "Reset now (auto list)", "", () => {
        this.applyAutoReset();
      });

      // Rows will be appended after config widgets
      this.refreshRows();

      // Ensure listener is installed (global)
      installListenersOnce(() => {
        // On success, apply auto-reset for every instance currently on canvas/graph.
        // We scope this by scanning graphs and nodes of this type for reliability.
        this.__applyAutoResetAllInstances();
      });
    }

    isVirtual() { return true; }

    onConfigure() {
      // On workflow load, rebuild rows from current graph state
      this.refreshRows();
    }

    onAdded() {
      this.refreshRows();
    }

    onRemoved() {
      // nothing; listener is global
    }

    __applyAutoResetAllInstances() {
      const g = currentGraph();
      if (!g) return;

      // Find all nodes of our type in the current graph and apply their reset config
      for (const n of (g._nodes || [])) {
        if (n?.type === NODE_TITLE) {
          try { n.applyAutoReset(); } catch (e) { warn("applyAutoReset failed", e); }
        }
      }
    }

    refreshRows() {
      // Remove existing row widgets (keep the config widgets)
      this.widgets = (this.widgets || []).filter(w => w?.name !== "FGM_TOGGLE_NAV_ROW");

      const graphs = enumerateGraphs({ includeSubgraphs: this.properties.showAllGraphs === true });
      let groups = enumerateGroups(graphs);

      // sort
      if (this.properties.sortMode === "alpha") {
        groups.sort((a, b) => a.title.localeCompare(b.title));
      } else {
        // canvas-ish: by y then x
        groups.sort((a, b) => {
          const ay = a.group.pos?.[1] ?? 0;
          const by = b.group.pos?.[1] ?? 0;
          if (ay !== by) return ay - by;
          const ax = a.group.pos?.[0] ?? 0;
          const bx = b.group.pos?.[0] ?? 0;
          return ax - bx;
        });
      }

      // Create a row widget for each group
      for (const entry of groups) {
        const row = new GroupRowWidget(entry);
        this.widgets.push(row);
      }

      // Resize node based on number of rows (rough)
      const baseH = 230; // config widgets area
      const rowH = 22;
      const rows = groups.length;
      this.size[1] = Math.max(260, baseH + rows * rowH);

      requestRedraw(this);
    }

    applyAutoReset() {
      if (this.properties.autoResetEnabled === false) return;

      const patterns = normalizeLinesOrCsv(this.properties.autoResetTitles);
      if (!patterns.length) return;

      const mode = this.properties.autoResetMatchMode || "exact";

      // For each row widget, if title matches pattern, unmute it (toggle OFF)
      for (const w of (this.widgets || [])) {
        if (w?.name !== "FGM_TOGGLE_NAV_ROW") continue;
        if (!matchesTitle(w.title, patterns, mode)) continue;

        // Turn OFF = unmute
        setGroupMuted(w.graph, w.group, false);
        w.toggled = false;
        if (w.value && typeof w.value === "object") w.value.toggled = false;
      }

      requestRedraw(this);
    }

    onSerialize(o) {
      // keep it virtual
      o.isVirtualNode = true;
      o.serialize_widgets = false;
    }
  }

  LiteGraph.registerNodeType(NODE_PATH, StandaloneFGMuterAutoReset);
  log("Registered node:", NODE_PATH);
}

// Register extension
app.registerExtension({
  name: EXT_NAME,
  setup() {
    registerNodeType().catch(e => warn("registerNodeType failed", e));
  },
});

// Late-load safe (dynamic import)
registerNodeType().catch(e => warn("registerNodeType failed (late-load)", e));
