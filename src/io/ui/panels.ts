// @ts-nocheck

export type DockSide = "float" | "left" | "right";

const PANEL_STORAGE_KEY = "aurora:ui:panels";
const readPanelsState = (): Record<string, any> => {
  try {
    const raw = window.localStorage.getItem(PANEL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, any>) : {};
  } catch {
    return {};
  }
};
const writePanelsState = (data: Record<string, any>) => {
  try {
    window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(data));
  } catch {}
};

let zCounter = 200;

export interface PanelHandle {
  id: string;
  wrapper: HTMLDivElement;
  header: HTMLDivElement;
  content: HTMLDivElement;
  body: HTMLDivElement;
  setCollapsed(next: boolean): void;
  toggleCollapsed(): void;
  dock(next: DockSide): void;
  setPosition(top: number, side: number): void;
  setWidth(width: number): void;
}

export interface PanelOptions {
  id: string;
  title: string;
  position: { top: number; right?: number; left?: number };
  width?: number;
}

export const createPanel = (options: PanelOptions): PanelHandle => {
  const { id, title } = options;
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.top = `${options.position.top}px`;
  if (options.position.left !== undefined) wrapper.style.left = `${options.position.left}px`;
  if (options.position.right !== undefined) wrapper.style.right = `${options.position.right}px`;
  wrapper.style.width = `${options.width ?? 320}px`;
  wrapper.style.background =
    "linear-gradient(180deg, rgba(20,22,28,0.55), rgba(16,18,24,0.42))";
  wrapper.style.backdropFilter = "blur(18px) saturate(120%)";
  wrapper.style.border = "1px solid rgba(255, 255, 255, 0.14)";
  wrapper.style.borderRadius = "14px";
  wrapper.style.boxShadow =
    "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.06)";
  wrapper.style.userSelect = "none";
  wrapper.style.zIndex = "22";
  wrapper.style.transition = "box-shadow 180ms ease, border-color 180ms ease, background 180ms ease";

  wrapper.addEventListener("mouseenter", () => {
    wrapper.style.boxShadow =
      "0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 20px rgba(120,180,255,0.08)";
  });
  wrapper.addEventListener("mouseleave", () => {
    wrapper.style.boxShadow =
      "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.06)";
  });

  const accent = document.createElement("div");
  accent.style.position = "absolute";
  accent.style.top = "0";
  accent.style.left = "12px";
  accent.style.right = "12px";
  accent.style.height = "2px";
  accent.style.borderRadius = "2px";
  accent.style.background =
    "linear-gradient(90deg, rgba(120,180,255,0.35), rgba(255,140,230,0.25), rgba(255,210,150,0.3))";
  wrapper.appendChild(accent);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.padding = "10px 12px";
  header.style.cursor = "grab";
  header.style.fontSize = "11px";
  header.style.letterSpacing = "0.06em";
  header.style.opacity = "0.85";
  header.textContent = title.toUpperCase();

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "8px";
  const btn = (label: string, title: string) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.title = title;
    b.style.background = "rgba(255,255,255,0.06)";
    b.style.border = "1px solid rgba(255,255,255,0.14)";
    b.style.borderRadius = "8px";
    b.style.color = "inherit";
    b.style.fontSize = "12px";
    b.style.width = "24px";
    b.style.height = "22px";
    b.style.cursor = "pointer";
    return b;
  };
  const dockBtn = btn("⇆", "Dock left/right/floating");
  const collapseBtn = btn("−", "Collapse");
  controls.appendChild(dockBtn);
  controls.appendChild(collapseBtn);
  header.appendChild(controls);

  const content = document.createElement("div");
  content.style.padding = "10px";
  content.style.overflow = "hidden";
  content.style.transition = "max-height 200ms ease, opacity 160ms ease";
  content.style.opacity = "1";
  const body = document.createElement("div");
  content.appendChild(body);

  wrapper.appendChild(header);
  wrapper.appendChild(content);
  document.body.appendChild(wrapper);

  // State & persistence
  let collapsed = false;
  let dock: DockSide = options.position.left !== undefined ? "left" : "right";
  const all = readPanelsState();
  const saved = all[id];
  if (saved) {
    if (typeof saved.top === "number") wrapper.style.top = `${saved.top}px`;
    if (typeof saved.left === "number") wrapper.style.left = `${saved.left}px`;
    if (typeof saved.right === "number") wrapper.style.right = `${saved.right}px`;
    if (typeof saved.width === "number") wrapper.style.width = `${saved.width}px`;
    if (typeof saved.collapsed === "boolean") collapsed = saved.collapsed;
    if (saved.dock) dock = saved.dock;
  }
  const writeSelf = (more: Record<string, unknown> = {}) => {
    const s = readPanelsState();
    s[id] = {
      ...(s[id] || {}),
      top: parseInt(wrapper.style.top, 10),
      left: wrapper.style.left ? parseInt(wrapper.style.left, 10) : undefined,
      right: wrapper.style.right ? parseInt(wrapper.style.right, 10) : undefined,
      width: parseInt(wrapper.style.width, 10),
      collapsed,
      dock,
      ...more,
    };
    writePanelsState(s);
  };

  const refreshContentHeight = () => {
    const h = body.scrollHeight;
    content.style.maxHeight = collapsed ? "0px" : `${h}px`;
    content.style.opacity = collapsed ? "0" : "1";
  };
  requestAnimationFrame(refreshContentHeight);

  // Actions
  const setCollapsed = (next: boolean) => {
    collapsed = !!next;
    collapseBtn.textContent = collapsed ? "+" : "−";
    refreshContentHeight();
    writeSelf({ collapsed });
  };
  const toggleCollapsed = () => setCollapsed(!collapsed);
  collapseBtn.addEventListener("click", toggleCollapsed);
  header.addEventListener("dblclick", toggleCollapsed);

  const applyDock = (next: DockSide) => {
    dock = next;
    if (dock === "left") {
      wrapper.style.left = wrapper.style.left || "16px";
      wrapper.style.right = "";
    } else if (dock === "right") {
      wrapper.style.right = wrapper.style.right || "16px";
      wrapper.style.left = "";
    }
    writeSelf({ dock });
  };
  applyDock(dock);
  dockBtn.addEventListener("click", () => {
    applyDock(dock === "right" ? "left" : dock === "left" ? "float" : "right");
  });

  // Dragging
  let dragStart: { x: number; y: number; top: number; side: number } | null = null;
  const onPointerDown = (e: PointerEvent) => {
    const side = dock === "left" ? parseInt(wrapper.style.left || "0", 10) : parseInt(wrapper.style.right || "0", 10);
    dragStart = { x: e.clientX, y: e.clientY, top: wrapper.offsetTop, side };
    header.setPointerCapture(e.pointerId);
    header.style.cursor = "grabbing";
    wrapper.style.zIndex = String(++zCounter);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    wrapper.style.top = `${dragStart.top + dy}px`;
    if (dock === "left") {
      wrapper.style.left = `${Math.max(0, dragStart.side + dx)}px`;
    } else {
      wrapper.style.right = `${Math.max(0, dragStart.side - dx)}px`;
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    dragStart = null;
    header.releasePointerCapture(e.pointerId);
    header.style.cursor = "grab";
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = wrapper.getBoundingClientRect();
    const minTop = 8;
    const maxTop = Math.max(minTop, vh - Math.min(vh * 0.8, rect.height) - 8);
    const currentTop = wrapper.offsetTop;
    const clampedTop = Math.max(minTop, Math.min(currentTop, maxTop));
    wrapper.style.top = `${clampedTop}px`;
    if (dock === "left") {
      const currentLeft = parseInt(wrapper.style.left || "0", 10);
      const maxLeft = Math.max(8, vw - Math.min(vw * 0.85, rect.width) - 8);
      const clampedLeft = Math.max(8, Math.min(currentLeft, maxLeft));
      wrapper.style.left = `${clampedLeft}px`;
    } else {
      const currentRight = parseInt(wrapper.style.right || "0", 10);
      const maxRight = Math.max(8, vw - Math.min(vw * 0.85, rect.width) - 8);
      const clampedRight = Math.max(8, Math.min(currentRight, maxRight));
      wrapper.style.right = `${clampedRight}px`;
    }
    writeSelf();
  };
  header.addEventListener("pointerdown", onPointerDown);
  header.addEventListener("pointermove", onPointerMove);
  header.addEventListener("pointerup", onPointerUp);

  // Resizer
  const resizer = document.createElement("div");
  resizer.style.position = "absolute";
  resizer.style.right = "6px";
  resizer.style.bottom = "6px";
  resizer.style.width = "14px";
  resizer.style.height = "14px";
  resizer.style.borderRight = "2px solid rgba(255,255,255,0.2)";
  resizer.style.borderBottom = "2px solid rgba(255,255,255,0.2)";
  resizer.style.opacity = "0.6";
  resizer.style.cursor = "nwse-resize";
  wrapper.appendChild(resizer);
  let resizeStart: { x: number; width: number } | null = null;
  const onResizeDown = (e: PointerEvent) => {
    resizeStart = { x: e.clientX, width: wrapper.offsetWidth };
    resizer.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: PointerEvent) => {
    if (!resizeStart) return;
    const dx = e.clientX - resizeStart.x;
    const nextW = Math.max(260, Math.min(520, resizeStart.width - dx));
    wrapper.style.width = `${nextW}px`;
    requestAnimationFrame(refreshContentHeight);
  };
  const onResizeUp = (e: PointerEvent) => {
    resizeStart = null;
    resizer.releasePointerCapture(e.pointerId);
    writeSelf();
  };
  resizer.addEventListener("pointerdown", onResizeDown);
  resizer.addEventListener("pointermove", onResizeMove);
  resizer.addEventListener("pointerup", onResizeUp);

  const api: PanelHandle = {
    id,
    wrapper,
    header,
    content,
    body,
    setCollapsed,
    toggleCollapsed,
    dock: applyDock,
    setPosition: (top: number, side: number) => {
      wrapper.style.top = `${top}px`;
      if (dock === "left") wrapper.style.left = `${side}px`;
      else wrapper.style.right = `${side}px`;
      writeSelf();
    },
    setWidth: (width: number) => {
      wrapper.style.width = `${width}px`;
      requestAnimationFrame(refreshContentHeight);
      writeSelf();
    },
  };

  return api;
};


