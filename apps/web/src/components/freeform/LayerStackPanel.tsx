import React, { useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Layers,
  Edit2,
  Check,
} from "lucide-react";
import { useSceneStore } from "../../lib/scene/store";

export const LayerStackPanel: React.FC = () => {
  const {
    scene,
    selectedLayerId,
    setSelectedLayerId,
    toggleLayerVisibility,
    toggleLayerLock,
    reorderLayers,
    duplicateLayer,
    deleteLayer,
    updateScene,
    setEditingLayerId,
  } = useSceneStore();

  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  if (!scene) return null;

  // Display top layers first (highest z-index at top)
  const sortedLayers = [...scene.layers].sort((a, b) => b.transform.z - a.transform.z);

  const moveLayer = (id: string, dir: "up" | "down") => {
    const ids = sortedLayers.map((l) => l.id);
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    if (dir === "up" && idx > 0) {
      // Move visually up means higher z-index
      const tmp = ids[idx - 1];
      ids[idx - 1] = ids[idx];
      ids[idx] = tmp;
    } else if (dir === "down" && idx < ids.length - 1) {
      // Move visually down means lower z-index
      const tmp = ids[idx + 1];
      ids[idx + 1] = ids[idx];
      ids[idx] = tmp;
    }
    // Convert back from top-first to z-index (0 to N-1)
    reorderLayers(ids.reverse());
  };

  const startRename = (id: string, curName: string) => {
    setEditingNameId(id);
    setTempName(curName);
  };

  const saveRename = (id: string) => {
    if (tempName.trim()) {
      updateScene((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === id ? { ...l, name: tempName.trim() } : l)),
      }));
    }
    setEditingNameId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#141414] border-l border-[#2A2A2A] w-64 select-none">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0A0A0A] border-b border-[#2A2A2A]">
        <div className="flex items-center gap-1.5 text-xs font-mono text-[#AAAAAA] uppercase tracking-wider">
          <Layers size={14} className="text-[#FF6A00]" />
          <span>Layers ({scene.layers.length}/12)</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedLayers.length === 0 ? (
          <div className="text-center py-8 text-[#666666] text-xs">
            Belum ada layer potongan.
            <div className="mt-1 text-[11px] text-[#444444]">
              Gunakan panel kiri untuk menggambar bentuk.
            </div>
          </div>
        ) : (
          sortedLayers.map((layer, idx) => {
            const isSelected = layer.id === selectedLayerId;
            const isTop = idx === 0;
            const isBottom = idx === sortedLayers.length - 1;

            return (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                onDoubleClick={() => setEditingLayerId(layer.id)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition border cursor-pointer ${
                  isSelected
                    ? "bg-[#222222] border-[#00FFCC] text-white"
                    : "bg-[#181818] border-[#262626] text-[#BBBBBB] hover:bg-[#1E1E1E]"
                }`}
              >
                {/* Left: Visibility & Name */}
                <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerVisibility(layer.id);
                    }}
                    className="text-[#666666] hover:text-white"
                  >
                    {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-[#FF4444]" />}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerLock(layer.id);
                    }}
                    className="text-[#666666] hover:text-white"
                  >
                    {layer.locked ? <Lock size={13} className="text-[#FF6A00]" /> : <Unlock size={13} />}
                  </button>

                  {editingNameId === layer.id ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(layer.id);
                          if (e.key === "Escape") setEditingNameId(null);
                        }}
                        autoFocus
                        className="bg-black border border-[#00FFCC] rounded px-1 py-0.5 text-xs text-white w-full outline-none"
                      />
                      <button onClick={() => saveRename(layer.id)} className="text-[#00FFCC]">
                        <Check size={12} />
                      </button>
                    </div>
                  ) : (
                    <span
                      title={`${layer.name} (${layer.shape.type}) - Klik dua kali untuk edit bentuk`}
                      className="truncate text-[12px] font-mono flex-1"
                    >
                      {layer.name}
                    </span>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1">
                  <button
                    disabled={isTop}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveLayer(layer.id, "up");
                    }}
                    title="Bawa ke Atas"
                    className="p-1 text-[#666666] hover:text-white disabled:opacity-20"
                  >
                    <ChevronUp size={12} />
                  </button>

                  <button
                    disabled={isBottom}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveLayer(layer.id, "down");
                    }}
                    title="Bawa ke Bawah"
                    className="p-1 text-[#666666] hover:text-white disabled:opacity-20"
                  >
                    <ChevronDown size={12} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(layer.id, layer.name);
                    }}
                    title="Ganti Nama"
                    className="p-1 text-[#666666] hover:text-white"
                  >
                    <Edit2 size={11} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateLayer(layer.id);
                    }}
                    title="Duplikat Layer"
                    className="p-1 text-[#666666] hover:text-white"
                  >
                    <Copy size={11} />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLayer(layer.id);
                    }}
                    title="Hapus Layer"
                    className="p-1 text-[#666666] hover:text-[#FF4444]"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
