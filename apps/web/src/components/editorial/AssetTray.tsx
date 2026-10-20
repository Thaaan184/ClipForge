import React, { useState } from "react";
import { EditorialAsset } from "../../types";
import {
  uploadEditorialAsset,
  updateEditorialAsset,
  deleteEditorialAsset,
  getEditorialAssetFileUrl,
} from "../../api";
import {
  Upload,
  Music,
  Video as VideoIcon,
  Trash2,
  Edit2,
  Check,
  X,
  AtSign,
  AlertCircle,
  FileCheck,
} from "lucide-react";

interface AssetTrayProps {
  sessionId: string;
  assets: EditorialAsset[];
  onAssetsChanged: () => void;
  onMentionAsset: (assetLabel: string) => void;
}

const ALLOWED_EXTS = [
  ".png", ".jpg", ".jpeg", ".webp",
  ".mp3", ".wav", ".m4a", ".aac",
  ".mp4", ".webm", ".mov",
];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const AssetTray: React.FC<AssetTrayProps> = ({
  sessionId,
  assets,
  onAssetsChanged,
  onMentionAsset,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [hintInput, setHintInput] = useState("");

  // Edit state
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editHint, setEditHint] = useState("");

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setErrorMessage(
        `Format berkas '${ext}' tidak didukung. Format yang diizinkan: gambar (PNG, JPG, WEBP), audio (MP3, WAV, AAC), video (MP4, WEBM, MOV).`
      );
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage(
        `Ukuran berkas (${(file.size / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimum 50 MB.`
      );
      return false;
    }

    setSelectedFile(file);
    if (!labelInput) {
      const stem = file.name.replace(/\.[^/.]+$/, "");
      setLabelInput(stem);
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setErrorMessage(null);
      await uploadEditorialAsset(sessionId, selectedFile, labelInput, hintInput);
      setSuccessMessage(`Aset "${labelInput || selectedFile.name}" berhasil diunggah.`);
      setSelectedFile(null);
      setLabelInput("");
      setHintInput("");
      onAssetsChanged();
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal mengunggah aset.");
    } finally {
      setIsUploading(false);
    }
  };

  const startEdit = (asset: EditorialAsset) => {
    setEditingAssetId(asset.id);
    setEditLabel(asset.label);
    setEditHint(asset.hint || "");
  };

  const saveEdit = async (assetId: string) => {
    try {
      await updateEditorialAsset(sessionId, assetId, {
        label: editLabel,
        hint: editHint,
      });
      setEditingAssetId(null);
      onAssetsChanged();
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal memperbarui metadata aset.");
    }
  };

  const handleDelete = async (assetId: string, assetLabel: string) => {
    if (!confirm(`Hapus aset "${assetLabel}" dari studio?`)) return;
    try {
      await deleteEditorialAsset(sessionId, assetId);
      onAssetsChanged();
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal menghapus aset.");
    }
  };

  const renderAssetThumbnail = (asset: EditorialAsset) => {
    const fileUrl = getEditorialAssetFileUrl(sessionId, asset.id);
    if (asset.type === "image") {
      return (
        <div className="w-16 h-16 rounded bg-slate-950 flex items-center justify-center overflow-hidden border border-slate-700 shrink-0">
          <img
            src={fileUrl}
            alt={asset.label}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
      );
    }
    if (asset.type === "audio") {
      return (
        <div className="w-16 h-16 rounded bg-indigo-950/80 border border-indigo-700/50 flex flex-col items-center justify-center text-indigo-400 shrink-0">
          <Music className="w-6 h-6 mb-1" />
          <span className="text-[9px] font-mono uppercase tracking-wider">Audio</span>
        </div>
      );
    }
    return (
      <div className="w-16 h-16 rounded bg-emerald-950/80 border border-emerald-700/50 flex flex-col items-center justify-center text-emerald-400 shrink-0">
        <VideoIcon className="w-6 h-6 mb-1" />
        <span className="text-[9px] font-mono uppercase tracking-wider">B-Roll</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 text-slate-200 h-full min-h-0 overflow-y-auto pr-1">
      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 transition text-center ${
          dragOver
            ? "border-indigo-500 bg-indigo-950/30"
            : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
        }`}
      >
        {!selectedFile ? (
          <label className="cursor-pointer flex flex-col items-center justify-center gap-2">
            <Upload className="w-7 h-7 text-indigo-400" />
            <div className="text-xs font-semibold text-slate-300">
              Tarik & letakkan foto, audio/SFX, atau video b-roll di sini
            </div>
            <div className="text-[11px] text-slate-500">
              Format: PNG, JPG, WEBP, MP3, WAV, MP4 (Maks. 50 MB)
            </div>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.aac,.mp4,.webm,.mov"
              className="hidden"
            />
          </label>
        ) : (
          <form onSubmit={handleUploadSubmit} className="flex flex-col gap-2.5 text-left">
            <div className="flex items-center justify-between bg-slate-800 px-3 py-2 rounded text-xs">
              <div className="flex items-center gap-2 truncate">
                <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-mono text-slate-300 truncate">{selectedFile.name}</span>
                <span className="text-slate-500 text-[10px]">
                  ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-slate-400 hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Label Singkat (untuk @mention):
                </label>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="Misal: logo_kemenangan"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Petunjuk Penggunaan AI (Opsional):
                </label>
                <input
                  type="text"
                  value={hintInput}
                  onChange={(e) => setHintInput(e.target.value)}
                  placeholder="Misal: tampilkan saat clutch di detik 12"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded transition disabled:opacity-50"
              >
                {isUploading ? "Mengunggah..." : "Simpan Aset"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Status Notifications */}
      {errorMessage && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded text-xs text-red-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 rounded text-xs text-emerald-300">
          {successMessage}
        </div>
      )}

      {/* Asset List Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Daftar Aset ({assets.length})
        </span>
        <span className="text-[11px] text-slate-500">
          Klik tombol @ untuk menyisipkan aset ke instruksi chat
        </span>
      </div>

      {/* Assets Grid */}
      {assets.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Belum ada aset tambahan untuk klip ini. Unggah foto kemenangan, backsound musik, atau video reaksi.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto pr-1">
          {assets.map((asset) => {
            const isEditing = editingAssetId === asset.id;

            return (
              <div
                key={asset.id}
                className="flex items-center gap-3 p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition"
              >
                {renderAssetThumbnail(asset)}

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex flex-col gap-1.5 text-xs">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="Label aset"
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                      />
                      <input
                        type="text"
                        value={editHint}
                        onChange={(e) => setEditHint(e.target.value)}
                        placeholder="Petunjuk penggunaan"
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-400 text-[11px]"
                      />
                      <div className="flex gap-1.5 mt-1">
                        <button
                          onClick={() => saveEdit(asset.id)}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Simpan
                        </button>
                        <button
                          onClick={() => setEditingAssetId(null)}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-200 truncate">
                          {asset.label}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                          {asset.type}
                        </span>
                        {asset.duration_s > 0 && (
                          <span className="text-[10px] font-mono text-slate-500">
                            {asset.duration_s.toFixed(1)}s
                          </span>
                        )}
                      </div>

                      {asset.hint ? (
                        <div className="text-[11px] text-indigo-300/80 truncate mt-0.5">
                          💡 {asset.hint}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">
                          {asset.filename}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onMentionAsset(asset.label)}
                      title={`Sebut @${asset.label} di chat`}
                      className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition"
                    >
                      <AtSign className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startEdit(asset)}
                      title="Edit label & petunjuk"
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(asset.id, asset.label)}
                      title="Hapus aset"
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
