// standalone_fast_groups_muter_autoreset.js
//
// Here’s what you actually asked for:
//
// An exact clone of rgthree’s FastGroupsMuter (same UI, same behavior, same service-driven group enumeration, same restrictions, same nav arrow, same sorting/filtering… everything)
//
// One extra feature: a persistent property where the user can paste a string list of group titles (and optionally matching mode), and after every successful run those specific groups are automatically set back to OFF (i.e. doModeChange(false, true)), with no user clicking anything after loading a workflow.
//
//
// 3 new properties:
//
// autoResetEnabled (default true)
//
// autoResetTitles (string list, default empty)
// 
// autoResetMatch (exact|contains|startswith|regex, default exact)
//
// Hooks in onAdded/onRemoved
//
// applyAutoReset() that runs on execution_success

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

import { RgthreeBaseVirtualNode } from "./base_node.js";
import { NodeTypesString } from "./constants.js";
import { SERVICE as FAST_GROUPS_SERVICE } from "./services/fast_groups_service.js";
import { drawNodeWidget, fitString } from "./utils_canvas.js";
import { RgthreeBaseWidget } from "./utils_widgets.js";
import { changeModeOfNodes, getGroupNodes } from "./utils.js";

// -------------------- ORIGINAL rgthree constants --------------------
const PROPERTY_SORT = "sort";
const PROPERTY_SORT_CUSTOM_ALPHA = "customSortAlphabet";
const PROPERTY_MATCH_COLORS = "matchColors";
const PROPERTY_MATCH_TITLE = "matchTitle";
const PROPERTY_SHOW_NAV = "showNav";
const PROPERTY_SHOW_ALL_GRAPHS = "showAllGraphs";
const PROPERTY_RESTRICTION = "toggleRestriction";

// -------------------- NEW: Auto-reset properties --------------------
const PROPERTY_AUTORESET_ENABLED = "autoResetEnabled";
const PROPERTY_AUTORESET_TITLES = "autoResetTitles";
const PROPERTY_AUTORESET_MATCH = "autoResetMatch"; // exact|contains|startswith|regex

