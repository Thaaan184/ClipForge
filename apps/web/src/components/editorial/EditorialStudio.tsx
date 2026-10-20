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

  // Notifications / Errors
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [previewVersionKey, setPreviewVersionKey] = useState<number>(Date.now());

  // 1. Initial Load: create or fetch active session
  const initSession = async () => {
    try {
      setIsLoadingSession(true);
      setGlobalError(null);
      // Attempt to create or fetch existing session
      const sess = await createEditorialSession(clipId);
      setSession(sess);

      // Load assets, versions, messages in parallel
      const [astList, verList, msgList] = await Promise.all([
        listEditorialAssets(sess.id),
        listEditorialVersions(sess.id),
        listEditorialMessages(sess.id),
      ]);
      setAssets(astList);
      setVersions(verList);
      setMessages(msgList);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal memuat sesi editorial studio.");
    } finally {
      setIsLoadingSession(false);
    }
  };

  useEffect(() => {
    initSession();
  }, [clipId]);

  // 2. Status Polling: keep session state in sync (survives page refresh during render)
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

  // Refresh assets
  const refreshAssets = async () => {
    if (!session) return;
    try {
      const astList = await listEditorialAssets(session.id);
      setAssets(astList);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal memperbarui daftar aset.");
    }
  };

  // Refresh versions
  const refreshVersions = async () => {
    if (!session) return;
    try {
      const verList = await listEditorialVersions(session.id);
      setVersions(verList);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal memperbarui riwayat versi.");
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
      // Reload video
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
      // Update session status locally to trigger poll
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
      const msgList = await listEditorialMessages(session.id);
      setMessages(msgList);
    } catch (err: any) {
      setGlobalError(err.message || "Gagal mengirim pesan.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  // 7. Video Player helper: "Komentar di detik ini"
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
                    : isRendering
                    ? "bg-amber-950 text-amber-300 border border-amber-700 animate-pulse"
                    : "bg-indigo-950 text-indigo-300 border border-indigo-700"
                }`}
              >
                {session.status}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                v{session.current_version}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRenderPreview}
            disabled={isPreviewRendering || isRendering}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition border border-slate-700 disabled:opacity-50"
            title="Render ulang pratinjau video low-res"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPreviewRendering ? "animate-spin text-indigo-400" : ""}`} />
            <span>{isPreviewRendering ? "Merender..." : "Render Preview"}</span>
          </button>

          <button
            onClick={handleRenderFinal}
            disabled={isRendering || isFinalRendering}
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: 9:16 Preview Player & Controls (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between">
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
          <div className="relative w-full aspect-[9/16] max-h-[580px] mx-auto bg-black rounded-lg overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
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

            {/* Safe Zone Visual Overlay (RULES §9.6: top 12%, bottom 20%, left 6%, right 12%) */}
            {showSafeZone && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
                {/* Top Safe Margin (12%) */}
                <div className="h-[12%] bg-red-900/20 border-b border-dashed border-red-500/80 flex items-center justify-center text-[10px] text-red-300 font-mono">
                  Safe Header (12%)
                </div>

                {/* Middle safe area with left 6% and right 12% margins */}
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

                {/* Bottom Safe Margin (20% for TikTok/Shorts captions & bottom bar) */}
                <div className="h-[20%] bg-red-900/20 border-t border-dashed border-red-500/80 flex items-center justify-center text-[10px] text-red-300 font-mono">
                  Safe Bottom Bar & Bio (20%)
                </div>
              </div>
            )}
          </div>

          {/* Time & Comment in Current Second Button */}
          <div className="flex items-center justify-between pt-1">
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
        <div className="lg:col-span-7 flex flex-col gap-3">
          {/* Studio Navigation Tabs */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Percakapan & Arahan</span>
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
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md min-h-[500px]">
            {session && activeTab === "chat" && (
              <EditorialChat
                sessionId={session.id}
                messages={messages}
                assets={assets}
                isSending={isSendingMessage}
                onSendMessage={handleSendMessage}
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
    </div>
  );
};
