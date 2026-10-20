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
    <div className="flex flex-col gap-3 text-copy h-full min-h-0 font-sans">
      <div className="flex items-center justify-between border-b border-line pb-2 shrink-0 font-mono">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-action" />
          <span className="text-xs font-bold text-copy uppercase tracking-wider">
            Riwayat Versi Komposisi ({versions.length})
          </span>
        </div>
        <span className="text-[11px] text-muted">
          Git Workspace Snapshot
        </span>
      </div>

      {versions.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted font-mono">
          Belum ada riwayat versi. Versi pertama dibuat saat inisialisasi sesi.
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-1 font-mono">
          {versions.map((ver) => {
            const isCurrent = ver.version_num === currentVersion;

            return (
              <div
                key={ver.id}
                className={`flex items-center justify-between p-3 border transition-colors ${
                  isCurrent
                    ? "bg-card border-action shadow-sm"
                    : "bg-surface border-line hover:border-action"
                }`}
              >
                <div className="flex flex-col gap-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-extrabold px-2 py-0.5 uppercase tracking-wider ${
                        isCurrent
                          ? "bg-action text-bg"
                          : "bg-card text-muted border border-line"
                      }`}
                    >
                      v{ver.version_num}
                    </span>
                    <span className="text-[11px] text-muted flex items-center gap-1">
                      <GitCommit className="w-3 h-3 text-action" />
                      {ver.commit_sha ? ver.commit_sha.slice(0, 7) : "init"}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] text-action font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-action" /> Aktif
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-copy truncate font-sans font-medium">
                    {ver.summary || "Inisialisasi workspace"}
                  </div>
                  <div className="text-[10px] text-muted">
                    {new Date(ver.created_at).toLocaleString("id-ID")}
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    onClick={() => onRestoreVersion(ver.version_num)}
                    disabled={isRestoring}
                    title={`Kembalikan komposisi ke versi ${ver.version_num}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-card hover:border-action border border-line text-copy uppercase text-xs font-bold transition-colors shrink-0 disabled:opacity-50 min-h-[32px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-action" />
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
