import { app } from "../../scripts/app.js";

const PROPERTY_SORT = "sort";
const PROPERTY_SORT_CUSTOM_ALPHA = "customSortAlphabet";
const PROPERTY_MATCH_COLORS = "matchColors";
const PROPERTY_MATCH_TITLE = "matchTitle";
const PROPERTY_SHOW_NAV = "showNav";
const PROPERTY_SHOW_ALL_GRAPHS = "showAllGraphs";
const PROPERTY_RESTRICTION = "toggleRestriction";
const PROPERTY_AUTO_RESET_GROUP_NAME = "autoResetGroupName";

const NODE_TYPE = "Beyond Fast Groups Muter With Autoreset";

function getGroupNodes(group) {
    return Array.from(group._children).filter((c) => c instanceof LGraphNode);
}

function changeModeOfNodes(nodeOrNodes, mode) {
    const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes];
    const stack = nodes.map((node) => ({ node }));
    while (stack.length > 0) {
        const { node } = stack.pop();
        node.mode = mode;
        if (node.isSubgraphNode?.() && node.subgraph) {
            const children = node.subgraph.nodes;
            for (let i = children.length - 1; i >= 0; i--) {
                stack.push({ node: children[i] });
            }
        }
    }
}

function fitString(ctx, str, maxWidth) {
    let width = ctx.measureText(str).width;
    const ellipsis = "…";
    const ellipsisWidth = ctx.measureText(ellipsis).width;
    if (width <= maxWidth || width <= ellipsisWidth) {
        return str;
    }
    let min = 0;
    let max = str.length;
    while (min <= max) {
        let guess = Math.floor((min + max) / 2);
        const compareVal = ctx.measureText(str.substring(0, guess)).width;
        if (compareVal === maxWidth - ellipsisWidth) {
            min = guess;
            break;
        }
        if (compareVal < maxWidth - ellipsisWidth) min = guess + 1;
        else max = guess - 1;
    }
    return str.substring(0, max) + ellipsis;
}

function isLowQuality() {
    const canvas = app.canvas;
    return (canvas.ds?.scale || 1) <= 0.5;
}

function drawNodeWidget(ctx, options) {
    const lowQuality = isLowQuality();
    const data = {
        width: options.size[0],
        height: options.size[1],
        posY: options.pos[1],
        lowQuality,
        margin: 15,
        colorOutline: LiteGraph.WIDGET_OUTLINE_COLOR,
        colorBackground: LiteGraph.WIDGET_BGCOLOR,
        colorText: LiteGraph.WIDGET_TEXT_COLOR,
        colorTextSecondary: LiteGraph.WIDGET_SECONDARY_TEXT_COLOR,
    };
    ctx.strokeStyle = options.colorStroke || data.colorOutline;
    ctx.fillStyle = options.colorBackground || data.colorBackground;
    ctx.beginPath();
    ctx.roundRect(data.margin, data.posY, data.width - data.margin * 2, data.height, lowQuality ? [0] : options.borderRadius ? [options.borderRadius] : [options.size[1] * 0.5]);
    ctx.fill();
    if (!lowQuality) {
        ctx.stroke();
    }
    return data;
}

function getGraphDependantNodeKey(node) {
    const graph = node.graph ?? app.graph;
    return `${graph.id}:${node.id}`;
}

