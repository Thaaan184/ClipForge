import React, { useState } from "react";
import {
  Job,
  ManualClipSegment,
  REFRAME_OPTIONS,
  SUBTITLE_POSITION_OPTIONS,
  SUBTITLE_PRESET_OPTIONS,
} from "../types";
import { getYoutubeThumbnail } from "../api";
import { Film, Plus, Scissors, Trash2, X, Zap } from "lucide-react";

interface AddManualClipModalProps {
  job: Job;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    jobId: string,
    clips: ManualClipSegment[],
    options: {
      reframe_mode?: string;
      subtitle_style?: string;
      subtitle_position?: string;
    }
  ) => Promise<void>;
  loading: boolean;
}

interface ManualClipRow {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
}

function parseTimestamp(val: string): number | null {
  val = val.trim();
  if (!val) return null;
  if (/^\d+(\.\d+)?$/.test(val)) {
    return parseFloat(val);
  }
  const parts = val.split(":").map((p) => parseFloat(p));
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function calculateDurationString(start: string, end: string): string | null {
  const s = parseTimestamp(start);
  const e = parseTimestamp(end);
  if (s !== null && e !== null && e > s) {
    const diff = e - s;
    const m = Math.floor(diff / 60);
    const sec = Math.floor(diff % 60);
    return `${m > 0 ? `${m}m ` : ""}${sec}s`;
  }
  return null;
}

export const AddManualClipModal: React.FC<AddManualClipModalProps> = ({
  job,
  isOpen,
  onClose,
  onSubmit,
  loading,
}) => {
  const [clips, setClips] = useState<ManualClipRow[]>([
    { id: "row-1", startTime: "", endTime: "", title: "" },
  ]);
  const [subtitleStyle, setSubtitleStyle] = useState("classic_white");
  const [subtitlePosition, setSubtitlePosition] = useState<"bottom" | "top">("bottom");
  const [reframeMode, setReframeMode] = useState<"blur" | "center" | "stacked">("blur");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const thumbUrl = getYoutubeThumbnail(job.video_id, job.source_url);

  const handleAddRow = () => {
    setClips((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        startTime: "",
        endTime: "",
        title: "",
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (clips.length <= 1) return;
    setClips((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof ManualClipRow, val: string) => {
    setClips((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validClips: ManualClipSegment[] = [];

    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const s = parseTimestamp(c.startTime);
      const end = parseTimestamp(c.endTime);

      if (s === null || s < 0) {
        setError(`Baris #${i + 1}: Timestamp mulai tidak valid (contoh: 01:23 atau 83)`);
        return;
      }
      if (end === null || end <= s) {
        setError(`Baris #${i + 1}: Timestamp selesai harus lebih besar dari timestamp mulai`);
        return;
      }
      if (end - s < 1.0) {
        setError(`Baris #${i + 1}: Durasi klip minimal 1 detik`);
        return;
      }

      validClips.push({
        start_time: c.startTime.trim(),
        end_time: c.endTime.trim(),
        title: c.title.trim() || undefined,
      });
    }

    if (validClips.length === 0) {
      setError("Masukkan setidaknya 1 segmen klip manual.");
      return;
    }

    try {
      await onSubmit(job.id, validClips, {
        reframe_mode: reframeMode,
        subtitle_style: subtitleStyle,
        subtitle_position: subtitlePosition,
      });
    } catch (err: any) {
      setError(err?.message || "Gagal menambahkan klip manual.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm animate-fade-in">
      <div className="marked-card w-full max-w-2xl bg-surface border border-line shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <i className="crop-mark crop-tl" />
        <i className="crop-mark crop-tr" />
        <i className="crop-mark crop-bl" />
        <i className="crop-mark crop-br" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between bg-card/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-action/10 border border-action/30 text-action">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-copy">
                Tambah Klip Manual ke Proyek
              </h3>
              <p className="text-[11px] text-muted">
                Potong segmen baru langsung dari video sumber tanpa membuat proyek baru
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-muted hover:text-copy p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Video Preview Bar */}
        <div className="p-3.5 bg-bg/70 border-b border-line flex items-center gap-3">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt="Source Thumbnail"
              className="w-20 sm:w-24 aspect-[16/9] object-cover border border-line shrink-0"
            />
          ) : (
            <div className="w-20 aspect-[16/9] bg-card border border-line flex items-center justify-center shrink-0">
              <Film className="w-4 h-4 text-muted" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono text-action uppercase font-bold tracking-wider">
              TARGET PROYEK ({job.id.slice(0, 8)})
            </span>
            <div className="font-bold text-xs text-copy truncate" title={job.title || job.source_url}>
              {job.title || job.source_url}
            </div>
            <div className="text-[10px] text-muted truncate font-mono">
              {job.source_url}
            </div>
          </div>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 text-xs">
          {error && (
            <div className="p-3 bg-err/10 border border-err/30 text-err text-xs font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-b border-line pb-1.5">
            <span className="font-extrabold uppercase tracking-wider text-copy text-[11px]">
              Daftar Klip Baru ({clips.length})
            </span>
            <span className="text-[10px] text-muted">
              Masukkan timestamp rentang menit video
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {clips.map((row, idx) => {
              const durStr = calculateDurationString(row.startTime, row.endTime);
              return (
                <div
                  key={row.id}
                  className="p-3 bg-card/60 border border-line flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 relative"
                >
                  <span className="font-mono font-bold text-action text-xs bg-action/10 px-2 py-0.5 border border-action/30 self-start sm:self-center">
                    #{idx + 1}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 flex-1 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-muted uppercase font-bold tracking-wider mb-1">
                        Mulai (MM:SS / Detik)
                      </label>
                      <input
                        type="text"
                        required
                        value={row.startTime}
                        onChange={(e) => handleUpdateRow(row.id, "startTime", e.target.value)}
                        placeholder="Contoh: 12:35 atau 755"
                        className="w-full bg-bg border border-line py-1 px-2 text-copy font-mono text-xs focus:border-action focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-muted uppercase font-bold tracking-wider mb-1 flex justify-between">
                        <span>Selesai</span>
                        {durStr && (
                          <span className="text-action font-mono text-[9px] bg-action/10 px-1 border border-action/20">
                            {durStr}
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        required
                        value={row.endTime}
                        onChange={(e) => handleUpdateRow(row.id, "endTime", e.target.value)}
                        placeholder="Contoh: 14:20 atau 860"
                        className="w-full bg-bg border border-line py-1 px-2 text-copy font-mono text-xs focus:border-action focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2 md:col-span-1">
                      <label className="block text-[10px] text-muted uppercase font-bold tracking-wider mb-1">
                        Judul Klip (Opsional)
                      </label>
                      <input
                        type="text"
                        value={row.title}
                        onChange={(e) => handleUpdateRow(row.id, "title", e.target.value)}
                        placeholder="Contoh: Highlight Penting"
                        className="w-full bg-bg border border-line py-1 px-2 text-copy text-xs focus:border-action focus:outline-none"
                      />
                    </div>
                  </div>

                  {clips.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      className="text-muted hover:text-err p-1.5 transition-colors self-end sm:self-center"
                      title="Hapus Baris Klip"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddRow}
            className="py-2 px-3 border border-dashed border-action/50 hover:border-action bg-action/5 hover:bg-action/10 text-action text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>TAMBAH BARIS KLIP LAGI</span>
          </button>

          {/* Settings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-line/60">
            <div>
              <label className="block text-muted uppercase font-bold tracking-wider mb-1 text-[10px]">
                Preset Subtitle
              </label>
              <select
                value={subtitleStyle}
                onChange={(e) => setSubtitleStyle(e.target.value)}
                disabled={loading}
                className="w-full bg-bg border border-line py-1.5 px-2 text-copy text-xs focus:border-action focus:outline-none"
              >
                {SUBTITLE_PRESET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-muted uppercase font-bold tracking-wider mb-1 text-[10px]">
                Lokasi Subtitle
              </label>
              <select
                value={subtitlePosition}
                onChange={(e) => setSubtitlePosition(e.target.value as "bottom" | "top")}
                disabled={loading || subtitleStyle === "none"}
                className="w-full bg-bg border border-line py-1.5 px-2 text-copy text-xs focus:border-action focus:outline-none"
              >
                {SUBTITLE_POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-muted uppercase font-bold tracking-wider mb-1 text-[10px]">
                Reframe 9:16
              </label>
              <select
                value={reframeMode}
                onChange={(e) => setReframeMode(e.target.value as "blur" | "center" | "stacked")}
                disabled={loading}
                className="w-full bg-bg border border-line py-1.5 px-2 text-copy text-xs focus:border-action focus:outline-none"
              >
                {REFRAME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-2 px-4 border border-line hover:bg-card text-muted hover:text-copy font-bold text-xs uppercase transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="py-2 px-5 bg-action text-bg font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? (
                <span>MEMPROSES...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>+ TAMBAH KE REVIEW ({clips.length} KLIP)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
