import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Undo2,
  Redo2,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookmarkPlus,
  FolderOpen,
  Trash2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import {
  getCandidateScene,
  saveCandidateScene,
  updateCandidateRenderMode,
  createJobSegment,
  getSegmentInfo,
  getSegmentProxyUrl,
  getScenePresets,
  createScenePreset,
  deleteScenePreset,
} from "../../api";
import { SceneGraph, ScenePreset } from "../../types";
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

  // Preset management state
  const [customPresets, setCustomPresets] = useState<ScenePreset[]>([]);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const notificationTimeoutRef = useRef<number | null>(null);

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    if (notificationTimeoutRef.current) {
      window.clearTimeout(notificationTimeoutRef.current);
    }
    setNotification({ message, type });
    notificationTimeoutRef.current = window.setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // Load presets list
  const loadPresets = async () => {
    try {
      const presets = await getScenePresets();
      setCustomPresets(presets);
    } catch (err) {
      console.warn("Gagal mengambil preset:", err);
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

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
      } catch (err: any) {
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
        if (isPresetModalOpen) setIsPresetModalOpen(false);
        else if (showPresetDropdown) setShowPresetDropdown(false);
        else onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, deleteLayer, selectedLayerId, onClose, isPresetModalOpen, showPresetDropdown]);

  // Save 1: Save current candidate clip
  const handleSaveCurrentClip = async (andExit = false) => {
    if (!scene) return;
    try {
      setSaveStatus("saving");
      await saveCandidateScene(candidateId, scene);
      await updateCandidateRenderMode(candidateId, "freeform");
      setSaveStatus("saved");
      onSaved?.(scene);
      showNotification("Kanvas klip berhasil disimpan!");
      if (andExit) {
        onClose();
      }
    } catch (err: any) {
      console.error("Save error:", err);
      setSaveStatus("error");
      showNotification(err.message || "Gagal menyimpan kanvas klip", "error");
    }
  };

  // Save 2: Save as reusable Preset
  const handleOpenPresetModal = () => {
    setPresetNameInput("");
    setIsPresetModalOpen(true);
  };

  const handleConfirmSavePreset = async () => {
    if (!scene) return;
    const name = presetNameInput.trim();
    if (!name) {
      showNotification("Masukkan nama preset terlebih dahulu", "error");
      return;
    }

    try {
      setIsSavingPreset(true);
      await createScenePreset(name, scene);
      await loadPresets();
      setIsSavingPreset(false);
      setIsPresetModalOpen(false);
      showNotification(`Preset "${name}" berhasil disimpan!`);
    } catch (err: any) {
      setIsSavingPreset(false);
      showNotification(err.message || "Gagal menyimpan preset", "error");
    }
  };

  // Apply a preset to current candidate scene
  const applyPresetScene = (presetScene: SceneGraph, presetTitle: string) => {
    if (!scene) return;
    const curSource = scene.sources[0] || {
      id: "src1",
      width: sourceDims.width,
      height: sourceDims.height,
      fps: 30,
      start: clipStart,
      end: clipEnd,
      padding_before: 1.0,
    };

    const adaptedLayers = (presetScene.layers || []).map((lyr, idx) => ({
      ...lyr,
      id: `cut_${Date.now().toString(36)}_${idx}`,
      source_id: curSource.id,
      shape: {
        ...lyr.shape,
        bbox: { ...lyr.shape.bbox },
        points: lyr.shape.points ? [...lyr.shape.points] : null,
      },
      transform: { ...lyr.transform, z: idx },
      style: { ...lyr.style },
    }));

    initScene({
      ...scene,
      background: { ...presetScene.background },
      layers: adaptedLayers,
    });
    showNotification(`Preset "${presetTitle}" diterapkan ke kanvas!`);
    setShowPresetDropdown(false);
  };

  const handleDeletePreset = async (presetId: string, presetName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Hapus preset "${presetName}"?`)) return;
    try {
      await deleteScenePreset(presetId);
      await loadPresets();
      showNotification(`Preset "${presetName}" dihapus`);
    } catch (err: any) {
      showNotification(err.message || "Gagal menghapus preset", "error");
    }
  };

  // Built-in presets
  const applyBuiltinBlur = () => {
    if (!scene) return;
    const curSource = scene.sources[0] || { id: "src1", width: sourceDims.width, height: sourceDims.height };
    const srcW = curSource.width || 1920;
    const srcH = curSource.height || 1080;

    initScene({
      ...scene,
      background: { type: "blur_source", blur_sigma: 25, color: "#0D0D0D" },
      layers: [
        {
          id: `cut_${Date.now().toString(36)}_main`,
          name: "Main Video",
          source_id: curSource.id,
          visible: true,
          locked: false,
          time_offset: 0,
          shape: {
            type: "rect",
            bbox: { x: 0, y: 0, w: srcW, h: srcH },
            points: null,
          },
          transform: {
            cx: 540,
            cy: 960,
            w: 1080,
            h: Math.round(1080 * (srcH / srcW)),
            rotation: 0,
            lock_aspect: true,
            z: 0,
          },
          style: {
            opacity: 1.0,
            corner_radius: 0,
            border_width: 0,
            border_color: "#00FFCC",
            shadow: { enabled: false, color: "#000000", alpha: 0.5, blur: 20, offset_x: 4, offset_y: 10 },
          },
        },
      ],
    });
    showNotification("Preset Blur (16:9) diterapkan!");
    setShowPresetDropdown(false);
  };

  const applyBuiltinStacked = () => {
    if (!scene) return;
    const curSource = scene.sources[0] || { id: "src1", width: sourceDims.width, height: sourceDims.height };
    const srcW = curSource.width || 1920;
    const srcH = curSource.height || 1080;

    initScene({
      ...scene,
      background: { type: "solid", blur_sigma: 0, color: "#0A0A0A" },
      layers: [
        {
          id: `cut_${Date.now().toString(36)}_game`,
          name: "Gameplay",
          source_id: curSource.id,
          visible: true,
          locked: false,
          time_offset: 0,
          shape: {
            type: "rect",
            bbox: { x: 0, y: 0, w: srcW, h: Math.round(srcH * 0.75) },
            points: null,
          },
          transform: {
            cx: 540,
            cy: 600,
            w: 1080,
            h: 1200,
            rotation: 0,
            lock_aspect: true,
            z: 0,
          },
          style: {
            opacity: 1.0,
            corner_radius: 0,
            border_width: 0,
            border_color: "#00FFCC",
            shadow: { enabled: false, color: "#000000", alpha: 0.5, blur: 20, offset_x: 4, offset_y: 10 },
          },
        },
        {
          id: `cut_${Date.now().toString(36)}_face`,
          name: "Facecam",
          source_id: curSource.id,
          visible: true,
          locked: false,
          time_offset: 0,
          shape: {
            type: "rect",
            bbox: {
              x: Math.round(srcW * 0.65),
              y: Math.round(srcH * 0.55),
              w: Math.round(srcW * 0.35),
              h: Math.round(srcH * 0.45),
            },
            points: null,
          },
          transform: {
            cx: 540,
            cy: 1560,
            w: 1080,
            h: 720,
            rotation: 0,
            lock_aspect: true,
            z: 1,
          },
          style: {
            opacity: 1.0,
            corner_radius: 0,
            border_width: 4,
            border_color: "#FF6A00",
            shadow: { enabled: true, color: "#000000", alpha: 0.6, blur: 25, offset_x: 0, offset_y: 8 },
          },
        },
      ],
    });
    showNotification("Preset Stacked (Split) diterapkan!");
    setShowPresetDropdown(false);
  };

  const primarySourceId = scene?.sources[0]?.id || "src1";

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col select-none text-white font-sans">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[70] transition-all">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-md shadow-2xl border text-xs font-mono font-medium ${
              notification.type === "success"
                ? "bg-[#102A20] border-[#00FFCC] text-[#00FFCC]"
                : "bg-[#2A1010] border-[#FF4444] text-[#FF4444]"
            }`}
          >
            {notification.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Studio Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#141414] border-b border-[#2A2A2A] h-12 relative z-30">
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
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181818] border border-[#262626] text-[11px] font-mono">
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
          {/* Preset Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowPresetDropdown(!showPresetDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#CCCCCC] hover:text-white bg-[#1E1E1E] hover:bg-[#2A2A2A] border border-[#333333] rounded transition"
            >
              <FolderOpen size={13} className="text-[#00FFCC]" />
              <span>Pakai Preset</span>
              <ChevronDown size={12} />
            </button>

            {showPresetDropdown && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#141414] border border-[#2E2E2E] rounded-md shadow-2xl py-1.5 z-50 text-xs font-mono">
                <div className="px-3 py-1 text-[10px] text-[#666666] uppercase tracking-wider">
                  Preset Bawaan
                </div>
                <button
                  onClick={applyBuiltinBlur}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#222222] text-[#DDDDDD] flex items-center justify-between"
                >
                  <span>Blur (16:9 Center)</span>
                  <span className="text-[10px] text-[#666666]">1 Layer</span>
                </button>
                <button
                  onClick={applyBuiltinStacked}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#222222] text-[#DDDDDD] flex items-center justify-between"
                >
                  <span>Stacked (Game + Cam)</span>
                  <span className="text-[10px] text-[#666666]">2 Layer</span>
                </button>

                <div className="border-t border-[#262626] my-1" />

                <div className="px-3 py-1 text-[10px] text-[#666666] uppercase tracking-wider flex items-center justify-between">
                  <span>Preset Kustom Kamu</span>
                  <span className="text-[10px] text-[#FF6A00]">{customPresets.length}</span>
                </div>

                {customPresets.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-[#666666] italic">
                    Belum ada preset kustom. Buat layout lalu klik "Simpan Preset".
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    {customPresets.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => applyPresetScene(p.scene, p.name)}
                        className="px-3 py-1.5 hover:bg-[#222222] text-[#DDDDDD] flex items-center justify-between cursor-pointer group"
                      >
                        <div className="truncate pr-2">
                          <span className="text-white font-medium">{p.name}</span>
                          <span className="text-[10px] text-[#666666] ml-2">
                            ({p.scene.layers?.length || 0} cut)
                          </span>
                        </div>
                        <button
                          onClick={(e) => handleDeletePreset(p.id, p.name, e)}
                          title="Hapus Preset"
                          className="opacity-0 group-hover:opacity-100 p-1 text-[#666666] hover:text-[#FF4444] transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save Option 2: Simpan Jadi Preset */}
          <button
            onClick={handleOpenPresetModal}
            title="Simpan susunan layout ini sebagai Preset baru agar bisa dipakai di klip lain"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#00FFCC] bg-[#00FFCC]/10 hover:bg-[#00FFCC]/20 border border-[#00FFCC]/30 rounded transition font-medium"
          >
            <BookmarkPlus size={13} />
            <span>Simpan Preset</span>
          </button>

          {/* Save Option 1: Simpan Klip Ini */}
          <button
            onClick={() => handleSaveCurrentClip(false)}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#222222] hover:bg-[#2E2E2E] text-white border border-[#444444] font-medium text-xs rounded transition"
          >
            <Save size={13} />
            <span>Simpan Klip</span>
          </button>

          {/* Selesai & Keluar */}
          <button
            onClick={() => handleSaveCurrentClip(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-[#FF6A00] hover:bg-[#E55F00] text-black font-semibold text-xs rounded shadow transition"
          >
            <CheckCircle2 size={13} />
            <span>Selesai & Keluar</span>
          </button>

          <button
            onClick={onClose}
            title="Tutup Studio"
            className="p-1.5 text-[#888888] hover:text-white hover:bg-[#222222] rounded ml-1 transition"
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
              sourceId={primarySourceId}
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
                    : "text-[#888888] hover:text-[#CCCCCC]"
                }`}
              >
                Layers ({scene?.layers.length || 0})
              </button>
              <button
                onClick={() => setActiveRightTab("styles")}
                className={`flex-1 py-2 text-xs font-mono font-medium transition ${
                  activeRightTab === "styles"
                    ? "text-[#FF6A00] border-b-2 border-[#FF6A00] bg-[#141414]"
                    : "text-[#888888] hover:text-[#CCCCCC]"
                }`}
              >
                Properti & Latar
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              {activeRightTab === "layers" ? <LayerStackPanel /> : <LayerStyleInspector />}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Simpan Sebagai Preset Baru */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-[#2E2E2E] rounded-lg shadow-2xl max-w-md w-full p-5 space-y-4 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <BookmarkPlus size={16} className="text-[#00FFCC]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Simpan Layout Jadi Preset
                </h3>
              </div>
              <button
                onClick={() => setIsPresetModalOpen(false)}
                className="text-[#888888] hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[#888888] leading-relaxed">
              Preset ini akan menyimpan posisi layer, crop shape, border, bayangan, dan latar kanvas saat ini agar dapat langsung diterapkan ke video atau klip lainnya.
            </p>

            <div>
              <label className="text-[11px] text-[#AAAAAA] uppercase block mb-1.5">
                Nama Preset
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Misal: Apex Vertical 2-Cam / Facecam Top"
                value={presetNameInput}
                onChange={(e) => setPresetNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmSavePreset();
                }}
                className="w-full bg-black border border-[#3A3A3A] focus:border-[#00FFCC] rounded px-3 py-2 text-white text-xs outline-none"
              />
            </div>

            <div className="text-[10px] text-[#666666]">
              Ringkasan: {scene?.layers.length || 0} layer potongan | Latar: {scene?.background.type || "blur_source"}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#262626]">
              <button
                onClick={() => setIsPresetModalOpen(false)}
                className="px-3 py-1.5 text-xs text-[#AAAAAA] hover:text-white bg-[#1E1E1E] hover:bg-[#2A2A2A] rounded transition"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmSavePreset}
                disabled={isSavingPreset || !presetNameInput.trim()}
                className="px-4 py-1.5 text-xs bg-[#00FFCC] hover:bg-[#00E5B8] disabled:opacity-40 text-black font-semibold rounded shadow flex items-center gap-1.5 transition"
              >
                {isSavingPreset ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>Simpan Preset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
