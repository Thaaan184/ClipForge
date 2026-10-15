import { describe, it, expect, beforeEach } from "vitest";
import { useSceneStore } from "./store";
import { SceneGraph } from "../../types";

const mockScene: SceneGraph = {
  version: "1.1",
  canvas: { width: 1080, height: 1920, fps: 30 },
  background: { type: "blur_source", blur_sigma: 40, color: "#000000" },
  sources: [
    {
      id: "source_main",
      width: 1920,
      height: 1080,
      fps: 30,
      start: 10,
      end: 40,
      padding_before: 1,
    },
  ],
  layers: [],
  subtitles: { enabled: true, preset: "classic_white", position: "bottom" },
};

describe("SceneStore Zustand", () => {
  beforeEach(() => {
    useSceneStore.getState().initScene(JSON.parse(JSON.stringify(mockScene)));
  });

  it("initializes scene properly", () => {
    const state = useSceneStore.getState();
    expect(state.scene?.version).toBe("1.1");
    expect(state.scene?.layers.length).toBe(0);
    expect(state.undoStack.length).toBe(0);
  });

  it("adds layer from completed draft and sets selection", () => {
    useSceneStore.getState().setDraftShape({
      type: "rect",
      bbox: { x: 100, y: 100, w: 400, h: 400 },
      points: [],
      isComplete: true,
    });

    useSceneStore.getState().addLayerFromDraft("source_main", "Layer 1");
    const state = useSceneStore.getState();
    expect(state.scene?.layers.length).toBe(1);
    expect(state.scene?.layers[0].name).toBe("Layer 1");
    expect(state.selectedLayerId).toBe(state.scene?.layers[0].id);
    expect(state.draftShape).toBeNull();
    // History recorded
    expect(state.undoStack.length).toBe(1);
  });

  it("updates layer transform and supports undo/redo", () => {
    useSceneStore.getState().setDraftShape({
      type: "rect",
      bbox: { x: 50, y: 50, w: 200, h: 200 },
      points: [],
      isComplete: true,
    });
    useSceneStore.getState().addLayerFromDraft("source_main", "Layer 1");
    const layerId = useSceneStore.getState().scene!.layers[0].id;

    useSceneStore.getState().updateLayerTransform(layerId, { rotation: 45 });
    expect(useSceneStore.getState().scene!.layers[0].transform.rotation).toBe(45);

    // Undo rotation
    useSceneStore.getState().undo();
    expect(useSceneStore.getState().scene!.layers[0].transform.rotation).toBe(0);

    // Redo rotation
    useSceneStore.getState().redo();
    expect(useSceneStore.getState().scene!.layers[0].transform.rotation).toBe(45);
  });

  it("toggles layer lock and visibility", () => {
    useSceneStore.getState().setDraftShape({
      type: "rect",
      bbox: { x: 50, y: 50, w: 200, h: 200 },
      points: [],
      isComplete: true,
    });
    useSceneStore.getState().addLayerFromDraft("source_main", "Layer 1");
    const layerId = useSceneStore.getState().scene!.layers[0].id;

    useSceneStore.getState().toggleLayerVisibility(layerId);
    expect(useSceneStore.getState().scene!.layers[0].visible).toBe(false);

    useSceneStore.getState().toggleLayerLock(layerId);
    expect(useSceneStore.getState().scene!.layers[0].locked).toBe(true);
  });

  it("duplicates and deletes layer", () => {
    useSceneStore.getState().setDraftShape({
      type: "rect",
      bbox: { x: 50, y: 50, w: 200, h: 200 },
      points: [],
      isComplete: true,
    });
    useSceneStore.getState().addLayerFromDraft("source_main", "Layer 1");
    const layerId = useSceneStore.getState().scene!.layers[0].id;

    useSceneStore.getState().duplicateLayer(layerId);
    expect(useSceneStore.getState().scene!.layers.length).toBe(2);
    expect(useSceneStore.getState().scene!.layers[1].name).toBe("Layer 1 Copy");

    useSceneStore.getState().deleteLayer(layerId);
    expect(useSceneStore.getState().scene!.layers.length).toBe(1);
  });
});