class FastGroupsService {
    constructor() {
        this.msThreshold = 400;
        this.msLastUnsorted = 0;
        this.msLastAlpha = 0;
        this.msLastPosition = 0;
        this.groupsUnsorted = [];
        this.groupsSortedAlpha = [];
        this.groupsSortedPosition = [];
        this.fastGroupNodes = [];
        this.runScheduledForMs = null;
        this.runScheduleTimeout = null;
        this.runScheduleAnimation = null;
        this.cachedNodeBoundings = null;
    }
    addFastGroupNode(node) {
        this.fastGroupNodes.push(node);
        this.scheduleRun(8);
    }
    removeFastGroupNode(node) {
        const index = this.fastGroupNodes.indexOf(node);
        if (index > -1) {
            this.fastGroupNodes.splice(index, 1);
        }
        if (!this.fastGroupNodes?.length) {
            this.clearScheduledRun();
            this.groupsUnsorted = [];
            this.groupsSortedAlpha = [];
            this.groupsSortedPosition = [];
        }
    }
    run() {
        if (!this.runScheduledForMs) {
            return;
        }
        for (const node of this.fastGroupNodes) {
            node.refreshWidgets();
        }
        this.clearScheduledRun();
        this.scheduleRun();
    }
    scheduleRun(ms = 500) {
        if (this.runScheduledForMs && ms < this.runScheduledForMs) {
            this.clearScheduledRun();
        }
        if (!this.runScheduledForMs && this.fastGroupNodes.length) {
            this.runScheduledForMs = ms;
            this.runScheduleTimeout = setTimeout(() => {
                this.runScheduleAnimation = requestAnimationFrame(() => this.run());
            }, ms);
        }
    }
    clearScheduledRun() {
        this.runScheduleTimeout && clearTimeout(this.runScheduleTimeout);
        this.runScheduleAnimation && cancelAnimationFrame(this.runScheduleAnimation);
        this.runScheduleTimeout = null;
        this.runScheduleAnimation = null;
        this.runScheduledForMs = null;
    }
    getBoundingsForAllNodes() {
        if (!this.cachedNodeBoundings) {
            this.cachedNodeBoundings = {};
            const nodes = app.graph._nodes;
            const stack = nodes.map((node) => ({ node }));
            while (stack.length > 0) {
                const { node } = stack.pop();
                let bounds = node.getBounding();
                if (bounds[0] === 0 && bounds[1] === 0 && bounds[2] === 0 && bounds[3] === 0) {
                    const ctx = node.graph?.primaryCanvas?.canvas.getContext("2d");
                    if (ctx) {
                        node.updateArea(ctx);
                        bounds = node.getBounding();
                    }
                }
                this.cachedNodeBoundings[getGraphDependantNodeKey(node)] = bounds;
                if (node.isSubgraphNode?.() && node.subgraph) {
                    const children = node.subgraph.nodes;
                    for (let i = children.length - 1; i >= 0; i--) {
                        stack.push({ node: children[i] });
                    }
                }
            }
            setTimeout(() => {
                this.cachedNodeBoundings = null;
            }, 50);
        }
        return this.cachedNodeBoundings;
    }
    recomputeInsideNodesForGroup(group) {
        if (app.canvas.isDragging) return;
        const cachedBoundings = this.getBoundingsForAllNodes();
        const nodes = group.graph.nodes;
        group._children.clear();
        group.nodes.length = 0;
        for (const node of nodes) {
            const nodeBounding = cachedBoundings[getGraphDependantNodeKey(node)];
            const nodeCenter = nodeBounding && [nodeBounding[0] + nodeBounding[2] * 0.5, nodeBounding[1] + nodeBounding[3] * 0.5];
            if (nodeCenter) {
                const grouBounds = group._bounding;
                if (nodeCenter[0] >= grouBounds[0] && nodeCenter[0] < grouBounds[0] + grouBounds[2] && nodeCenter[1] >= grouBounds[1] && nodeCenter[1] < grouBounds[1] + grouBounds[3]) {
                    group._children.add(node);
                    group.nodes.push(node);
                }
            }
        }
    }
    getGroupsUnsorted(now) {
        const canvas = app.canvas;
        const graph = canvas.getCurrentGraph() ?? app.graph;
        if (!canvas.selected_group_moving && (!this.groupsUnsorted.length || now - this.msLastUnsorted > this.msThreshold)) {
            this.groupsUnsorted = [...graph._groups];
            const subgraphs = graph.subgraphs?.values();
            if (subgraphs) {
                let s;
                while ((s = subgraphs.next().value)) this.groupsUnsorted.push(...(s.groups ?? []));
            }
            for (const group of this.groupsUnsorted) {
                this.recomputeInsideNodesForGroup(group);
                group.rgthree_hasAnyActiveNode = getGroupNodes(group).some((n) => n.mode === LiteGraph.ALWAYS);
            }
            this.msLastUnsorted = now;
        }
        return this.groupsUnsorted;
    }
    getGroupsAlpha(now) {
        if (!this.groupsSortedAlpha.length || now - this.msLastAlpha > this.msThreshold) {
            this.groupsSortedAlpha = [...this.getGroupsUnsorted(now)].sort((a, b) => a.title.localeCompare(b.title));
            this.msLastAlpha = now;
        }
        return this.groupsSortedAlpha;
    }
    getGroupsPosition(now) {
        if (!this.groupsSortedPosition.length || now - this.msLastPosition > this.msThreshold) {
            this.groupsSortedPosition = [...this.getGroupsUnsorted(now)].sort((a, b) => {
                const aY = Math.floor(a._pos[1] / 30);
                const bY = Math.floor(b._pos[1] / 30);
                if (aY == bY) {
                    const aX = Math.floor(a._pos[0] / 30);
                    const bX = Math.floor(b._pos[0] / 30);
                    return aX - bX;
                }
                return aY - bY;
            });
            this.msLastPosition = now;
        }
        return this.groupsSortedPosition;
    }
    getGroups(sort) {
        const now = +new Date();
        if (sort === "alphanumeric") return this.getGroupsAlpha(now);
        if (sort === "position") return this.getGroupsPosition(now);
        return this.getGroupsUnsorted(now);
    }
}