function parseAutoResetList(raw) {
  // comma and/or newline separated
  return String(raw || "")
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchesTitle(title, patterns, mode) {
  const t = String(title || "");
  if (!t || !patterns?.length) return false;

  const tl = t.toLowerCase();

  if (mode === "exact") {
    return patterns.some((p) => tl === String(p).toLowerCase());
  }
  if (mode === "contains") {
    return patterns.some((p) => tl.includes(String(p).toLowerCase()));
  }
  if (mode === "startswith") {
    return patterns.some((p) => tl.startsWith(String(p).toLowerCase()));
  }

  // regex
  for (const p of patterns) {
    try {
      const re = new RegExp(p, "i");
      if (re.test(t)) return true;
    } catch {
      // ignore invalid regex entries
    }
  }
  return false;
}

// ===================================================================
// 1) BASE: same as rgthree BaseFastGroupsModeChanger + new auto-reset
// ===================================================================
export class BaseFastGroupsModeChanger extends RgthreeBaseVirtualNode {
  constructor(title = FastGroupsMuterAutoReset.title) {
    super(title);
    this.modeOn = LiteGraph.ALWAYS;
    this.modeOff = LiteGraph.NEVER;
    this.debouncerTempWidth = 0;
    this.tempSize = null;
    this.serialize_widgets = false;
    this.helpActions = "mute and unmute";

    // rgthree properties
    this.properties[PROPERTY_MATCH_COLORS] = "";
    this.properties[PROPERTY_MATCH_TITLE] = "";
    this.properties[PROPERTY_SHOW_NAV] = true;
    this.properties[PROPERTY_SHOW_ALL_GRAPHS] = true;
    this.properties[PROPERTY_SORT] = "position";
    this.properties[PROPERTY_SORT_CUSTOM_ALPHA] = "";
    this.properties[PROPERTY_RESTRICTION] = "default";

    // NEW properties
    this.properties[PROPERTY_AUTORESET_ENABLED] = true;
    this.properties[PROPERTY_AUTORESET_TITLES] = "";
    this.properties[PROPERTY_AUTORESET_MATCH] = "exact";

    // bound handler
    this.__onExecutionSuccess = this.__onExecutionSuccess.bind(this);
  }

  onConstructed() {
    this.addOutput("OPT_CONNECTION", "*");
    return super.onConstructed();
  }

  onAdded(graph) {
    FAST_GROUPS_SERVICE.addFastGroupNode(this);

    // NEW: attach execution hook
    try {
      api.addEventListener("execution_success", this.__onExecutionSuccess);
    } catch (e) {
      console.warn("[FastGroupsMuterAutoReset] failed to add listener", e);
    }
  }

  onRemoved() {
    FAST_GROUPS_SERVICE.removeFastGroupNode(this);

    // NEW: detach execution hook
    try {
      api.removeEventListener?.("execution_success", this.__onExecutionSuccess);
    } catch {}
  }

  // NEW: execution handler
  __onExecutionSuccess() {
    try {
      this.applyAutoReset();
    } catch (e) {
      console.warn("[FastGroupsMuterAutoReset] applyAutoReset error", e);
    }
  }

  // NEW: apply autoreset based on group titles list
  applyAutoReset() {
    const enabled = this.properties?.[PROPERTY_AUTORESET_ENABLED] !== false;
    if (!enabled) return;

    const patterns = parseAutoResetList(this.properties?.[PROPERTY_AUTORESET_TITLES]);
    if (!patterns.length) return;

    const matchMode = this.properties?.[PROPERTY_AUTORESET_MATCH] || "exact";

    // Respect showAllGraphs, same semantics as refreshWidgets
    const showAllGraphs = this.properties?.[PROPERTY_SHOW_ALL_GRAPHS] !== false;
    const current = app.canvas?.getCurrentGraph?.();

    for (const widget of this.widgets || []) {
      if (!(widget instanceof FastGroupsToggleRowWidget)) continue;

      const group = widget.group;
      if (!group) continue;

      if (!showAllGraphs && group.graph !== current) continue;

      if (matchesTitle(group.title, patterns, matchMode)) {
        // The key behavior you want:
        // force OFF and skip restriction checks
        widget.doModeChange(false, true);
      }
    }

    // refresh canvas
    try {
      this.setDirtyCanvas(true, false);
      this.graph?.setDirtyCanvas?.(true, true);
      app.graph?.setDirtyCanvas?.(true, true);
    } catch {}
  }

  // -------------------- rgthree refreshWidgets (unchanged) --------------------
  refreshWidgets() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const canvas = app.canvas;
    let sort = ((_a = this.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_SORT]) || "position";
    let customAlphabet = null;
    if (sort === "custom alphabet") {
      const customAlphaStr =
        (_c = (_b = this.properties) === null || _b === void 0 ? void 0 : _b[PROPERTY_SORT_CUSTOM_ALPHA]) === null ||
        _c === void 0
          ? void 0
          : _c.replace(/\n/g, "");
      if (customAlphaStr && customAlphaStr.trim()) {
        customAlphabet = customAlphaStr.includes(",")
          ? customAlphaStr.toLocaleLowerCase().split(",")
          : customAlphaStr.toLocaleLowerCase().trim().split("");
      }
      if (!(customAlphabet === null || customAlphabet === void 0 ? void 0 : customAlphabet.length)) {
        sort = "alphanumeric";
        customAlphabet = null;
      }
    }
    const groups = [...FAST_GROUPS_SERVICE.getGroups(sort)];
    if (customAlphabet === null || customAlphabet === void 0 ? void 0 : customAlphabet.length) {
      groups.sort((a, b) => {
        let aIndex = -1;
        let bIndex = -1;
        for (const [index, alpha] of customAlphabet.entries()) {
          aIndex = aIndex < 0 ? (a.title.toLocaleLowerCase().startsWith(alpha) ? index : -1) : aIndex;
          bIndex = bIndex < 0 ? (b.title.toLocaleLowerCase().startsWith(alpha) ? index : -1) : bIndex;
          if (aIndex > -1 && bIndex > -1) {
            break;
          }
        }
        if (aIndex > -1 && bIndex > -1) {
          const ret = aIndex - bIndex;
          if (ret === 0) {
            return a.title.localeCompare(b.title);
          }
          return ret;
        } else if (aIndex > -1) {
          return -1;
        } else if (bIndex > -1) {
          return 1;
        }
        return a.title.localeCompare(b.title);
      });
    }
    let filterColors =
      (((_e = (_d = this.properties) === null || _d === void 0 ? void 0 : _d[PROPERTY_MATCH_COLORS]) === null ||
        _e === void 0
        ? void 0
        : _e.split(",")) || []).filter((c) => c.trim());
    if (filterColors.length) {
      filterColors = filterColors.map((color) => {
        color = color.trim().toLocaleLowerCase();
        if (LGraphCanvas.node_colors[color]) {
          color = LGraphCanvas.node_colors[color].groupcolor;
        }
        color = color.replace("#", "").toLocaleLowerCase();
        if (color.length === 3) {
          color = color.replace(/(.)(.)(.)/, "$1$1$2$2$3$3");
        }
        return `#${color}`;
      });
    }
    let index = 0;
    for (const group of groups) {
      if (filterColors.length) {
        let groupColor = (_f = group.color) === null || _f === void 0 ? void 0 : _f.replace("#", "").trim().toLocaleLowerCase();
        if (!groupColor) {
          continue;
        }
        if (groupColor.length === 3) {
          groupColor = groupColor.replace(/(.)(.)(.)/, "$1$1$2$2$3$3");
        }
        groupColor = `#${groupColor}`;
        if (!filterColors.includes(groupColor)) {
          continue;
        }
      }
      if ((_h = (_g = this.properties) === null || _g === void 0 ? void 0 : _g[PROPERTY_MATCH_TITLE]) === null || _h === void 0 ? void 0 : _h.trim()) {
        try {
          if (!new RegExp(this.properties[PROPERTY_MATCH_TITLE], "i").exec(group.title)) {
            continue;
          }
        } catch (e) {
          console.error(e);
          continue;
        }
      }
      const showAllGraphs = (_j = this.properties) === null || _j === void 0 ? void 0 : _j[PROPERTY_SHOW_ALL_GRAPHS];
      if (!showAllGraphs && group.graph !== app.canvas.getCurrentGraph()) {
        continue;
      }
      let isDirty = false;
      const widgetLabel = `Enable ${group.title}`;
      let widget = this.widgets.find((w) => w.label === widgetLabel);
      if (!widget) {
        this.tempSize = [...this.size];
        widget = this.addCustomWidget(new FastGroupsToggleRowWidget(group, this));
        this.setSize(this.computeSize());
        isDirty = true;
      }
      if (widget.label != widgetLabel) {
        widget.label = widgetLabel;
        isDirty = true;
      }
      if (group.rgthree_hasAnyActiveNode != null && widget.toggled != group.rgthree_hasAnyActiveNode) {
        widget.toggled = group.rgthree_hasAnyActiveNode;
        isDirty = true;
      }
      if (this.widgets[index] !== widget) {
        const oldIndex = this.widgets.findIndex((w) => w === widget);
        this.widgets.splice(index, 0, this.widgets.splice(oldIndex, 1)[0]);
        isDirty = true;
      }
      if (isDirty) {
        this.setDirtyCanvas(true, false);
      }
      index++;
    }
    while ((this.widgets || [])[index]) {
      this.removeWidget(index++);
    }
  }

  computeSize(out) {
    let size = super.computeSize(out);
    if (this.tempSize) {
      size[0] = Math.max(this.tempSize[0], size[0]);
      size[1] = Math.max(this.tempSize[1], size[1]);
      this.debouncerTempWidth && clearTimeout(this.debouncerTempWidth);
      this.debouncerTempWidth = setTimeout(() => {
        this.tempSize = null;
      }, 32);
    }
    setTimeout(() => {
      var _a;
      (_a = this.graph) === null || _a === void 0 ? void 0 : _a.setDirtyCanvas(true, true);
    }, 16);
    return size;
  }

  async handleAction(action) {
    var _a, _b, _c, _d, _e;
    if (action === "Mute all" || action === "Bypass all") {
      const alwaysOne = ((_a = this.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_RESTRICTION]) === "always one";
      for (const [index, widget] of this.widgets.entries()) {
        widget === null || widget === void 0 ? void 0 : widget.doModeChange(alwaysOne && !index ? true : false, true);
      }
    } else if (action === "Enable all") {
      const onlyOne = (_b = this.properties) === null || _b === void 0 ? void 0 : _b[PROPERTY_RESTRICTION].includes(" one");
      for (const [index, widget] of this.widgets.entries()) {
        widget === null || widget === void 0 ? void 0 : widget.doModeChange(onlyOne && index > 0 ? false : true, true);
      }
    } else if (action === "Toggle all") {
      const onlyOne = (_c = this.properties) === null || _c === void 0 ? void 0 : _c[PROPERTY_RESTRICTION].includes(" one");
      let foundOne = false;
      for (const [index, widget] of this.widgets.entries()) {
        let newValue = onlyOne && foundOne ? false : !widget.value;
        foundOne = foundOne || newValue;
        widget === null || widget === void 0 ? void 0 : widget.doModeChange(newValue, true);
      }
      if (!foundOne && ((_d = this.properties) === null || _d === void 0 ? void 0 : _d[PROPERTY_RESTRICTION]) === "always one") {
        (_e = this.widgets[this.widgets.length - 1]) === null || _e === void 0 ? void 0 : _e.doModeChange(true, true);
      }
    }
  }

  getHelp() {
    return `
      <p>The ${this.type.replace("(rgthree)", "")} is an input-less node that automatically collects all groups in your current
      workflow and allows you to quickly ${this.helpActions} all nodes within the group.</p>
      <ul>
        <li>
          <p>
            <strong>Properties.</strong> You can change the following properties (by right-clicking
            on the node, and select "Properties" or "Properties Panel" from the menu):
          </p>
          <ul>
            <li><p>
              <code>${PROPERTY_MATCH_COLORS}</code> - Only add groups that match the provided
              colors. Can be ComfyUI colors (red, pale_blue) or hex codes (#a4d399). Multiple can be
              added, comma delimited.
            </p></li>
            <li><p>
              <code>${PROPERTY_MATCH_TITLE}</code> - Filter the list of toggles by title match
              (string match, or regular expression).
            </p></li>
            <li><p>
              <code>${PROPERTY_SHOW_NAV}</code> - Add / remove a quick navigation arrow to take you
              to the group. <i>(default: true)</i>
            </p></li>
            <li><p>
              <code>${PROPERTY_SHOW_ALL_GRAPHS}</code> - Show groups from all [sub]graphs in the
              workflow. <i>(default: true)</i>
            </p></li>
            <li><p>
              <code>${PROPERTY_SORT}</code> - Sort the toggles' order by "alphanumeric", graph
              "position", or "custom alphabet". <i>(default: "position")</i>
            </p></li>
            <li><p>
              <code>${PROPERTY_SORT_CUSTOM_ALPHA}</code> - When sort is "custom alphabet" define
              the alphabet here.
            </p></li>
            <li><p>
              <code>${PROPERTY_RESTRICTION}</code> - Optionally restrict toggles to "max one" or
              "always one".
            </p></li>

            <!-- NEW -->
            <li><p>
              <code>${PROPERTY_AUTORESET_ENABLED}</code> - Enable/disable auto reset after a successful run.
              <i>(default: true)</i>
            </p></li>
            <li><p>
              <code>${PROPERTY_AUTORESET_TITLES}</code> - Comma or newline separated list of group titles
              that should be forced back to OFF after a successful run.
              Example: <code>BG, PRODUCT, DETAILER</code>
            </p></li>
            <li><p>
              <code>${PROPERTY_AUTORESET_MATCH}</code> - Matching mode for the list:
              exact | contains | startswith | regex.
            </p></li>

          </ul>
        </li>
      </ul>`;
  }
}

