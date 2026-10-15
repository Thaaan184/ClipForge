import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Undo2,
  Redo2,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  getCandidateScene,
  saveCandidateScene,
  updateCandidateRenderMode,
  createJobSegment,
  getSegmentInfo,
  getSegmentProxyUrl,
} from "../../api";
import { SceneGraph } from "../../types";
import { useSceneStore } from "../../lib/scene/store";
import { SourcePanel } from "./SourcePanel";
import { CanvasViewport } from "./CanvasViewport";
import { LayerStackPanel } from "./LayerStackPanel";
import { LayerStyleInspector } from "./LayerStyleInspector";

interface FreeformStudioProps {
  jobId: string;
  candidateId: string;
  candidateTitle: string;
  clipStart: number;
  clipEnd: number;
  onClose: () => void;
  onSaved?: (scene: SceneGraph) => void;
}

export const FreeformStudio: React.FC<FreeformStudioProps> = ({
  jobId,
  candidateId,
  candidateTitle,
  clipStart,
  clipEnd,
  onClose,
  onSaved,
}) => {
  const {
    scene,
    initScene,
    undo,
    redo,
    undoStack,
    redoStack,
    saveStatus,
    setSaveStatus,
    deleteLayer,
    selectedLayerId,
  } = useSceneStore();

  const [loading, setLoading] = useState(true);
  const [segmentReady, setSegmentReady] = useState(false);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [sourceDims, setSourceDims] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });
  const [currentTime, setCurrentTime] = useState(clipStart);
  const [activeRightTab, setActiveRightTab] = useState<"layers" | "styles">("layers");

  const videoRef = useRef<HTMLVideoElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  // 1. Initialize segment and scene
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);

        // Fetch scene graph for candidate
        const sceneData = await getCandidateScene(candidateId);
        if (cancelled) return;
        initScene(sceneData);

        // Create or get segment
        const segRes = await createJobSegment(jobId, clipStart, clipEnd);
        if (cancelled) return;
        setSegmentId(segRes.segment_id);

        // Poll segment readiness
        let attempts = 0;
        while (attempts < 20 && !cancelled) {
          const info = await getSegmentInfo(segRes.segment_id);
          if (info.status === "ready") {
            setSourceDims({
              width: info.full_width || 1920,
              height: info.full_height || 1080,
            });
            setSegmentReady(true);
            break;
          } else if (info.status === "error") {
            throw new Error(info.error || "Gagal memproses segmen video");
          }
          await new Promise((r) => setTimeout(r, 1000));
          attempts++;
        }

        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error("Failed to load studio:", err);
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [jobId, candidateId, clipStart, clipEnd, initScene]);

  // 2. Debounced Autosave (1.5s after modification)
  useEffect(() => {
    if (!scene || loading) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        setSaveStatus("saving");
        await saveCandidateScene(candidateId, scene);
        await updateCandidateRenderMode(candidateId, "freeform");
        setSaveStatus("saved");
        onSaved?.(scene);
      } catch (err) {
        console.error("Autosave error:", err);
        setSaveStatus("error");
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [scene, candidateId, loading, setSaveStatus, onSaved]);

  // 3. Global hotkeys (Undo, Redo, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedLayerId) {
          deleteLayer(selectedLayerId);
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, deleteLayer, selectedLayerId, onClose]);

  const handleManualSave = async () => {
    if (!scene) return;
    try {
      setSaveStatus("saving");
      await saveCandidateScene(candidateId, scene);
      await updateCandidateRenderMode(candidateId, "freeform");
      setSaveStatus("saved");
      onSaved?.(scene);
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("error");
    }
  };

  const handleResetToPreset = async () => {
    if (!confirm("Reset kanvas ke layout default (preset blur)? Semua layer potongan kustom akan direset.")) {
      return;
    }
    await updateCandidateRenderMode(candidateId, "preset");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col select-none text-white">
      {/* Studio Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#141414] border-b border-[#2A2A2A] h-12">
        {/* Left: Title & Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF6A00] animate-pulse" />
            <span className="font-mono text-sm font-bold tracking-wider text-white uppercase">
              STUDIO KANVAS BEBAS
            </span>
          </div>
          <span className="text-[#444444]">|</span>
          <span className="text-xs text-[#888888] font-mono truncate max-w-sm" title={candidateTitle}>
            {candidateTitle}
          </span>
          <span className="text-[#444444]">|</span>
          <span className="text-[11px] font-mono text-[#666666]">
            {clipStart.toFixed(1)}s - {clipEnd.toFixed(1)}s ({(clipEnd - clipStart).toFixed(1)}s)
          </span>
        </div>

        {/* Center: Save Status & History Controls */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center bg-[#1E1E1E] rounded border border-[#333333] p-0.5">
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              className="p-1 text-[#888888] hover:text-white disabled:opacity-30 rounded"
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              className="p-1 text-[#888888] hover:text-white disabled:opacity-30 rounded"
            >
              <Redo2 size={14} />
            </button>
          </div>

          {/* Autosave status indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#181818] border border-[#262626] text-[11px] font-mono">
            {saveStatus === "saving" && (
              <>
                <Loader2 size={12} className="animate-spin text-[#FF6A00]" />
                <span className="text-[#AAAAAA]">Menyimpan...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 size={12} className="text-[#00FFCC]" />
                <span className="text-[#888888]">Tersimpan</span>
              </>
            )}
            {saveStatus === "idle" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#888888]" />
                <span className="text-[#666666]">Draf</span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <AlertCircle size={12} className="text-[#FF4444]" />
                <span className="text-[#FF4444]">Gagal Simpan</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetToPreset}
            title="Reset ke preset reframe standar"
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-[#888888] hover:text-white border border-[#333333] rounded hover:bg-[#222222]"
          >
            <RotateCcw size={12} /> Reset Preset
          </button>

          <button
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#FF6A00] hover:bg-[#E55F00] text-black font-semibold text-xs rounded shadow"
          >
            <Save size={13} /> Selesai & Simpan
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-[#888888] hover:text-white hover:bg-[#222222] rounded ml-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="animate-spin text-[#FF6A00]" />
          <span className="text-xs font-mono text-[#888888]">
            Menyiapkan video segmen proxy 720p...
          </span>
        </div>
      ) : !segmentReady || !segmentId ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <AlertCircle size={32} className="text-[#FF4444]" />
          <span className="text-sm font-semibold text-white">Gagal Memuat Segmen Video</span>
          <span className="text-xs text-[#888888]">
            Segmen proxy tidak dapat diakses. Pastikan video sumber tersedia.
          </span>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-1.5 bg-[#222222] hover:bg-[#333333] rounded text-xs"
          >
            Kembali
          </button>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Source Video & Shape Drawing */}
          <div className="w-[45%] h-full">
            <SourcePanel
              proxyUrl={getSegmentProxyUrl(segmentId)}
              sourceWidth={sourceDims.width}
              sourceHeight={sourceDims.height}
              sourceId="source_main"
              clipStart={clipStart}
              clipEnd={clipEnd}
              currentTime={currentTime}
              onTimeUpdate={setCurrentTime}
              videoRef={videoRef}
            />
          </div>

          {/* Center Panel: 9:16 Canvas Viewport */}
          <div className="flex-1 h-full">
            <CanvasViewport
              videoRef={videoRef}
              sourceWidth={sourceDims.width}
              sourceHeight={sourceDims.height}
            />
          </div>

          {/* Right Panel: Tabbed Inspector (Layers & Styles) */}
          <div className="w-72 h-full flex flex-col border-l border-[#2A2A2A]">
            <div className="flex border-b border-[#2A2A2A] bg-[#0A0A0A]">
              <button
                onClick={() => setActiveRightTab("layers")}
                className={`flex-1 py-2 text-xs font-mono font-medium transition ${
                  activeRightTab === "layers"
                    ? "text-[#FF6A00] border-b-2 border-[#FF6A00] bg-[#141414]"
                    : "text-[#888888] hover:text-white"
                }`}
              >
                LAYERS ({scene?.layers.length || 0})
              </button>
              <button
                onClick={() => setActiveRightTab("styles")}
                className={`flex-1 py-2 text-xs font-mono font-medium transition ${
                  activeRightTab === "styles"
                    ? "text-[#FF6A00] border-b-2 border-[#FF6A00] bg-[#141414]"
                    : "text-[#888888] hover:text-white"
                }`}
              >
                PROPERTIES
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              {activeRightTab === "layers" ? <LayerStackPanel /> : <LayerStyleInspector />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