const SERVICE = new FastGroupsService();

class RgthreeBaseWidget {
    constructor(name) {
        this.type = "custom";
        this.options = {};
        this.y = 0;
        this.last_y = 0;
        this.mouseDowned = null;
        this.isMouseDownedAndOver = false;
        this.hitAreas = {};
        this.downedHitAreasForMove = [];
        this.downedHitAreasForClick = [];
        this.name = name;
    }
    serializeValue(node, index) {
        return this.value;
    }
    clickWasWithinBounds(pos, bounds) {
        let xStart = bounds[0];
        let xEnd = xStart + (bounds.length > 2 ? bounds[2] : bounds[1]);
        const clickedX = pos[0] >= xStart && pos[0] <= xEnd;
        if (bounds.length === 2) return clickedX;
        return clickedX && pos[1] >= bounds[1] && pos[1] <= bounds[1] + bounds[3];
    }
    mouse(event, pos, node) {
        const canvas = app.canvas;
        if (event.type == "pointerdown") {
            this.mouseDowned = [...pos];
            this.isMouseDownedAndOver = true;
            this.downedHitAreasForMove.length = 0;
            this.downedHitAreasForClick.length = 0;
            let anyHandled = false;
            for (const part of Object.values(this.hitAreas)) {
                if (this.clickWasWithinBounds(pos, part.bounds)) {
                    if (part.onMove) this.downedHitAreasForMove.push(part);
                    if (part.onClick) this.downedHitAreasForClick.push(part);
                    if (part.onDown) {
                        const thisHandled = part.onDown.apply(this, [event, pos, node, part]);
                        anyHandled = anyHandled || thisHandled == true;
                    }
                    part.wasMouseClickedAndIsOver = true;
                }
            }
            return this.onMouseDown(event, pos, node) ?? anyHandled;
        }
        if (event.type == "pointerup") {
            if (!this.mouseDowned) return true;
            this.downedHitAreasForMove.length = 0;
            const wasMouseDownedAndOver = this.isMouseDownedAndOver;
            this.cancelMouseDown();
            let anyHandled = false;
            for (const part of Object.values(this.hitAreas)) {
                if (part.onUp && this.clickWasWithinBounds(pos, part.bounds)) {
                    const thisHandled = part.onUp.apply(this, [event, pos, node, part]);
                    anyHandled = anyHandled || thisHandled == true;
                }
                part.wasMouseClickedAndIsOver = false;
            }
            for (const part of this.downedHitAreasForClick) {
                if (this.clickWasWithinBounds(pos, part.bounds)) {
                    const thisHandled = part.onClick.apply(this, [event, pos, node, part]);
                    anyHandled = anyHandled || thisHandled == true;
                }
            }
            this.downedHitAreasForClick.length = 0;
            if (wasMouseDownedAndOver) {
                const thisHandled = this.onMouseClick(event, pos, node);
                anyHandled = anyHandled || thisHandled == true;
            }
            return this.onMouseUp(event, pos, node) ?? anyHandled;
        }
        if (event.type == "pointermove") {
            this.isMouseDownedAndOver = !!this.mouseDowned;
            if (this.mouseDowned && (pos[0] < 15 || pos[0] > node.size[0] - 15 || pos[1] < this.last_y || pos[1] > this.last_y + LiteGraph.NODE_WIDGET_HEIGHT)) {
                this.isMouseDownedAndOver = false;
            }
            for (const part of Object.values(this.hitAreas)) {
                if (this.downedHitAreasForMove.includes(part)) {
                    part.onMove.apply(this, [event, pos, node, part]);
                }
                if (this.downedHitAreasForClick.includes(part)) {
                    part.wasMouseClickedAndIsOver = this.clickWasWithinBounds(pos, part.bounds);
                }
            }
            return this.onMouseMove(event, pos, node) ?? true;
        }
        return false;
    }
    cancelMouseDown() {
        this.mouseDowned = null;
        this.isMouseDownedAndOver = false;
        this.downedHitAreasForMove.length = 0;
    }
    onMouseDown(event, pos, node) { return; }
    onMouseUp(event, pos, node) { return; }
    onMouseClick(event, pos, node) { return; }
    onMouseMove(event, pos, node) { return; }
}

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
        this.group.recomputeInsideNodes();
        const hasAnyActiveNodes = getGroupNodes(this.group).some((n) => n.mode === LiteGraph.ALWAYS);
        let newValue = force != null ? force : !hasAnyActiveNodes;
        if (skipOtherNodeCheck !== true) {
            if (newValue && this.node.properties?.[PROPERTY_RESTRICTION]?.includes(" one")) {
                for (const widget of this.node.widgets) {
                    if (widget instanceof FastGroupsToggleRowWidget) {
                        widget.doModeChange(false, true);
                    }
                }
            } else if (!newValue && this.node.properties?.[PROPERTY_RESTRICTION] === "always one") {
                newValue = this.node.widgets.every((w) => !w.value || w === this);
            }
        }
        changeModeOfNodes(getGroupNodes(this.group), newValue ? this.node.modeOn : this.node.modeOff);
        this.group.rgthree_hasAnyActiveNode = newValue;
        this.toggled = newValue;
        this.group.graph?.setDirtyCanvas(true, false);
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
        const widgetData = drawNodeWidget(ctx, { size: [width, height], pos: [15, posY] });
        const showNav = node.properties?.[PROPERTY_SHOW_NAV] !== false;
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
        if (event.type == "pointerdown") {
            if (node.properties?.[PROPERTY_SHOW_NAV] !== false && pos[0] >= node.size[0] - 15 - 28 - 1) {
                const canvas = app.canvas;
                const lowQuality = (canvas.ds?.scale || 1) <= 0.5;
                if (!lowQuality) {
                    canvas.centerOnNode(this.group);
                    const zoomCurrent = canvas.ds?.scale || 1;
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

class FastGroupsMuterWithAutoreset extends LGraphNode {
    static title = NODE_TYPE;
    static type = NODE_TYPE;
    static category = "Beyond_nodes";
    static _category = "Beyond_nodes";
    static exposedActions = ["Bypass all", "Enable all", "Toggle all"];
    static ["@matchColors"] = { type: "string" };
    static ["@matchTitle"] = { type: "string" };
    static ["@showNav"] = { type: "boolean" };
    static ["@showAllGraphs"] = { type: "boolean" };
    static ["@sort"] = { type: "combo", values: ["position", "alphanumeric", "custom alphabet"] };
    static ["@customSortAlphabet"] = { type: "string" };
    static ["@toggleRestriction"] = { type: "combo", values: ["default", "max one", "always one"] };
    static ["@autoResetGroupName"] = { type: "string" };

    constructor(title = NODE_TYPE) {
        super(title);
        this.comfyClass = NODE_TYPE;
        this.isVirtualNode = true;
        this.modeOn = LiteGraph.ALWAYS;
        this.modeOff = LiteGraph.NEVER;
        this.debouncerTempWidth = 0;
        this.tempSize = null;
        this.serialize_widgets = false;
        this.helpActions = "mute and unmute";
        this.widgets = this.widgets || [];
        this.properties = this.properties || {};
        this.properties[PROPERTY_MATCH_COLORS] = "";
        this.properties[PROPERTY_MATCH_TITLE] = "";
        this.properties[PROPERTY_SHOW_NAV] = true;
        this.properties[PROPERTY_SHOW_ALL_GRAPHS] = true;
        this.properties[PROPERTY_SORT] = "position";
        this.properties[PROPERTY_SORT_CUSTOM_ALPHA] = "";
        this.properties[PROPERTY_RESTRICTION] = "default";
        this.properties[PROPERTY_AUTO_RESET_GROUP_NAME] = "";
        this.addOutput("OPT_CONNECTION", "*");
    }

    onAdded(graph) {
        SERVICE.addFastGroupNode(this);
    }

    onRemoved() {
        SERVICE.removeFastGroupNode(this);
    }

    onExecuted() {
        this.resetAutoResetGroups();
    }

    resetAutoResetGroups() {
        const autoResetStr = this.properties?.[PROPERTY_AUTO_RESET_GROUP_NAME] || "";
        if (!autoResetStr.trim()) return;

        const patterns = autoResetStr.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s);
        if (!patterns.length) return;

        for (const widget of this.widgets) {
            if (!(widget instanceof FastGroupsToggleRowWidget)) continue;
            if (!widget.toggled) continue;

            const groupTitle = widget.group.title.toLowerCase();
            const shouldReset = patterns.some((pattern) => groupTitle.includes(pattern));
            if (shouldReset) {
                widget.doModeChange(false, true);
            }
        }
    }

    refreshWidgets() {
        const canvas = app.canvas;
        let sort = this.properties?.[PROPERTY_SORT] || "position";
        let customAlphabet = null;
        if (sort === "custom alphabet") {
            const customAlphaStr = this.properties?.[PROPERTY_SORT_CUSTOM_ALPHA]?.replace(/\n/g, "");
            if (customAlphaStr && customAlphaStr.trim()) {
                customAlphabet = customAlphaStr.includes(",")
                    ? customAlphaStr.toLocaleLowerCase().split(",")
                    : customAlphaStr.toLocaleLowerCase().trim().split("");
            }
            if (!customAlphabet?.length) {
                sort = "alphanumeric";
                customAlphabet = null;
            }
        }
        const groups = [...SERVICE.getGroups(sort)];
        if (customAlphabet?.length) {
            groups.sort((a, b) => {
                let aIndex = -1;
                let bIndex = -1;
                for (const [index, alpha] of customAlphabet.entries()) {
                    aIndex = aIndex < 0 ? (a.title.toLocaleLowerCase().startsWith(alpha) ? index : -1) : aIndex;
                    bIndex = bIndex < 0 ? (b.title.toLocaleLowerCase().startsWith(alpha) ? index : -1) : bIndex;
                    if (aIndex > -1 && bIndex > -1) break;
                }
                if (aIndex > -1 && bIndex > -1) {
                    const ret = aIndex - bIndex;
                    if (ret === 0) return a.title.localeCompare(b.title);
                    return ret;
                } else if (aIndex > -1) {
                    return -1;
                } else if (bIndex > -1) {
                    return 1;
                }
                return a.title.localeCompare(b.title);
            });
        }
        let filterColors = (this.properties?.[PROPERTY_MATCH_COLORS]?.split(",") || []).filter((c) => c.trim());
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
                let groupColor = group.color?.replace("#", "").trim().toLocaleLowerCase();
                if (!groupColor) continue;
                if (groupColor.length === 3) {
                    groupColor = groupColor.replace(/(.)(.)(.)/, "$1$1$2$2$3$3");
                }
                groupColor = `#${groupColor}`;
                if (!filterColors.includes(groupColor)) continue;
            }
            if (this.properties?.[PROPERTY_MATCH_TITLE]?.trim()) {
                try {
                    if (!new RegExp(this.properties[PROPERTY_MATCH_TITLE], "i").exec(group.title)) continue;
                } catch (e) {
                    console.error(e);
                    continue;
                }
            }
            const showAllGraphs = this.properties?.[PROPERTY_SHOW_ALL_GRAPHS];
            if (!showAllGraphs && group.graph !== app.canvas.getCurrentGraph()) continue;

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
            this.graph?.setDirtyCanvas(true, true);
        }, 16);
        return size;
    }

    async handleAction(action) {
        if (action === "Mute all" || action === "Bypass all") {
            const alwaysOne = this.properties?.[PROPERTY_RESTRICTION] === "always one";
            for (const [index, widget] of this.widgets.entries()) {
                widget?.doModeChange(alwaysOne && !index ? true : false, true);
            }
        } else if (action === "Enable all") {
            const onlyOne = this.properties?.[PROPERTY_RESTRICTION]?.includes(" one");
            for (const [index, widget] of this.widgets.entries()) {
                widget?.doModeChange(onlyOne && index > 0 ? false : true, true);
            }
        } else if (action === "Toggle all") {
            const onlyOne = this.properties?.[PROPERTY_RESTRICTION]?.includes(" one");
            let foundOne = false;
            for (const [index, widget] of this.widgets.entries()) {
                let newValue = onlyOne && foundOne ? false : !widget.value;
                foundOne = foundOne || newValue;
                widget?.doModeChange(newValue, true);
            }
            if (!foundOne && this.properties?.[PROPERTY_RESTRICTION] === "always one") {
                this.widgets[this.widgets.length - 1]?.doModeChange(true, true);
            }
        }
    }

    removeWidget(widget) {
        if (typeof widget === "number") {
            widget = this.widgets[widget];
        }
        if (!widget) return;
        const index = this.widgets.indexOf(widget);
        if (index > -1) {
            this.widgets.splice(index, 1);
        }
        widget.onRemove?.();
    }

    getHelp() {
        return `
      <p>The ${this.type?.replace("(rgthree)", "") || "Fast Groups Muter With Autoreset"} is an input-less node that automatically collects all groups in your current
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
              <code>${PROPERTY_SORT_CUSTOM_ALPHA}</code> - When the
              <code>${PROPERTY_SORT}</code> property is "custom alphabet" you can define the
              alphabet to use here.
            </p></li>
            <li><p>
              <code>${PROPERTY_RESTRICTION}</code> - Optionally, attempt to restrict the number of
              widgets that can be enabled to a maximum of one, or always one.
            </p></li>
            <li><p>
              <code>${PROPERTY_AUTO_RESET_GROUP_NAME}</code> - <strong>NEW:</strong> Comma-separated list of strings.
              If a group name contains any of these strings, its toggle will automatically reset to
              false (muted) after the workflow executes.
            </p></li>
          </ul>
        </li>
      </ul>`;
    }

    static setUp() {
        LiteGraph.registerNodeType(NODE_TYPE, FastGroupsMuterWithAutoreset);
        FastGroupsMuterWithAutoreset.category = FastGroupsMuterWithAutoreset._category;
    }
}

app.registerExtension({
    name: "Beyond_nodes.FastGroupsMuterWithAutoreset",
    registerCustomNodes() {
        FastGroupsMuterWithAutoreset.setUp();
    },
    loadedGraphNode(node) {
        if (node.type == FastGroupsMuterWithAutoreset.title) {
            node.tempSize = [...node.size];
        }
    },
});

export { FastGroupsMuterWithAutoreset };
