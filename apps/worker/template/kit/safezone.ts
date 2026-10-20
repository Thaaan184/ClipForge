/**
 * Safe Zone metrics and boundaries for 9:16 short-form video (TikTok, YouTube Shorts, Instagram Reels).
 * Resolution: 1080 x 1920.
 */

export interface SafeZoneBox {
  topPx: number;
  bottomPx: number;
  leftPx: number;
  rightPx: number;
  widthPx: number;
  heightPx: number;
}

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

// Standard 9:16 safezone percentages (ADR-008 & PLAN §7)
export const SAFEZONE_RATIOS = {
  top: 0.12,    // 230px
  bottom: 0.20, // 384px
  left: 0.06,   // 65px
  right: 0.12,  // 130px
};

export function getSafeZoneBounds(): SafeZoneBox {
  const topPx = Math.round(CANVAS_HEIGHT * SAFEZONE_RATIOS.top);
  const bottomPx = Math.round(CANVAS_HEIGHT * SAFEZONE_RATIOS.bottom);
  const leftPx = Math.round(CANVAS_WIDTH * SAFEZONE_RATIOS.left);
  const rightPx = Math.round(CANVAS_WIDTH * SAFEZONE_RATIOS.right);

  return {
    topPx,
    bottomPx,
    leftPx,
    rightPx,
    widthPx: CANVAS_WIDTH - leftPx - rightPx,
    heightPx: CANVAS_HEIGHT - topPx - bottomPx,
  };
}

export function getSafeZoneContainerStyle(): React.CSSProperties {
  const b = getSafeZoneBounds();
  return {
    position: "absolute",
    top: b.topPx,
    left: b.leftPx,
    width: b.widthPx,
    height: b.heightPx,
    pointerEvents: "none",
    boxSizing: "border-box",
  };
}
