import React, { useState, useEffect, useRef } from "react";
import {
  EditorialSession,
  EditorialAsset,
  EditorialVersion,
  EditorialMessage,
  EditorialStatus,
} from "../../types";
import {
  createEditorialSession,
  getEditorialStatus,
  listEditorialAssets,
  listEditorialVersions,
  listEditorialMessages,
  restoreEditorialVersion,
  renderEditorialPreview,
  renderEditorialFinal,
  getEditorialPreviewVideoUrl,
  getEditorialFinalVideoUrl,
  sendEditorialMessage,
  runEditorialAutopilot,
  getEditorialCode,
  updateEditorialCode,
  submitEditorialScript,
  listStylePacks,
  applyStylePack,
  saveCustomStylePack,
} from "../../api";
import { AssetTray } from "./AssetTray";
import { VersionHistory } from "./VersionHistory";
import { EditorialChat } from "./EditorialChat";
import {
  ArrowLeft,
  Sparkles,
  Play,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  FolderOpen,
  History,
  Eye,
  RefreshCw,
  Code2,
  X,
  Save,
  Check,
  Palette,
  BookmarkPlus,
  FileText,
} from "lucide-react";

interface EditorialStudioProps {
  clipId: string;
  onBack: () => void;
}

export const EditorialStudio: React.FC<EditorialStudioProps> = ({
  clipId,
  onBack,
}) => {
  // Session State
  const [session, setSession] = useState<EditorialSession | null>(null);
  const [assets, setAssets] = useState<EditorialAsset[]>([]);
  const [versions, setVersions] = useState<EditorialVersion[]>([]);
  const [messages, setMessages] = useState<EditorialMessage[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Active Tab: "chat" | "assets" | "versions"
  const [activeTab, setActiveTab] = useState<"chat" | "assets" | "versions">("chat");

  // Video Player & Interaction State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [externalChatInput, setExternalChatInput] = useState<string>("");

  // Action states
  const [isPreviewRendering, setIsPreviewRendering] = useState(false);
  const [isFinalRendering, setIsFinalRendering] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isAutopilotWorking, setIsAutopilotWorking] = useState(false);
  const [reviewPlanToggle, setReviewPlanToggle] = useState(false);

  // Code Viewer / Drawer state
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [codeContent, setCodeContent] = useState<string>("");
  const [isSavingCode, setIsSavingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Notifications / Errors
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [previewVersionKey, setPreviewVersionKey] = useState<number>(Date.now());

  // P5 State: Style Packs
  const [stylePacks, setStylePacks] = useState<any[]>([]);
  const [selectedStylePack, setSelectedStylePack] = useState<string>("gaming_hype");
  const [isApplyingStyle, setIsApplyingStyle] = useState(false);
  const [isSaveStyleModalOpen, setIsSaveStyleModalOpen] = useState(false);
  const [customStyleName, setCustomStyleName] = useState("");
  const [customStyleDesc, setCustomStyleDesc] = useState("");
  const [isSavingCustomStyle, setIsSavingCustomStyle] = useState(false);

  // P5 State: Script Mode
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [scriptMode, setScriptMode] = useState<"strict" | "guide">("strict");
  const [isAligningScript, setIsAligningScript] = useState(false);
  const [beatSheetResult, setBeatSheetResult] = useState<any>(null);

  // 1. Initial Load: create or fetch active session
  const initSession = async () => {
    try {
      setIsLoadingSession(true);
      setGlobalError(null);
      const sess = await createEditorialSession(clipId);
      setSession(sess);

      const [astList, verList, msgList, packs] = await Promise.all([
        listEditorialAssets(sess.id),
        listEditorialVersions(sess.id),
        listEditorialMessages(sess.id),
        listStylePacks().catch(() => []),
      ]);
      setAssets(astList);
      setVersions(verList);
      setMessages(msgList);
      if (packs && packs.length > 0) {
        setStylePacks(packs);
      }
    } catch (err: any) {
      setGlobalError(err.message || "Gagal memuat sesi editorial studio.");
    } finally {
      setIsLoadingSession(false);
    }
  };

  useEffect(() => {
    initSession();
  }, [clipId]);

  // 2. Status Polling: keep session state in sync
  useEffect(() => {
    if (!session) return;

    let pollInterval: any = null;
    const isWorking =
      session.status === "RENDERING_FINAL" ||
      session.status === "AUDIO_NORMALIZING" ||
      session.status === "QA" ||
      session.status === "AGENT_WORKING";

    if (isWorking) {
      pollInterval = setInterval(async () => {
        try {
          const st: EditorialStatus = await getEditorialStatus(session.id);
          setSession((prev) => (prev ? { ...prev, status: st.status as any, current_version: st.current_version } : null));

          if (st.status === "DONE" || st.status === "FAILED") {
            setIsFinalRendering(false);
            setIsAutopilotWorking(false);
            clearInterval(pollInterval);
          }
        } catch (err) {
          // ignore transient poll error
        }
      }, 2500);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [session?.status, session?.id]);

  const refreshAssets = async () => {
    if (!session) return;
    try {
      const astList = await listEditorialAssets(session.id);
      setAssets(astList);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal memperbarui daftar aset.");
    }
  };

  const refreshVersions = async () => {
    if (!session) return;
    try {
      const verList = await listEditorialVersions(session.id);
      setVersions(verList);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal memperbarui riwayat versi.");
    }
  };

  const refreshMessages = async () => {
    if (!session) return;
    try {
      const msgList = await listEditorialMessages(session.id);
      setMessages(msgList);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal memperbarui riwayat pesan.");
    }
  };

  // 3. Action: Render Preview
  const handleRenderPreview = async () => {
    if (!session) return;
    try {
      setIsPreviewRendering(true);
      setGlobalError(null);
      await renderEditorialPreview(session.id);
      setPreviewVersionKey(Date.now());
      if (videoRef.current) {
        videoRef.current.load();
      }
    } catch (err: any) {
      setGlobalError(err.message || "Gagal merender video pratinjau editorial.");
    } finally {
      setIsPreviewRendering(false);
    }
  };

  // 4. Action: Render Final
  const handleRenderFinal = async () => {
    if (!session) return;
    try {
      setIsFinalRendering(true);
      setGlobalError(null);
      await renderEditorialFinal(session.id);
      setSession((prev) => (prev ? { ...prev, status: "RENDERING_FINAL" } : null));
    } catch (err: any) {
      setIsFinalRendering(false);
      setGlobalError(err.message || "Gagal memulai render final editorial.");
    }
  };

  // 5. Action: Restore Version
  const handleRestoreVersion = async (versionNum: number) => {
    if (!session) return;
    try {
      setIsRestoring(true);
      setGlobalError(null);
      await restoreEditorialVersion(session.id, versionNum);
      setSession((prev) => (prev ? { ...prev, current_version: versionNum, status: "PREVIEW_READY" } : null));
      await refreshVersions();
      setPreviewVersionKey(Date.now());
      if (videoRef.current) {
        videoRef.current.load();
      }
    } catch (err: any) {
      setGlobalError(err.message || `Gagal me-restore versi ${versionNum}.`);
    } finally {
      setIsRestoring(false);
    }
  };

  // 6. Action: Send Chat Message
  const handleSendMessage = async (text: string) => {
    if (!session) return;
    try {
      setIsSendingMessage(true);
      setGlobalError(null);
      await sendEditorialMessage(session.id, text, "chat");
      await refreshMessages();
    } catch (err: any) {
      setGlobalError(err.message || "Gagal mengirim pesan.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  // 7. Action: Run Autopilot
  const handleRunAutopilot = async () => {
    if (!session) return;
    try {
      setIsAutopilotWorking(true);
      setGlobalError(null);
      await runEditorialAutopilot(session.id);
      await Promise.all([
        refreshVersions(),
        refreshMessages(),
      ]);
      setSession((prev) => (prev ? { ...prev, status: "PREVIEW_READY" } : null));
      setPreviewVersionKey(Date.now());
      if (videoRef.current) {
        videoRef.current.load();
      }
    } catch (err: any) {
      setGlobalError(err.message || "Gagal menjalankan autopilot editorial.");
    } finally {
      setIsAutopilotWorking(false);
    }
  };

  // 8. Action: View Code
  const handleViewCode = async () => {
    if (!session) return;
    try {
      setCodeError(null);
      const res = await getEditorialCode(session.id);
      setCodeContent(res.code);
      setIsCodeModalOpen(true);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal membaca kode Composition.tsx.");
    }
  };

  // 9. Action: Save Edited Code
  const handleSaveCode = async () => {
    if (!session) return;
    try {
      setIsSavingCode(true);
      setCodeError(null);
      await updateEditorialCode(session.id, codeContent);
      setIsCodeModalOpen(false);
      await Promise.all([
        refreshVersions(),
        refreshMessages(),
      ]);
      setPreviewVersionKey(Date.now());
      if (videoRef.current) {
        videoRef.current.load();
      }
    } catch (err: any) {
      setCodeError(err.message || "Gagal menyimpan perubahan kode.");
    } finally {
      setIsSavingCode(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeContent);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // 10. Action: Apply Style Pack
  const handleApplyStyle = async (packName: string) => {
    if (!session) return;
    try {
      setIsApplyingStyle(true);
      setGlobalError(null);
      await applyStylePack(session.id, packName);
      setSelectedStylePack(packName);
      await Promise.all([refreshVersions(), refreshMessages()]);
      setPreviewVersionKey(Date.now());
      if (videoRef.current) {
        videoRef.current.load();
      }
    } catch (err: any) {
      setGlobalError(err.message || "Gagal menerapkan style pack.");
    } finally {
      setIsApplyingStyle(false);
    }
  };

  // 11. Action: Save Custom Style Pack
  const handleSaveStyle = async () => {
    if (!customStyleName.trim()) return;
    try {
      setIsSavingCustomStyle(true);
      setGlobalError(null);
      await saveCustomStylePack({
        name: customStyleName.toLowerCase().replace(/\s+/g, "_"),
        label: customStyleName,
        description: customStyleDesc,
        zoom_factor: 1.18,
        shake_intensity: 18.0,
      });
      const packs = await listStylePacks();
      setStylePacks(packs);
      setIsSaveStyleModalOpen(false);
      setCustomStyleName("");
      setCustomStyleDesc("");
    } catch (err: any) {
      setGlobalError(err.message || "Gagal menyimpan preset gaya.");
    } finally {
      setIsSavingCustomStyle(false);
    }
  };

  // 12. Action: Submit Editorial Script
  const handleSubmitScript = async () => {
    if (!session || !scriptText.trim()) return;
    try {
      setIsAligningScript(true);
      setGlobalError(null);
      const res = await submitEditorialScript(session.id, scriptText, scriptMode);
      setBeatSheetResult(res.beat_sheet);
      await Promise.all([refreshVersions(), refreshMessages()]);
      setPreviewVersionKey(Date.now());
      if (videoRef.current) {
        videoRef.current.load();
      }
    } catch (err: any) {
      setGlobalError(err.message || "Gagal menyelaraskan naskah script.");
    } finally {
      setIsAligningScript(false);
    }
  };

  const handleInsertTimestamp = () => {
    const cur = videoRef.current?.currentTime || 0;
    const m = Math.floor(cur / 60);
    const s = Math.floor(cur % 60);
    const ms = Math.floor((cur % 1) * 10);
    const timecode = `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}]`;
    setExternalChatInput(timecode);
    setActiveTab("chat");
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec)) return "00:00.0";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
  };

  if (isLoadingSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-300 gap-3">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <span className="text-sm font-semibold">Menyiapkan Editorial Studio...</span>
      </div>
    );
  }

  const previewUrl = session ? `${getEditorialPreviewVideoUrl(session.id)}?v=${previewVersionKey}` : "";
  const finalUrl = session ? getEditorialFinalVideoUrl(session.id) : "";
  const isDone = session?.status === "DONE";
  const isRendering =
    session?.status === "RENDERING_FINAL" ||
    session?.status === "AUDIO_NORMALIZING" ||
    session?.status === "QA";

  return (
    <div className="flex flex-col gap-4 text-slate-200 w-full max-w-7xl mx-auto pb-12">
      {/* Top Bar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Klip</span>
          </button>

          <div className="h-4 w-px bg-slate-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <h1 className="text-sm font-bold text-white tracking-wide">
              Editorial Studio
            </h1>
            <span className="text-xs font-mono text-slate-400">
              [{clipId.slice(0, 10)}]
            </span>
          </div>

          {session && (
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isDone
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                    : isRendering || isAutopilotWorking
                    ? "bg-amber-950 text-amber-300 border border-amber-700 animate-pulse"
                    : "bg-indigo-950 text-indigo-300 border border-indigo-700"
                }`}
              >
                {isAutopilotWorking ? "AUTOPILOT_RUNNING" : session.status}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                v{session.current_version}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Style Pack Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1">
            <Palette className="w-3.5 h-3.5 text-pink-400" />
            <select
              value={selectedStylePack}
              disabled={isApplyingStyle || isRendering || isAutopilotWorking}
              onChange={(e) => handleApplyStyle(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              {stylePacks.length > 0 ? (
                stylePacks.map((sp) => (
                  <option key={sp.name} value={sp.name} className="bg-slate-900 text-slate-200">
                    {sp.label || sp.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="gaming_hype" className="bg-slate-900 text-slate-200">Gaming Hype</option>
                  <option value="minimal_clean" className="bg-slate-900 text-slate-200">Minimal Clean</option>
                  <option value="hyper_meme" className="bg-slate-900 text-slate-200">Hyper Meme</option>
                </>
              )}
            </select>
          </div>

          {/* Simpan Gaya Ini */}
          <button
            onClick={() => setIsSaveStyleModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition border border-slate-700"
            title="Simpan preset gaya saat ini"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-pink-400" />
            <span className="hidden md:inline">Simpan Gaya</span>
          </button>

          <button
            onClick={handleViewCode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition border border-slate-700"
            title="Lihat atau edit source code Composition.tsx"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Lihat Kode</span>
          </button>

          <button
            onClick={handleRenderPreview}
            disabled={isPreviewRendering || isRendering || isAutopilotWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition border border-slate-700 disabled:opacity-50"
            title="Render ulang pratinjau video low-res"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPreviewRendering ? "animate-spin text-indigo-400" : ""}`} />
            <span>{isPreviewRendering ? "Merender..." : "Render Preview"}</span>
          </button>

          <button
            onClick={handleRenderFinal}
            disabled={isRendering || isFinalRendering || isAutopilotWorking}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50"
            title="Render komposisi Remotion final 1080x1920 + normalisasi EBU R128"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isRendering ? "animate-pulse" : ""}`} />
            <span>
              {isRendering
                ? `Proses Final (${session?.status})...`
                : "Render Final"}
            </span>
          </button>

          {isDone && (
            <a
              href={finalUrl}
              download={`${session?.id}_final.mp4`}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
              title="Unduh video hasil render final 1080x1920"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Final (.mp4)</span>
            </a>
          )}
        </div>
      </div>

      {/* Global Error Notice */}
      {globalError && (
        <div className="p-3 bg-red-950/70 border border-red-800 rounded-lg text-xs text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Terjadi Kesalahan: </span>
            {globalError}
          </div>
          <button
            onClick={() => setGlobalError(null)}
            className="text-red-400 hover:text-red-200 text-xs font-bold ml-2"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Final Done Success Card */}
      {isDone && (
        <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-lg flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold">Video Final Siap Diekspor! </span>
              Lolos QA: Resolusi 1080×1920, normalisasi audio EBU R128 (-16 LUFS, TP ≤ -1.5 dBFS).
            </div>
          </div>
          <a
            href={finalUrl}
            download={`${session?.id}_final.mp4`}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition"
          >
            Download Sekarang
          </a>
        </div>
      )}

      {/* Main Studio Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch lg:h-[760px]">
        {/* Left Column: 9:16 Preview Player & Controls (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between h-full bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between shrink-0 mb-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Pratinjau 9:16 (Preview)
              </span>
            </div>
            <button
              onClick={() => setShowSafeZone(!showSafeZone)}
              className={`text-[11px] px-2.5 py-1 rounded font-medium transition border ${
                showSafeZone
                  ? "bg-indigo-950 text-indigo-300 border-indigo-700"
                  : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
              }`}
            >
              {showSafeZone ? "Sembunyikan Safe Zone" : "Overlay Safe Zone"}
            </button>
          </div>

          {/* Video Canvas Container (9:16 Aspect Ratio) */}
          <div className="relative w-full flex-1 min-h-0 aspect-[9/16] max-h-[640px] mx-auto bg-black rounded-lg overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              playsInline
              onTimeUpdate={() => {
                if (videoRef.current) {
                  setCurrentTime(videoRef.current.currentTime);
                  setVideoDuration(videoRef.current.duration || 0);
                }
              }}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setVideoDuration(videoRef.current.duration || 0);
                }
              }}
              className="w-full h-full object-contain"
            />

            {/* Safe Zone Visual Overlay */}
            {showSafeZone && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
                <div className="h-[12%] bg-red-900/20 border-b border-dashed border-red-500/80 flex items-center justify-center text-[10px] text-red-300 font-mono">
                  Safe Header (12%)
                </div>
                <div className="flex-1 flex justify-between">
                  <div className="w-[6%] bg-red-900/20 border-r border-dashed border-red-500/80 flex items-center justify-center text-[9px] text-red-400 [writing-mode:vertical-lr]">
                    Left 6%
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="border border-emerald-500/50 rounded px-2 py-1 bg-black/40 text-[10px] text-emerald-300 font-mono">
                      Zona Aman Teks & Subtitle
                    </div>
                  </div>
                  <div className="w-[12%] bg-red-900/20 border-l border-dashed border-red-500/80 flex items-center justify-center text-[9px] text-red-400 [writing-mode:vertical-lr]">
                    UI Right (12%)
                  </div>
                </div>
                <div className="h-[20%] bg-red-900/20 border-t border-dashed border-red-500/80 flex items-center justify-center text-[10px] text-red-300 font-mono">
                  Safe Bottom Bar & Bio (20%)
                </div>
              </div>
            )}
          </div>

          {/* Time & Comment in Current Second Button */}
          <div className="flex items-center justify-between pt-2 shrink-0 border-t border-slate-800/60 mt-2">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {formatSeconds(currentTime)} / {formatSeconds(videoDuration)}
              </span>
            </div>

            <button
              onClick={handleInsertTimestamp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-300 rounded-lg text-xs font-semibold transition"
              title="Sisipkan detik saat ini ke input chat"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Komentar di detik ini [{formatSeconds(currentTime)}]</span>
            </button>
          </div>
        </div>

        {/* Right Column: Studio Panels & Chat (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3 h-full min-h-0">
          {/* Studio Navigation Tabs */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl shrink-0">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>AI Chat & Autopilot</span>
            </button>

            <button
              onClick={() => setActiveTab("assets")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
                activeTab === "assets"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Aset Tambahan ({assets.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("versions")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
                activeTab === "versions"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat Versi ({versions.length})</span>
            </button>
          </div>

          {/* Active Tab Content Area */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-md flex-1 min-h-0 flex flex-col overflow-hidden">
            {session && activeTab === "chat" && (
              <EditorialChat
                sessionId={session.id}
                messages={messages}
                assets={assets}
                isSending={isSendingMessage}
                isAutopilotWorking={isAutopilotWorking || session.status === "AGENT_WORKING"}
                onSendMessage={handleSendMessage}
                onRunAutopilot={handleRunAutopilot}
                onOpenAssetsTab={() => setActiveTab("assets")}
                onViewCode={handleViewCode}
                onOpenScriptModal={() => setIsScriptModalOpen(true)}
                reviewPlanToggle={reviewPlanToggle}
                onToggleReviewPlan={() => setReviewPlanToggle(!reviewPlanToggle)}
                externalInputText={externalChatInput}
                onClearExternalInput={() => setExternalChatInput("")}
              />
            )}

            {session && activeTab === "assets" && (
              <AssetTray
                sessionId={session.id}
                assets={assets}
                onAssetsChanged={refreshAssets}
                onMentionAsset={(label) => {
                  setExternalChatInput(`@${label}`);
                  setActiveTab("chat");
                }}
              />
            )}

            {session && activeTab === "versions" && (
              <VersionHistory
                sessionId={session.id}
                versions={versions}
                currentVersion={session.current_version}
                onRestoreVersion={handleRestoreVersion}
                isRestoring={isRestoring}
              />
            )}
          </div>
        </div>
      </div>

      {/* Code Drawer / Modal (PLAN.md P4 Task 4) */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Composition.tsx Source Code
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  (Remotion TSX Sandbox)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition flex items-center gap-1 font-mono"
                >
                  {codeCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
                  <span>{codeCopied ? "Tersalin!" : "Salin Kode"}</span>
                </button>
                <button
                  onClick={() => setIsCodeModalOpen(false)}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Error Message */}
            {codeError && (
              <div className="p-3 bg-red-950 border-b border-red-800 text-xs text-red-200">
                <span className="font-bold">Gagal Validasi Kode: </span>
                {codeError}
              </div>
            )}

            {/* Editor Textarea */}
            <div className="flex-1 p-3 bg-slate-950 font-mono text-xs overflow-hidden flex flex-col">
              <textarea
                value={codeContent}
                onChange={(e) => setCodeContent(e.target.value)}
                className="w-full h-full bg-slate-900 text-slate-200 p-3 rounded border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none font-mono text-[11px] leading-relaxed"
                rows={22}
                spellCheck={false}
              />
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
              <div className="text-slate-500 text-[11px]">
                Validasi Leak-Guard ketat aktif. Dilarang menggunakan env/eval/process.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCodeModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                >
                  Tutup
                </button>
                <button
                  onClick={handleSaveCode}
                  disabled={isSavingCode}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingCode ? "Memvalidasi..." : "Simpan & Render Ulang"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Script Mode Modal (PLAN.md P5 Task 2) */}
      {isScriptModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Kirim Naskah Script Editorial
                </h3>
              </div>
              <button
                onClick={() => setIsScriptModalOpen(false)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              <div className="flex items-center gap-4 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Mode Eksekusi:</span>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="script_mode"
                    value="strict"
                    checked={scriptMode === "strict"}
                    onChange={() => setScriptMode("strict")}
                    className="text-indigo-600 focus:ring-0"
                  />
                  <span>Ikuti Persis (Strict)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="script_mode"
                    value="guide"
                    checked={scriptMode === "guide"}
                    onChange={() => setScriptMode("guide")}
                    className="text-indigo-600 focus:ring-0"
                  />
                  <span>Jadikan Panduan (Guide)</span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">
                  Teks Naskah / Markdown (per baris atau paragraf):
                </label>
                <textarea
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="Ketik naskah atau copy paste teks skrip di sini..."
                  rows={8}
                  className="w-full bg-slate-950 text-slate-200 p-3 rounded-lg border border-slate-800 focus:outline-none focus:border-indigo-500 text-xs font-mono resize-none leading-relaxed"
                />
              </div>

              {beatSheetResult && (
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300">Hasil Penyelarasan (Beat Sheet):</span>
                    <span className="text-emerald-400 font-mono">
                      Rate: {Math.round(beatSheetResult.alignment_rate * 100)}% ({beatSheetResult.aligned_lines}/{beatSheetResult.total_lines} baris)
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
                    {beatSheetResult.beats?.map((b: any, idx: number) => (
                      <div
                        key={idx}
                        className={`text-[11px] p-1.5 rounded flex items-center justify-between font-mono ${
                          b.aligned
                            ? "bg-slate-900/80 text-slate-200 border border-slate-800"
                            : "bg-red-950/40 text-red-300 border border-red-900/60"
                        }`}
                      >
                        <span className="truncate max-w-[70%]">{b.line_text}</span>
                        <span>
                          {b.aligned ? `[${b.start_s.toFixed(1)}s - ${b.end_s.toFixed(1)}s]` : "⚠️ TIDAK TER-ALIGN"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                Penyelarasan otomatis menggunakan pencocokan urutan kata transkrip.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsScriptModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                >
                  Tutup
                </button>
                <button
                  onClick={handleSubmitScript}
                  disabled={isAligningScript || !scriptText.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-bold transition disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isAligningScript ? "Menyelaraskan..." : "Selaraskan & Terapkan"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Style Modal (PLAN.md P5 Task 5) */}
      {isSaveStyleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4 text-pink-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Simpan Gaya Ini Sebagai Preset
                </h3>
              </div>
              <button
                onClick={() => setIsSaveStyleModalOpen(false)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-400">Nama Preset Gaya:</label>
                <input
                  type="text"
                  value={customStyleName}
                  onChange={(e) => setCustomStyleName(e.target.value)}
                  placeholder="Contoh: Valorant Hype Clean"
                  className="bg-slate-950 text-slate-200 px-3 py-2 rounded-lg border border-slate-800 text-xs focus:outline-none focus:border-pink-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-400">Deskripsi Gaya:</label>
                <input
                  type="text"
                  value={customStyleDesc}
                  onChange={(e) => setCustomStyleDesc(e.target.value)}
                  placeholder="Contoh: Shake agresif dengan caption kuning tebal"
                  className="bg-slate-950 text-slate-200 px-3 py-2 rounded-lg border border-slate-800 text-xs focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsSaveStyleModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
              >
                Batal
              </button>
              <button
                onClick={handleSaveStyle}
                disabled={isSavingCustomStyle || !customStyleName.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded text-xs font-bold transition disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingCustomStyle ? "Menyimpan..." : "Simpan Preset"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