// Keep rgthree base metadata (but we will NOT register this base type directly)
BaseFastGroupsModeChanger.type = NodeTypesString.FAST_GROUPS_MUTER;
BaseFastGroupsModeChanger.title = NodeTypesString.FAST_GROUPS_MUTER;
BaseFastGroupsModeChanger.exposedActions = ["Mute all", "Enable all", "Toggle all"];

// Base property panel for rgthree properties
BaseFastGroupsModeChanger["@matchColors"] = { type: "string" };
BaseFastGroupsModeChanger["@matchTitle"] = { type: "string" };
BaseFastGroupsModeChanger["@showNav"] = { type: "boolean" };
BaseFastGroupsModeChanger["@showAllGraphs"] = { type: "boolean" };
BaseFastGroupsModeChanger["@sort"] = {
  type: "combo",
  values: ["position", "alphanumeric", "custom alphabet"],
};
BaseFastGroupsModeChanger["@customSortAlphabet"] = { type: "string" };
BaseFastGroupsModeChanger["@toggleRestriction"] = {
  type: "combo",
  values: ["default", "max one", "always one"],
};

// NEW: auto-reset property panel
BaseFastGroupsModeChanger[`@${PROPERTY_AUTORESET_ENABLED}`] = { type: "boolean" };
BaseFastGroupsModeChanger[`@${PROPERTY_AUTORESET_TITLES}`] = { type: "string" };
BaseFastGroupsModeChanger[`@${PROPERTY_AUTORESET_MATCH}`] = {
  type: "combo",
  values: ["exact", "contains", "startswith", "regex"],
};

