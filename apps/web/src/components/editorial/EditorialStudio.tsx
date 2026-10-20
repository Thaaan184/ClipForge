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
  onNavigateToResults?: () => void;
}

export const EditorialStudio: React.FC<EditorialStudioProps> = ({
  clipId,
  onBack,
  onNavigateToResults,
}) => {
  // Session State
  const [session, setSession] = useState<EditorialSession | null>(null);
  const [assets, setAssets] = useState<EditorialAsset[]>([]);
  const [versions, setVersions] = useState<EditorialVersion[]>([]);
  const [messages, setMessages] = useState<EditorialMessage[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Active Tab: "chat" | "assets" | "versions"
  const [activeTab, setActiveTab] = useState<"chat" | "assets" | "versions">("chat");

  // Mobile View Switcher: "player" | "chat" | "assets" | "versions"
  const [mobileView, setMobileView] = useState<"player" | "chat" | "assets" | "versions">("player");

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

  // Final Render Modal State
  const [finalRenderModal, setFinalRenderModal] = useState<{
    isOpen: boolean;
    status: "rendering" | "success" | "error";
    progress: number;
    message: string;
    error?: string;
  }>({
    isOpen: false,
    status: "rendering",
    progress: 10,
    message: "Mengirim instruksi render final...",
  });

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

          if (st.status === "RENDERING_FINAL") {
            setFinalRenderModal((prev) => ({
              ...prev,
              isOpen: true,
              status: "rendering",
              progress: Math.min(Math.max(prev.progress + 4, 30), 75),
              message: "Merender grafis video final 1080x1920 (30fps)...",
            }));
          } else if (st.status === "AUDIO_NORMALIZING") {
            setFinalRenderModal((prev) => ({
              ...prev,
              isOpen: true,
              status: "rendering",
              progress: 85,
              message: "Normalisasi audio EBU R128 (-16 LUFS)...",
            }));
          } else if (st.status === "QA") {
            setFinalRenderModal((prev) => ({
              ...prev,
              isOpen: true,
              status: "rendering",
              progress: 92,
              message: "Menjalankan Extended QA check (blackdetect & frozen frames)...",
            }));
          } else if (st.status === "DONE") {
            setIsFinalRendering(false);
            setIsAutopilotWorking(false);
            setFinalRenderModal({
              isOpen: true,
              status: "success",
              progress: 100,
              message: "Render final berhasil! Klip telah didaftarkan ke Hasil Klip.",
            });
            clearInterval(pollInterval);
          } else if (st.status === "FAILED") {
            setIsFinalRendering(false);
            setIsAutopilotWorking(false);
            setFinalRenderModal({
              isOpen: true,
              status: "error",
              progress: 0,
              message: "Render final gagal",
              error: st.error_message || "Proses render terhenti",
            });
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
      setFinalRenderModal({
        isOpen: true,
        status: "rendering",
        progress: 15,
        message: "Menyiapkan workspace & bundler Remotion...",
      });
      await renderEditorialFinal(session.id);
      setSession((prev) => (prev ? { ...prev, status: "RENDERING_FINAL" } : null));
    } catch (err: any) {
      setIsFinalRendering(false);
      setFinalRenderModal({
        isOpen: true,
        status: "error",
        progress: 0,
        message: "Gagal memulai render final editorial",
        error: err.message || "Server tidak merespons",
      });
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
    // Optimistic UI update: tampilkan pesan user langsung seketika
    const optimisticId = `temp_${Date.now()}`;
    const optimisticMsg: EditorialMessage = {
      id: optimisticId,
      session_id: session.id,
      sender: "user",
      text: text,
      mode: "chat",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      setIsSendingMessage(true);
      setGlobalError(null);
      const res = await sendEditorialMessage(session.id, text, "chat");
      await Promise.all([
        refreshMessages(),
        refreshVersions(),
      ]);
      if (res && res.text && (res.text.includes("Komposisi v") || res.text.includes("diperbarui"))) {
        setPreviewVersionKey(Date.now());
        if (videoRef.current) {
          videoRef.current.load();
        }
      }
    } catch (err: any) {
      setGlobalError(err.message || "Gagal mengirim pesan.");
      await refreshMessages();
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
      <div className="flex flex-col items-center justify-center min-h-[500px] text-muted gap-3 font-mono">
        <RefreshCw className="w-8 h-8 text-action animate-spin" />
        <span className="text-xs uppercase tracking-wider font-bold text-copy">Menyiapkan Editorial Studio...</span>
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
    <div className="flex flex-col gap-4 text-copy w-full max-w-7xl mx-auto pb-12 font-sans">
      {/* Top Bar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-line p-3.5 shadow-md">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:border-action text-copy border border-line text-xs font-bold uppercase tracking-wider transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-action" />
            <span>Kembali ke Klip</span>
          </button>

          <div className="h-4 w-px bg-line hidden sm:block" />

          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-action" />
            <h1 className="text-sm font-extrabold text-copy tracking-wider uppercase font-display">
              Editorial Studio
            </h1>
            <span className="text-xs font-mono text-muted">
              [{clipId.slice(0, 10)}]
            </span>
          </div>

          {session && (
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 uppercase tracking-wider ${
                  isDone
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                    : isRendering || isAutopilotWorking
                    ? "bg-action/20 text-action border border-action animate-pulse"
                    : "bg-surface text-copy border border-line"
                }`}
              >
                {isAutopilotWorking ? "AUTOPILOT_RUNNING" : session.status}
              </span>
              <span className="text-[11px] font-mono text-muted">
                v{session.current_version}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Style Pack Selector */}
          <div className="flex items-center gap-1.5 bg-surface border border-line px-2.5 py-1">
            <Palette className="w-3.5 h-3.5 text-action" />
            <select
              value={selectedStylePack}
              disabled={isApplyingStyle || isRendering || isAutopilotWorking}
              onChange={(e) => handleApplyStyle(e.target.value)}
              className="bg-transparent text-xs font-bold text-copy focus:outline-none cursor-pointer uppercase font-mono"
            >
              {stylePacks.length > 0 ? (
                stylePacks.map((sp) => (
                  <option key={sp.name} value={sp.name} className="bg-card text-copy">
                    {sp.label || sp.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="gaming_hype" className="bg-card text-copy">Gaming Hype</option>
                  <option value="minimal_clean" className="bg-card text-copy">Minimal Clean</option>
                  <option value="hyper_meme" className="bg-card text-copy">Hyper Meme</option>
                </>
              )}
            </select>
          </div>

          {/* Simpan Gaya Ini */}
          <button
            onClick={() => setIsSaveStyleModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-surface hover:border-action text-copy border border-line text-xs font-bold tracking-wider uppercase transition-colors"
            title="Simpan preset gaya saat ini"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-action" />
            <span className="hidden md:inline">Simpan Gaya</span>
          </button>

          <button
            onClick={handleViewCode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:border-action text-copy border border-line text-xs font-bold tracking-wider uppercase transition-colors"
            title="Lihat atau edit source code Composition.tsx"
          >
            <Code2 className="w-3.5 h-3.5 text-action" />
            <span className="hidden sm:inline">Lihat Kode</span>
          </button>

          <button
            onClick={handleRenderPreview}
            disabled={isPreviewRendering || isRendering || isAutopilotWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:border-action text-action border border-line text-xs font-bold tracking-wider uppercase transition-colors disabled:opacity-50"
            title="Render ulang pratinjau video low-res"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPreviewRendering ? "animate-spin text-action" : ""}`} />
            <span>{isPreviewRendering ? "Merender..." : "Render Preview"}</span>
          </button>

          <button
            onClick={handleRenderFinal}
            disabled={isRendering || isFinalRendering || isAutopilotWorking}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-action hover:bg-action-hover text-bg font-extrabold text-xs uppercase tracking-wider transition-colors shadow-sm disabled:opacity-50"
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
            <div className="flex items-center gap-2">
              {onNavigateToResults && (
                <button
                  onClick={onNavigateToResults}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-action hover:bg-action-hover text-bg text-xs font-extrabold uppercase tracking-wider transition-colors"
                  title="Lihat klip di tab Hasil Klip"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Buka Hasil Klip</span>
                </button>
              )}
              <a
                href={finalUrl}
                download={`${session?.id}_final.mp4`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-line hover:border-action text-copy text-xs font-bold uppercase tracking-wider transition-colors"
                title="Unduh video hasil render final 1080x1920"
              >
                <Download className="w-3.5 h-3.5 text-action" />
                <span>Unduh MP4</span>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Global Error Notice */}
      {globalError && (
        <div className="p-3 bg-err/10 border border-err/60 text-xs text-err flex items-start gap-2 font-mono">
          <AlertTriangle className="w-4 h-4 text-err shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Terjadi Kesalahan: </span>
            {globalError}
          </div>
          <button
            onClick={() => setGlobalError(null)}
            className="text-err hover:underline text-xs font-bold ml-2 uppercase"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Final Done Success Card */}
      {isDone && (
        <div className="p-3.5 bg-card border border-action text-copy flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-action shrink-0" />
            <div>
              <span className="font-bold text-action uppercase tracking-wide">Video Final Siap! </span>
              Lolos QA: Resolusi 1080×1920, audio EBU R128 (-16 LUFS). Video otomatis masuk ke tab Hasil Klip.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToResults && (
              <button
                onClick={onNavigateToResults}
                className="px-3.5 py-1.5 bg-action hover:bg-action-hover text-bg font-extrabold text-xs uppercase tracking-wider transition-colors"
              >
                Buka di Hasil Klip
              </button>
            )}
            <a
              href={finalUrl}
              download={`${session?.id}_final.mp4`}
              className="px-3 py-1.5 bg-surface border border-line hover:border-action text-copy font-bold text-xs uppercase tracking-wider transition-colors"
            >
              Download Sekarang
            </a>
          </div>
        </div>
      )}

      {/* Mobile View Switcher (Visible only on < lg) */}
      <div className="flex lg:hidden items-center bg-card border border-line p-1 text-xs font-mono font-bold uppercase tracking-wider">
        <button
          onClick={() => setMobileView("player")}
          className={`flex-1 py-2 text-center transition-colors ${
            mobileView === "player" ? "bg-action text-bg" : "text-muted hover:text-copy"
          }`}
        >
          🎬 Player
        </button>
        <button
          onClick={() => {
            setMobileView("chat");
            setActiveTab("chat");
          }}
          className={`flex-1 py-2 text-center transition-colors ${
            mobileView === "chat" ? "bg-action text-bg" : "text-muted hover:text-copy"
          }`}
        >
          💬 Chat {messages.length > 0 && `(${messages.length})`}
        </button>
        <button
          onClick={() => {
            setMobileView("assets");
            setActiveTab("assets");
          }}
          className={`flex-1 py-2 text-center transition-colors ${
            mobileView === "assets" ? "bg-action text-bg" : "text-muted hover:text-copy"
          }`}
        >
          📁 Aset {assets.length > 0 && `(${assets.length})`}
        </button>
        <button
          onClick={() => {
            setMobileView("versions");
            setActiveTab("versions");
          }}
          className={`flex-1 py-2 text-center transition-colors ${
            mobileView === "versions" ? "bg-action text-bg" : "text-muted hover:text-copy"
          }`}
        >
          ⏱️ Versi
        </button>
      </div>

      {/* Main Studio Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch lg:h-[760px]">
        {/* Left Column: 9:16 Preview Player & Controls (5 Cols) */}
        <div className={`${mobileView === "player" ? "flex" : "hidden"} lg:flex lg:col-span-5 flex-col justify-between h-full bg-card border border-line p-4 shadow-md`}>
          <div className="flex items-center justify-between shrink-0 mb-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-action" />
              <span className="text-xs font-bold uppercase tracking-wider text-copy font-mono">
                Pratinjau 9:16 (Preview)
              </span>
            </div>
            <button
              onClick={() => setShowSafeZone(!showSafeZone)}
              className={`text-[11px] px-2.5 py-1 font-bold uppercase font-mono transition-colors border ${
                showSafeZone
                  ? "bg-action text-bg border-action"
                  : "bg-surface text-muted border-line hover:text-copy hover:border-action"
              }`}
            >
              {showSafeZone ? "Sembunyikan Safe Zone" : "Overlay Safe Zone"}
            </button>
          </div>

          {/* Video Canvas Container (9:16 Aspect Ratio) */}
          <div className="relative w-full flex-1 min-h-0 aspect-[9/16] max-h-[640px] mx-auto bg-black overflow-hidden border border-line shadow-inner flex items-center justify-center">
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
                <div className="h-[12%] bg-err/20 border-b border-dashed border-err flex items-center justify-center text-[10px] text-err font-mono">
                  Safe Header (12%)
                </div>
                <div className="flex-1 flex justify-between">
                  <div className="w-[6%] bg-err/20 border-r border-dashed border-err flex items-center justify-center text-[9px] text-err font-mono [writing-mode:vertical-lr]">
                    Left 6%
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="border border-action rounded-none px-2 py-1 bg-black/80 text-[10px] text-action font-mono">
                      Zona Aman Teks & Subtitle
                    </div>
                  </div>
                  <div className="w-[12%] bg-err/20 border-l border-dashed border-err flex items-center justify-center text-[9px] text-err font-mono [writing-mode:vertical-lr]">
                    UI Right (12%)
                  </div>
                </div>
                <div className="h-[20%] bg-err/20 border-t border-dashed border-err flex items-center justify-center text-[10px] text-err font-mono">
                  Safe Bottom Bar & Bio (20%)
                </div>
              </div>
            )}
          </div>

          {/* Time & Comment in Current Second Button */}
          <div className="flex items-center justify-between pt-2 shrink-0 border-t border-line mt-2">
            <div className="flex items-center gap-2 text-xs font-mono text-copy">
              <Clock className="w-3.5 h-3.5 text-muted" />
              <span>
                {formatSeconds(currentTime)} / {formatSeconds(videoDuration)}
              </span>
            </div>

            <button
              onClick={handleInsertTimestamp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:border-action border border-line text-action text-xs font-bold uppercase font-mono tracking-wider transition-colors"
              title="Sisipkan detik saat ini ke input chat"
            >
              <Clock className="w-3.5 h-3.5 text-action" />
              <span>Komentar [{formatSeconds(currentTime)}]</span>
            </button>
          </div>
        </div>

        {/* Right Column: Studio Panels & Chat (7 Cols) */}
        <div className={`${mobileView !== "player" ? "flex" : "hidden"} lg:flex lg:col-span-7 flex-col gap-3 h-full min-h-0`}>
          {/* Studio Navigation Tabs */}
          <div className="flex items-center gap-2 bg-card border border-line p-1.5 shrink-0">
            <button
              onClick={() => {
                setActiveTab("chat");
                setMobileView("chat");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-extrabold uppercase font-mono tracking-wider transition-colors ${
                activeTab === "chat"
                  ? "bg-action text-bg"
                  : "text-muted hover:text-copy bg-surface border border-line"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>AI Chat & Autopilot</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("assets");
                setMobileView("assets");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-extrabold uppercase font-mono tracking-wider transition-colors ${
                activeTab === "assets"
                  ? "bg-action text-bg"
                  : "text-muted hover:text-copy bg-surface border border-line"
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Aset ({assets.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("versions");
                setMobileView("versions");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-extrabold uppercase font-mono tracking-wider transition-colors ${
                activeTab === "versions"
                  ? "bg-action text-bg"
                  : "text-muted hover:text-copy bg-surface border border-line"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Versi ({versions.length})</span>
            </button>
          </div>

          {/* Active Tab Content Area */}
          <div className="bg-card border border-line p-3 shadow-md flex-1 min-h-0 flex flex-col overflow-hidden">
            {session && activeTab === "chat" && (
              <EditorialChat
                sessionId={session.id}
                messages={messages}
                assets={assets}
                isSending={isSendingMessage}
                isAutopilotWorking={isAutopilotWorking || session.status === "AGENT_WORKING"}
                onSendMessage={handleSendMessage}
                onRunAutopilot={handleRunAutopilot}
                onOpenAssetsTab={() => {
                  setActiveTab("assets");
                  setMobileView("assets");
                }}
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
                  setMobileView("chat");
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
          <div className="bg-card border border-line w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
            {/* Header */}
            <div className="px-4 py-3 bg-surface border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-action" />
                <h3 className="text-xs font-bold text-copy uppercase tracking-wider font-mono">
                  Composition.tsx Source Code
                </h3>
                <span className="text-[10px] text-muted font-mono">
                  (Remotion TSX Sandbox)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 bg-surface hover:border-action border border-line text-copy text-xs transition-colors flex items-center gap-1 font-mono uppercase"
                >
                  {codeCopied ? <Check className="w-3.5 h-3.5 text-action" /> : null}
                  <span>{codeCopied ? "Tersalin!" : "Salin Kode"}</span>
                </button>
                <button
                  onClick={() => setIsCodeModalOpen(false)}
                  className="p-1 hover:bg-surface text-muted hover:text-copy transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Error Message */}
            {codeError && (
              <div className="p-3 bg-err/10 border-b border-err/60 text-xs text-err font-mono">
                <span className="font-bold">Gagal Validasi Kode: </span>
                {codeError}
              </div>
            )}

            {/* Editor Textarea */}
            <div className="flex-1 p-3 bg-black font-mono text-xs overflow-hidden flex flex-col">
              <textarea
                value={codeContent}
                onChange={(e) => setCodeContent(e.target.value)}
                className="w-full h-full bg-surface text-copy p-3 border border-line focus:outline-none focus:border-action resize-none font-mono text-[11px] leading-relaxed"
                rows={22}
                spellCheck={false}
              />
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-surface border-t border-line flex items-center justify-between text-xs">
              <div className="text-muted text-[11px] font-mono">
                Validasi Leak-Guard ketat aktif. Dilarang menggunakan env/eval/process.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCodeModalOpen(false)}
                  className="px-3 py-1.5 bg-card hover:border-action border border-line text-copy uppercase font-mono text-xs transition-colors"
                >
                  Tutup
                </button>
                <button
                  onClick={handleSaveCode}
                  disabled={isSavingCode}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-action hover:bg-action-hover text-bg text-xs font-bold uppercase font-mono tracking-wider transition-colors disabled:opacity-50"
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
          <div className="bg-card border border-line w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
            <div className="px-4 py-3 bg-surface border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-action" />
                <h3 className="text-xs font-bold text-copy uppercase tracking-wider font-mono">
                  Kirim Naskah Script Editorial
                </h3>
              </div>
              <button
                onClick={() => setIsScriptModalOpen(false)}
                className="p-1 hover:bg-surface text-muted hover:text-copy transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              <div className="flex items-center gap-4 bg-surface p-2.5 border border-line">
                <span className="text-xs font-bold text-copy uppercase font-mono">Mode:</span>
                <label className="flex items-center gap-2 text-xs text-copy cursor-pointer font-mono">
                  <input
                    type="radio"
                    name="script_mode"
                    value="strict"
                    checked={scriptMode === "strict"}
                    onChange={() => setScriptMode("strict")}
                    className="accent-[#FF6A00]"
                  />
                  <span>Ikuti Persis (Strict)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-copy cursor-pointer font-mono">
                  <input
                    type="radio"
                    name="script_mode"
                    value="guide"
                    checked={scriptMode === "guide"}
                    onChange={() => setScriptMode("guide")}
                    className="accent-[#FF6A00]"
                  />
                  <span>Jadikan Panduan (Guide)</span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-copy uppercase font-mono">
                  Teks Naskah / Markdown:
                </label>
                <textarea
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="Ketik naskah atau copy paste teks skrip di sini..."
                  rows={8}
                  className="w-full bg-surface text-copy p-3 border border-line focus:outline-none focus:border-action text-xs font-mono resize-none leading-relaxed"
                />
              </div>

              {beatSheetResult && (
                <div className="bg-surface p-3 border border-line flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold font-mono">
                    <span className="text-copy uppercase">Hasil Penyelarasan:</span>
                    <span className="text-action">
                      Rate: {Math.round(beatSheetResult.alignment_rate * 100)}% ({beatSheetResult.aligned_lines}/{beatSheetResult.total_lines} baris)
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1 font-mono">
                    {beatSheetResult.beats?.map((b: any, idx: number) => (
                      <div
                        key={idx}
                        className={`text-[11px] p-1.5 flex items-center justify-between border ${
                          b.aligned
                            ? "bg-card text-copy border-line"
                            : "bg-err/10 text-err border-err/60"
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

            <div className="px-4 py-3 bg-surface border-t border-line flex items-center justify-between">
              <div className="text-[11px] text-muted font-mono">
                Penyelarasan otomatis menggunakan pencocokan urutan kata transkrip.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsScriptModalOpen(false)}
                  className="px-3 py-1.5 bg-card hover:border-action border border-line text-copy uppercase font-mono text-xs transition-colors"
                >
                  Tutup
                </button>
                <button
                  onClick={handleSubmitScript}
                  disabled={isAligningScript || !scriptText.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-action hover:bg-action-hover text-bg uppercase font-mono text-xs font-bold transition-colors disabled:opacity-50"
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
          <div className="bg-card border border-line w-full max-w-md flex flex-col shadow-2xl overflow-hidden font-sans">
            <div className="px-4 py-3 bg-surface border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4 text-action" />
                <h3 className="text-xs font-bold text-copy uppercase tracking-wider font-mono">
                  Simpan Gaya Ini Sebagai Preset
                </h3>
              </div>
              <button
                onClick={() => setIsSaveStyleModalOpen(false)}
                className="p-1 hover:bg-surface text-muted hover:text-copy transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 font-mono">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-copy uppercase">Nama Preset Gaya:</label>
                <input
                  type="text"
                  value={customStyleName}
                  onChange={(e) => setCustomStyleName(e.target.value)}
                  placeholder="Contoh: Valorant Hype Clean"
                  className="bg-surface text-copy px-3 py-2 border border-line text-xs focus:outline-none focus:border-action"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-copy uppercase">Deskripsi Gaya:</label>
                <input
                  type="text"
                  value={customStyleDesc}
                  onChange={(e) => setCustomStyleDesc(e.target.value)}
                  placeholder="Contoh: Shake agresif dengan caption kuning tebal"
                  className="bg-surface text-copy px-3 py-2 border border-line text-xs focus:outline-none focus:border-action"
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-surface border-t border-line flex items-center justify-end gap-2">
              <button
                onClick={() => setIsSaveStyleModalOpen(false)}
                className="px-3 py-1.5 bg-card hover:border-action border border-line text-copy uppercase font-mono text-xs transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveStyle}
                disabled={isSavingCustomStyle || !customStyleName.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-action hover:bg-action-hover text-bg text-xs font-bold uppercase font-mono tracking-wider transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingCustomStyle ? "Menyimpan..." : "Simpan Preset"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up Render Final Remotion Modal */}
      {finalRenderModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="marked-frame border border-line bg-surface max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 font-mono text-xs relative">
            <i className="crop-mark crop-tl" />
            <i className="crop-mark crop-tr" />
            <i className="crop-mark crop-bl" />
            <i className="crop-mark crop-br" />

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <span className="font-extrabold uppercase text-copy tracking-wider flex items-center gap-2">
                {finalRenderModal.status === "rendering" ? (
                  <RefreshCw className="w-4 h-4 text-action animate-spin" />
                ) : finalRenderModal.status === "success" ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-err" />
                )}
                <span>
                  {finalRenderModal.status === "rendering"
                    ? "RENDER FINAL BERJALAN..."
                    : finalRenderModal.status === "success"
                    ? "RENDER FINAL SELESAI"
                    : "RENDER FINAL GAGAL"}
                </span>
              </span>
              {finalRenderModal.status !== "rendering" && (
                <button
                  type="button"
                  onClick={() =>
                    setFinalRenderModal((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="text-muted hover:text-copy"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            {finalRenderModal.status === "rendering" && (
              <div className="flex flex-col gap-3 py-1">
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>{finalRenderModal.message}</span>
                  <span className="text-action font-bold">
                    {finalRenderModal.progress}%
                  </span>
                </div>
                {/* Progress Bar */}
                <div className="w-full bg-card h-2 border border-line overflow-hidden">
                  <div
                    className="bg-action h-full transition-all duration-300"
                    style={{ width: `${finalRenderModal.progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted text-center pt-1">
                  Remotion worker sedang merender frame secara headless...
                </span>
              </div>
            )}

            {finalRenderModal.status === "success" && (
              <div className="flex flex-col items-center gap-3 py-3 text-center">
                <Check className="w-8 h-8 text-emerald-400 mb-1" />
                <span className="font-bold text-copy">{finalRenderModal.message}</span>
                <span className="text-[10px] text-muted">
                  Video MP4 1080x1920 siap diunduh & direview ulang di tab Hasil Klip.
                </span>
                <div className="flex items-center gap-2 w-full pt-2 border-t border-line">
                  {onNavigateToResults && (
                    <button
                      type="button"
                      onClick={() => {
                        setFinalRenderModal((prev) => ({ ...prev, isOpen: false }));
                        onNavigateToResults();
                      }}
                      className="flex-1 py-2 px-3 bg-action text-bg font-extrabold text-[11px] uppercase tracking-wider hover:brightness-110"
                    >
                      Buka di Hasil Klip ➔
                    </button>
                  )}
                  {session && (
                    <a
                      href={`${getEditorialFinalVideoUrl(session.id)}`}
                      download={`${session.id}_final.mp4`}
                      className="py-2 px-3 bg-surface border border-line text-copy hover:border-action font-bold text-[11px] uppercase"
                    >
                      Unduh
                    </a>
                  )}
                </div>
              </div>
            )}

            {finalRenderModal.status === "error" && (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-err/10 border border-err/30 text-err text-xs">
                  <p className="font-bold mb-1">{finalRenderModal.message}</p>
                  <p className="font-mono text-[11px] opacity-90">
                    {finalRenderModal.error}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFinalRenderModal((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="btn-ghost w-full py-2 text-xs font-bold text-copy border border-line"
                >
                  TUTUP
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
