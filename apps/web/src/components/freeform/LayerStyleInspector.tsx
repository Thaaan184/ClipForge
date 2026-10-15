import React from "react";
import {
  Sliders,
  Sun,
  Shield,
  Lock,
  Unlock,
  RefreshCw,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Maximize2,
} from "lucide-react";
import { useSceneStore } from "../../lib/scene/store";

export const LayerStyleInspector: React.FC = () => {
  const {
    scene,
    selectedLayerId,
    updateLayerTransform,
    updateLayerStyle,
    setBackground,
  } = useSceneStore();

  if (!scene) return null;

  const selectedLayer = scene.layers.find((l) => l.id === selectedLayerId);

  // Background editor when nothing is selected
  if (!selectedLayer) {
    const bg = scene.background;
    return (
      <div className="flex flex-col h-full bg-[#141414] border-l border-[#2A2A2A] w-64 p-3 select-none overflow-y-auto">
        <div className="flex items-center gap-1.5 text-xs font-mono text-[#AAAAAA] uppercase tracking-wider mb-4 border-b border-[#2A2A2A] pb-2">
          <Sun size={14} className="text-[#FF6A00]" />
          <span>Background</span>
        </div>

        <div className="space-y-4 text-xs font-mono">
          <div>
            <label className="text-[#888888] block mb-1">Tipe Background</label>
            <div className="grid grid-cols-3 gap-1">
              {(["blur_source", "solid", "gradient"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setBackground({ type: mode })}
                  className={`py-1 text-[11px] rounded border ${
                    bg.type === mode
                      ? "bg-[#FF6A00] text-black border-[#FF6A00] font-semibold"
                      : "bg-[#1E1E1E] text-[#888888] border-[#333333] hover:text-white"
                  }`}
                >
                  {mode === "blur_source" ? "Blur" : mode === "solid" ? "Warna" : "Gradasi"}
                </button>
              ))}
            </div>
          </div>

          {bg.type === "blur_source" && (
            <div>
              <div className="flex justify-between text-[#888888] mb-1">
                <span>Blur Sigma</span>
                <span>{bg.blur_sigma}px</span>
              </div>
              <input
                type="range"
                min={5}
                max={80}
                value={bg.blur_sigma}
                onChange={(e) => setBackground({ blur_sigma: Number(e.target.value) })}
                className="w-full accent-[#FF6A00]"
              />
            </div>
          )}

          {bg.type === "solid" && (
            <div>
              <label className="text-[#888888] block mb-1">Warna Latar</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bg.color}
                  onChange={(e) => setBackground({ color: e.target.value })}
                  className="w-8 h-8 rounded bg-transparent cursor-pointer border border-[#444444]"
                />
                <input
                  type="text"
                  value={bg.color}
                  onChange={(e) => setBackground({ color: e.target.value })}
                  className="bg-black border border-[#333333] rounded px-2 py-1 text-white text-xs w-24 outline-none font-mono"
                />
              </div>
            </div>
          )}

          {bg.type === "gradient" && (
            <div className="space-y-3">
              <div>
                <label className="text-[#888888] block mb-1">Warna Mulai</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bg.gradient?.stops[0] || "#111111"}
                    onChange={(e) =>
                      setBackground({
                        gradient: {
                          angle: bg.gradient?.angle || 0,
                          stops: [e.target.value, bg.gradient?.stops[1] || "#333333"],
                        },
                      })
                    }
                    className="w-8 h-8 rounded bg-transparent cursor-pointer border border-[#444444]"
                  />
                  <span className="text-[#888888]">{bg.gradient?.stops[0] || "#111111"}</span>
                </div>
              </div>

              <div>
                <label className="text-[#888888] block mb-1">Warna Selesai</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bg.gradient?.stops[1] || "#333333"}
                    onChange={(e) =>
                      setBackground({
                        gradient: {
                          angle: bg.gradient?.angle || 0,
                          stops: [bg.gradient?.stops[0] || "#111111", e.target.value],
                        },
                      })
                    }
                    className="w-8 h-8 rounded bg-transparent cursor-pointer border border-[#444444]"
                  />
                  <span className="text-[#888888]">{bg.gradient?.stops[1] || "#333333"}</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#888888] mb-1">
                  <span>Sudut Gradasi</span>
                  <span>{bg.gradient?.angle || 0}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={bg.gradient?.angle || 0}
                  onChange={(e) =>
                    setBackground({
                      gradient: {
                        angle: Number(e.target.value),
                        stops: bg.gradient?.stops || ["#111111", "#333333"],
                      },
                    })
                  }
                  className="w-full accent-[#FF6A00]"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Selected Layer Inspector
  const t = selectedLayer.transform;
  const s = selectedLayer.style;

  return (
    <div className="flex flex-col h-full bg-[#141414] border-l border-[#2A2A2A] w-64 p-3 select-none overflow-y-auto">
      <div className="flex items-center justify-between text-xs font-mono text-[#AAAAAA] uppercase tracking-wider mb-3 border-b border-[#2A2A2A] pb-2">
        <div className="flex items-center gap-1.5">
          <Sliders size={14} className="text-[#00FFCC]" />
          <span>Transform & Style</span>
        </div>
        <button
          onClick={() =>
            updateLayerTransform(selectedLayer.id, {
              cx: 540,
              cy: 960,
              rotation: 0,
            })
          }
          title="Reset Transform"
          className="text-[#666666] hover:text-white"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="space-y-4 text-xs font-mono">
        {/* Quick Alignment Actions */}
        <div>
          <span className="text-[10px] text-[#888888] uppercase block mb-1.5">Alignment / Posisi</span>
          <div className="grid grid-cols-4 gap-1 mb-2">
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { cx: Math.round(t.w / 2) })}
              title="Rata Kiri (Left)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#00FFCC] text-[#AAAAAA] rounded flex items-center justify-center transition"
            >
              <AlignStartHorizontal size={14} />
            </button>
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { cx: 540 })}
              title="Tengah Horizontal (Center X 540)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#00FFCC] text-[#AAAAAA] rounded flex items-center justify-center transition"
            >
              <AlignCenterHorizontal size={14} />
            </button>
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { cx: Math.round(1080 - t.w / 2) })}
              title="Rata Kanan (Right)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#00FFCC] text-[#AAAAAA] rounded flex items-center justify-center transition"
            >
              <AlignEndHorizontal size={14} />
            </button>
            <button
              onClick={() => {
                const aspect = t.w / Math.max(1, t.h);
                const newW = 1080;
                const newH = t.lock_aspect ? Math.round(1080 / aspect) : t.h;
                updateLayerTransform(selectedLayer.id, {
                  w: newW,
                  h: newH,
                  cx: 540,
                });
              }}
              title="Penuhi Lebar Kanvas (Fit Width 1080)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#00FFCC] text-[#AAAAAA] rounded flex items-center justify-center transition"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { cy: Math.round(t.h / 2) })}
              title="Rata Atas (Top)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#00FFCC] text-[#AAAAAA] rounded flex items-center justify-center transition"
            >
              <AlignStartVertical size={14} />
            </button>
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { cy: 960 })}
              title="Tengah Vertikal (Center Y 960)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#00FFCC] text-[#AAAAAA] rounded flex items-center justify-center transition"
            >
              <AlignCenterVertical size={14} />
            </button>
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { cy: Math.round(1920 - t.h / 2) })}
              title="Rata Bawah (Bottom)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#00FFCC] text-[#AAAAAA] rounded flex items-center justify-center transition"
            >
              <AlignEndVertical size={14} />
            </button>
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { cx: 540, cy: 960, rotation: 0 })}
              title="Pusat Kanvas Total (540:960)"
              className="p-1.5 bg-[#222222] hover:bg-[#333333] hover:text-[#FF6A00] text-[#AAAAAA] rounded flex items-center justify-center font-bold text-[9px] transition"
            >
              MID
            </button>
          </div>
        </div>

        {/* Transform: Position & Size */}
        <div>
          <span className="text-[10px] text-[#888888] uppercase block mb-1.5">Transformasi</span>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <span className="text-[10px] text-[#666666]">Pos X</span>
              <input
                type="number"
                value={t.cx}
                onChange={(e) => updateLayerTransform(selectedLayer.id, { cx: Number(e.target.value) })}
                className="w-full bg-black border border-[#333333] rounded px-1.5 py-1 text-white text-xs outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-[#666666]">Pos Y</span>
              <input
                type="number"
                value={t.cy}
                onChange={(e) => updateLayerTransform(selectedLayer.id, { cy: Number(e.target.value) })}
                className="w-full bg-black border border-[#333333] rounded px-1.5 py-1 text-white text-xs outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-[#666666]">Lebar (W)</span>
              <input
                type="number"
                value={t.w}
                onChange={(e) => updateLayerTransform(selectedLayer.id, { w: Math.max(40, Number(e.target.value)) })}
                className="w-full bg-black border border-[#333333] rounded px-1.5 py-1 text-white text-xs outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-[#666666]">Tinggi (H)</span>
              <input
                type="number"
                value={t.h}
                onChange={(e) => updateLayerTransform(selectedLayer.id, { h: Math.max(40, Number(e.target.value)) })}
                className="w-full bg-black border border-[#333333] rounded px-1.5 py-1 text-white text-xs outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-[#888888]">Kunci Aspek Rasio</span>
            <button
              onClick={() => updateLayerTransform(selectedLayer.id, { lock_aspect: !t.lock_aspect })}
              className={`p-1 rounded ${t.lock_aspect ? "text-[#00FFCC]" : "text-[#666666]"}`}
            >
              {t.lock_aspect ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          </div>

          <div>
            <div className="flex justify-between text-[#888888] mb-1">
              <span>Rotasi</span>
              <span>{t.rotation}°</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              value={t.rotation}
              onChange={(e) => updateLayerTransform(selectedLayer.id, { rotation: Number(e.target.value) })}
              className="w-full accent-[#00FFCC]"
            />
          </div>
        </div>

        {/* Styling: Opacity, Radius, Border */}
        <div className="border-t border-[#222222] pt-3">
          <span className="text-[10px] text-[#888888] uppercase block mb-1.5">Gaya Visual</span>

          {/* Opacity */}
          <div className="mb-2">
            <div className="flex justify-between text-[#888888] mb-1">
              <span>Opacity</span>
              <span>{Math.round(s.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(s.opacity * 100)}
              onChange={(e) => updateLayerStyle(selectedLayer.id, { opacity: Number(e.target.value) / 100 })}
              className="w-full accent-[#00FFCC]"
            />
          </div>

          {/* Corner Radius */}
          {selectedLayer.shape.type === "rect" && (
            <div className="mb-2">
              <div className="flex justify-between text-[#888888] mb-1">
                <span>Corner Radius</span>
                <span>{s.corner_radius}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={150}
                value={s.corner_radius}
                onChange={(e) => updateLayerStyle(selectedLayer.id, { corner_radius: Number(e.target.value) })}
                className="w-full accent-[#00FFCC]"
              />
            </div>
          )}

          {/* Border */}
          <div className="mb-2">
            <div className="flex justify-between text-[#888888] mb-1">
              <span>Tebal Border</span>
              <span>{s.border_width}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              value={s.border_width}
              onChange={(e) => updateLayerStyle(selectedLayer.id, { border_width: Number(e.target.value) })}
              className="w-full accent-[#00FFCC]"
            />
            {s.border_width > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={s.border_color}
                  onChange={(e) => updateLayerStyle(selectedLayer.id, { border_color: e.target.value })}
                  className="w-6 h-6 rounded bg-transparent cursor-pointer border border-[#444444]"
                />
                <span className="text-[#888888]">{s.border_color}</span>
              </div>
            )}
          </div>
        </div>

        {/* Drop Shadow */}
        <div className="border-t border-[#222222] pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[10px] text-[#888888] uppercase">
              <Shield size={12} />
              <span>Drop Shadow</span>
            </div>
            <input
              type="checkbox"
              checked={s.shadow?.enabled || false}
              onChange={(e) =>
                updateLayerStyle(selectedLayer.id, {
                  shadow: {
                    enabled: e.target.checked,
                    color: s.shadow?.color || "#000000",
                    alpha: s.shadow?.alpha || 0.5,
                    blur: s.shadow?.blur || 20,
                    offset_x: s.shadow?.offset_x || 0,
                    offset_y: s.shadow?.offset_y || 10,
                  },
                })
              }
              className="accent-[#00FFCC]"
            />
          </div>

          {s.shadow?.enabled && (
            <div className="space-y-2 pl-1">
              <div>
                <div className="flex justify-between text-[#888888] mb-1">
                  <span>Blur</span>
                  <span>{s.shadow.blur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={s.shadow.blur}
                  onChange={(e) =>
                    updateLayerStyle(selectedLayer.id, {
                      shadow: { ...s.shadow, blur: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#00FFCC]"
                />
              </div>

              <div>
                <div className="flex justify-between text-[#888888] mb-1">
                  <span>Offset Y</span>
                  <span>{s.shadow.offset_y}px</span>
                </div>
                <input
                  type="range"
                  min={-40}
                  max={60}
                  value={s.shadow.offset_y}
                  onChange={(e) =>
                    updateLayerStyle(selectedLayer.id, {
                      shadow: { ...s.shadow, offset_y: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-[#00FFCC]"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.shadow.color}
                  onChange={(e) =>
                    updateLayerStyle(selectedLayer.id, {
                      shadow: { ...s.shadow, color: e.target.value },
                    })
                  }
                  className="w-6 h-6 rounded bg-transparent cursor-pointer border border-[#444444]"
                />
                <span className="text-[#888888]">{s.shadow.color}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