// ===================================================================
// 2) NODE: exact clone of FastGroupsMuter, but new type/title to avoid
//    colliding with rgthree’s original.
// ===================================================================
export class FastGroupsMuterAutoReset extends BaseFastGroupsModeChanger {
  constructor(title = FastGroupsMuterAutoReset.title) {
    super(title);

    // Same comfy class as rgthree muter (frontend-only anyway)
    this.comfyClass = NodeTypesString.FAST_GROUPS_MUTER;

    this.helpActions = "mute and unmute";
    this.modeOn = LiteGraph.ALWAYS;
    this.modeOff = LiteGraph.NEVER;
    this.onConstructed();
  }
}

// Unique identity so you can keep rgthree original too
FastGroupsMuterAutoReset.type = "FastGroupsMuterAutoReset (rgthree)";
FastGroupsMuterAutoReset.title = "FastGroupsMuterAutoReset (rgthree)";
FastGroupsMuterAutoReset.exposedActions = ["Bypass all", "Enable all", "Toggle all"];

// ===================================================================
// 3) WIDGET: EXACT rgthree toggle row widget (unchanged)
// ===================================================================
class FastGroupsToggleRowWidget extends RgthreeBaseWidget {
  constructor(group, node) {
    super("RGTHREE_TOGGLE_AND_NAV");
    this.value = { toggled: false };
    this.options = { on: "yes", off: "no" };
    this.type = "custom";
    this.label = "";
    this.group = group;
    this.node = node;
  }

