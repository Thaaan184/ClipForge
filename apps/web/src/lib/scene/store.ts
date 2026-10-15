import { create } from "zustand";
import {
  BackgroundConfig,
  LayerConfig,
  SceneGraph,
  ShapeConfig,
} from "../../types";

export type ToolType = "select" | "rect" | "ellipse" | "lasso";

export interface DraftShape {
  type: "rect" | "ellipse" | "lasso";
  bbox: { x: number; y: number; w: number; h: number };
  points: [number, number][];
  isComplete: boolean;
}

interface SceneState {
  scene: SceneGraph | null;
  selectedLayerId: string | null;
  activeTool: ToolType;
  draftShape: DraftShape | null;
  editingLayerId: string | null; // When double clicking a layer to re-edit shape in source panel

  // History stack
  undoStack: string[];
  redoStack: string[];

  // Save state
  saveStatus: "idle" | "saving" | "saved" | "error";

  // Actions
  initScene: (initialScene: SceneGraph) => void;
  updateScene: (updater: (prev: SceneGraph) => SceneGraph) => void;
  setSelectedLayerId: (id: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setDraftShape: (draft: DraftShape | null) => void;
  setEditingLayerId: (id: string | null) => void;
  setSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void;

  // Layer CRUD
  addLayerFromDraft: (sourceId: string, name?: string) => void;
  updateLayerTransform: (id: string, transform: Partial<LayerConfig["transform"]>) => void;
  updateLayerStyle: (id: string, style: Partial<LayerConfig["style"]>) => void;
  updateLayerShape: (id: string, shape: ShapeConfig) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  reorderLayers: (orderedIds: string[]) => void;
  duplicateLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  setBackground: (bg: Partial<BackgroundConfig>) => void;

  // History
  undo: () => void;
  redo: () => void;
}

const MAX_HISTORY = 100;

export const useSceneStore = create<SceneState>((set, get) => ({
  scene: null,
  selectedLayerId: null,
  activeTool: "select",
  draftShape: null,
  editingLayerId: null,
  undoStack: [],
  redoStack: [],
  saveStatus: "idle",

  initScene: (initialScene) => {
    set({
      scene: initialScene,
      selectedLayerId: initialScene.layers.length > 0 ? initialScene.layers[0].id : null,
      undoStack: [],
      redoStack: [],
      draftShape: null,
      editingLayerId: null,
      saveStatus: "saved",
    });
  },

  updateScene: (updater) => {
    const cur = get().scene;
    if (!cur) return;
    const currentJson = JSON.stringify(cur);
    const next = updater(cur);
    set({
      scene: next,
      undoStack: [currentJson, ...get().undoStack.slice(0, MAX_HISTORY - 1)],
      redoStack: [],
      saveStatus: "idle",
    });
  },

  setSelectedLayerId: (id) => set({ selectedLayerId: id }),
  setActiveTool: (tool) => set({ activeTool: tool, draftShape: null }),
  setDraftShape: (draft) => set({ draftShape: draft }),
  setEditingLayerId: (id) => set({ editingLayerId: id, activeTool: id ? "select" : "select" }),
  setSaveStatus: (status) => set({ saveStatus: status }),

  addLayerFromDraft: (sourceId, name) => {
    const state = get();
    const draft = state.draftShape;
    const curScene = state.scene;
    if (!draft || !curScene || !draft.isComplete) return;

    const layerId = `cut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newZ = curScene.layers.length;

    // Default canvas placement: fit width to 1080 if possible, centered
    const aspect = draft.bbox.w / Math.max(1, draft.bbox.h);
    let targetW = Math.min(1000, Math.max(300, draft.bbox.w));
    let targetH = targetW / aspect;
    if (targetH > 1800) {
      targetH = 1800;
      targetW = targetH * aspect;
    }

    const newLayer: LayerConfig = {
      id: layerId,
      name: name || `Cut ${curScene.layers.length + 1}`,
      source_id: sourceId,
      visible: true,
      locked: false,
      time_offset: 0,
      shape: {
        type: draft.type,
        bbox: { ...draft.bbox },
        points: draft.points && draft.points.length >= 3 ? [...draft.points] : null,
      },
      transform: {
        cx: 540,
        cy: 960,
        w: Math.round(targetW),
        h: Math.round(targetH),
        rotation: 0,
        lock_aspect: true,
        z: newZ,
      },
      style: {
        opacity: 1.0,
        corner_radius: 0,
        border_width: 0,
        border_color: "#00FFCC",
        shadow: {
          enabled: false,
          color: "#000000",
          alpha: 0.5,
          blur: 20,
          offset_x: 4,
          offset_y: 10,
        },
      },
    };

    state.updateScene((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
    }));

    set({
      selectedLayerId: layerId,
      draftShape: null,
      activeTool: "select",
    });
  },

  updateLayerTransform: (id, transform) => {
    get().updateScene((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, transform: { ...l.transform, ...transform } } : l
      ),
    }));
  },

  updateLayerStyle: (id, style) => {
    get().updateScene((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, style: { ...l.style, ...style } } : l
      ),
    }));
  },

  updateLayerShape: (id, shape) => {
    get().updateScene((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, shape: { ...shape } } : l
      ),
    }));
  },

  toggleLayerVisibility: (id) => {
    get().updateScene((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    }));
  },

  toggleLayerLock: (id) => {
    get().updateScene((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, locked: !l.locked } : l
      ),
    }));
  },

  reorderLayers: (orderedIds) => {
    get().updateScene((prev) => {
      const layerMap = new Map(prev.layers.map((l) => [l.id, l]));
      const newLayers: LayerConfig[] = [];
      orderedIds.forEach((id, idx) => {
        const lyr = layerMap.get(id);
        if (lyr) {
          newLayers.push({
            ...lyr,
            transform: { ...lyr.transform, z: idx },
          });
        }
      });
      return { ...prev, layers: newLayers };
    });
  },

  duplicateLayer: (id) => {
    const cur = get().scene;
    if (!cur) return;
    const target = cur.layers.find((l) => l.id === id);
    if (!target || cur.layers.length >= 12) return;

    const dupId = `cut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const duplicated: LayerConfig = {
      ...target,
      id: dupId,
      name: `${target.name} Copy`,
      transform: {
        ...target.transform,
        cx: target.transform.cx + 20,
        cy: target.transform.cy + 20,
        z: cur.layers.length,
      },
    };

    get().updateScene((prev) => ({
      ...prev,
      layers: [...prev.layers, duplicated],
    }));
    set({ selectedLayerId: dupId });
  },

  deleteLayer: (id) => {
    get().updateScene((prev) => ({
      ...prev,
      layers: prev.layers
        .filter((l) => l.id !== id)
        .map((l, idx) => ({ ...l, transform: { ...l.transform, z: idx } })),
    }));
    set({ selectedLayerId: null });
  },

  setBackground: (bg) => {
    get().updateScene((prev) => ({
      ...prev,
      background: { ...prev.background, ...bg },
    }));
  },

  undo: () => {
    const { undoStack, redoStack, scene } = get();
    if (undoStack.length === 0 || !scene) return;
    const prevJson = undoStack[0];
    const newUndo = undoStack.slice(1);
    const currentJson = JSON.stringify(scene);

    try {
      const restored = JSON.parse(prevJson) as SceneGraph;
      set({
        scene: restored,
        undoStack: newUndo,
        redoStack: [currentJson, ...redoStack],
        saveStatus: "idle",
      });
    } catch {
      // ignore corrupt snapshot
    }
  },

  redo: () => {
    const { undoStack, redoStack, scene } = get();
    if (redoStack.length === 0 || !scene) return;
    const nextJson = redoStack[0];
    const newRedo = redoStack.slice(1);
    const currentJson = JSON.stringify(scene);

    try {
      const restored = JSON.parse(nextJson) as SceneGraph;
      set({
        scene: restored,
        undoStack: [currentJson, ...undoStack],
        redoStack: newRedo,
        saveStatus: "idle",
      });
    } catch {
      // ignore corrupt snapshot
    }
  },
}));
