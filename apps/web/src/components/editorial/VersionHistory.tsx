import React from "react";
import { EditorialVersion } from "../../types";
import { History, RotateCcw, CheckCircle, GitCommit } from "lucide-react";

interface VersionHistoryProps {
  sessionId: string;
  versions: EditorialVersion[];
  currentVersion: number;
  onRestoreVersion: (versionNum: number) => void;
  isRestoring: boolean;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  versions,
  currentVersion,
  onRestoreVersion,
  isRestoring,
}) => {
  return (
    <div className="flex flex-col gap-3 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Riwayat Versi Komposisi ({versions.length})
          </span>
        </div>
        <span className="text-[11px] text-slate-500">
          Setiap perubahan komposisi tersimpan dalam git workspace
        </span>
      </div>

      {versions.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Belum ada riwayat versi. Versi pertama dibuat saat inisialisasi sesi.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
          {versions.map((ver) => {
            const isCurrent = ver.version_num === currentVersion;

            return (
              <div
                key={ver.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition ${
                  isCurrent
                    ? "bg-indigo-950/40 border-indigo-600/60 shadow-sm"
                    : "bg-slate-900 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex flex-col gap-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded ${
                        isCurrent
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      v{ver.version_num}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <GitCommit className="w-3 h-3 text-slate-500" />
                      {ver.commit_sha ? ver.commit_sha.slice(0, 7) : "init"}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] text-indigo-300 font-semibold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-indigo-400" /> Aktif
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 truncate font-medium">
                    {ver.summary || "Inisialisasi workspace"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(ver.created_at).toLocaleString("id-ID")}
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    onClick={() => onRestoreVersion(ver.version_num)}
                    disabled={isRestoring}
                    title={`Kembalikan komposisi ke versi ${ver.version_num}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold transition shrink-0 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Restore</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