  doModeChange(force, skipOtherNodeCheck) {
    var _a, _b, _c, _d;
    this.group.recomputeInsideNodes();
    const hasAnyActiveNodes = getGroupNodes(this.group).some((n) => n.mode === LiteGraph.ALWAYS);
    let newValue = force != null ? force : !hasAnyActiveNodes;

    if (skipOtherNodeCheck !== true) {
      if (
        newValue &&
        ((_b = (_a = this.node.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_RESTRICTION]) === null ||
        _b === void 0
          ? void 0
          : _b.includes(" one"))
      ) {
        for (const widget of this.node.widgets) {
          if (widget instanceof FastGroupsToggleRowWidget) {
            widget.doModeChange(false, true);
          }
        }
      } else if (!newValue && ((_c = this.node.properties) === null || _c === void 0 ? void 0 : _c[PROPERTY_RESTRICTION]) === "always one") {
        newValue = this.node.widgets.every((w) => !w.value || w === this);
      }
    }

    changeModeOfNodes(getGroupNodes(this.group), newValue ? this.node.modeOn : this.node.modeOff);
    this.group.rgthree_hasAnyActiveNode = newValue;
    this.toggled = newValue;
    (_d = this.group.graph) === null || _d === void 0 ? void 0 : _d.setDirtyCanvas(true, false);
  }

  get toggled() {
    return this.value.toggled;
  }
  set toggled(value) {
    this.value.toggled = value;
  }

  toggle(value) {
    value = value == null ? !this.toggled : value;
    if (value !== this.toggled) {
      this.value.toggled = value;
      this.doModeChange();
    }
  }

  draw(ctx, node, width, posY, height) {
    var _a;
    const widgetData = drawNodeWidget(ctx, { size: [width, height], pos: [15, posY] });
    const showNav = ((_a = node.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_SHOW_NAV]) !== false;
    let currentX = widgetData.width - widgetData.margin;
    if (!widgetData.lowQuality && showNav) {
      currentX -= 7;
      const midY = widgetData.posY + widgetData.height * 0.5;
      ctx.fillStyle = ctx.strokeStyle = "#89A";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const arrow = new Path2D(`M${currentX} ${midY} l -7 6 v -3 h -7 v -6 h 7 v -3 z`);
      ctx.fill(arrow);
      ctx.stroke(arrow);
      currentX -= 14;
      currentX -= 7;
      ctx.strokeStyle = widgetData.colorOutline;
      ctx.stroke(new Path2D(`M ${currentX} ${widgetData.posY} v ${widgetData.height}`));
    } else if (widgetData.lowQuality && showNav) {
      currentX -= 28;
    }
    currentX -= 7;
    ctx.fillStyle = this.toggled ? "#89A" : "#333";
    ctx.beginPath();
    const toggleRadius = height * 0.36;
    ctx.arc(currentX - toggleRadius, posY + height * 0.5, toggleRadius, 0, Math.PI * 2);
    ctx.fill();
    currentX -= toggleRadius * 2;
    if (!widgetData.lowQuality) {
      currentX -= 4;
      ctx.textAlign = "right";
      ctx.fillStyle = this.toggled ? widgetData.colorText : widgetData.colorTextSecondary;
      const label = this.label;
      const toggleLabelOn = this.options.on || "true";
      const toggleLabelOff = this.options.off || "false";
      ctx.fillText(this.toggled ? toggleLabelOn : toggleLabelOff, currentX, posY + height * 0.7);
      currentX -= Math.max(ctx.measureText(toggleLabelOn).width, ctx.measureText(toggleLabelOff).width);
      currentX -= 7;
      ctx.textAlign = "left";
      let maxLabelWidth = widgetData.width - widgetData.margin - 10 - (widgetData.width - currentX);
      if (label != null) {
        ctx.fillText(fitString(ctx, label, maxLabelWidth), widgetData.margin + 10, posY + height * 0.7);
      }
    }
  }

  serializeValue(node, index) {
    return this.value;
  }

  mouse(event, pos, node) {
    var _a, _b, _c;
    if (event.type == "pointerdown") {
      if (((_a = node.properties) === null || _a === void 0 ? void 0 : _a[PROPERTY_SHOW_NAV]) !== false && pos[0] >= node.size[0] - 15 - 28 - 1) {
        const canvas = app.canvas;
        const lowQuality = (((_b = canvas.ds) === null || _b === void 0 ? void 0 : _b.scale) || 1) <= 0.5;
        if (!lowQuality) {
          canvas.centerOnNode(this.group);
          const zoomCurrent = ((_c = canvas.ds) === null || _c === void 0 ? void 0 : _c.scale) || 1;
          const zoomX = canvas.canvas.width / this.group._size[0] - 0.02;
          const zoomY = canvas.canvas.height / this.group._size[1] - 0.02;
          canvas.setZoom(Math.min(zoomCurrent, zoomX, zoomY), [canvas.canvas.width / 2, canvas.canvas.height / 2]);
          canvas.setDirty(true, true);
        }
      } else {
        this.toggle();
      }
    }
    return true;
  }
}

// ===================================================================
// 4) EXTENSION REGISTRATION: clone rgthree style, but new name/type
// ===================================================================
app.registerExtension({
  name: "rgthree.FastGroupsMuterAutoReset",
  registerCustomNodes() {
    FastGroupsMuterAutoReset.setUp();
  },
  loadedGraphNode(node) {
    if (node.type == FastGroupsMuterAutoReset.title) {
      node.tempSize = [...node.size];
    }
  },
});
