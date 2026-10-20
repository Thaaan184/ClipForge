import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { CartoonTextBox } from "./CartoonTextBox";
import { GunCutoutMascot } from "./GunCutoutMascot";

export interface MinimapRouteTrackerProps {
  active?: boolean;
  startFrame?: number;
  endFrame?: number;
}

const MAP_WIDTH = 560;
const MAP_HEIGHT = 560;
const MAP_LEFT = 40;
const MAP_TOP = 60;

// Exact trajectory waypoints matching user sketch (normalized 0 to 100 within minimap circle)
const WAYPOINTS = [
  { x: 14, y: 47 },
  { x: 26, y: 47 },
  { x: 28, y: 56 },
  { x: 35, y: 57 },
  { x: 36, y: 50 },
  { x: 44, y: 43 },
  { x: 51, y: 38 }, // Red X apex (Mid)
  { x: 55, y: 46 }, // East corridor descent
  { x: 55, y: 55 },
  { x: 48, y: 61 }, // Bottom bend
  { x: 43, y: 64 }, // Bypassing AWP box
  { x: 37, y: 64 }, // Next to AWP
  { x: 30, y: 63 }, // Looping west
  { x: 27, y: 56 }, // Back up
  { x: 26, y: 47 }, // Back to A Link
  { x: 14, y: 47 }, // Back to A Site
];

// Precomputed static SVG path string
const SVG_PATH =
  "M " +
  WAYPOINTS.map(
    (p) => `${(p.x * MAP_WIDTH) / 100},${(p.y * MAP_HEIGHT) / 100}`
  ).join(" L ");

// Target AWP position
const TARGET_X = (37.4 * MAP_WIDTH) / 100;
const TARGET_Y = (64.3 * MAP_HEIGHT) / 100;

export const MinimapRouteTracker: React.FC<MinimapRouteTrackerProps> = ({
  active = true,
  startFrame = 780,
  endFrame = 1680,
}) => {
  const frame = useCurrentFrame();

  if (!active || frame < startFrame || frame > endFrame) {
    return null;
  }

  // Stepped frame for cartoon animation
  const stepped = Math.floor(frame / 4);

  // Smooth path draw progress 0 to 1 from 00:13 (780) to 00:24 (1440)
  const drawProgress = interpolate(frame, [780, 1440], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Approximate current runner head position along waypoints
  const totalSegments = WAYPOINTS.length - 1;
  const currentSegFloat = drawProgress * totalSegments;
  const currentSegIdx = Math.min(
    Math.floor(currentSegFloat),
    totalSegments - 1
  );
  const segAlpha = currentSegFloat - currentSegIdx;
  const p0 = WAYPOINTS[currentSegIdx];
  const p1 = WAYPOINTS[currentSegIdx + 1];
  const headX = (p0.x + (p1.x - p0.x) * segAlpha) * (MAP_WIDTH / 100);
  const headY = (p0.y + (p1.y - p0.y) * segAlpha) * (MAP_HEIGHT / 100);

  // Target pulse
  const targetPulse = 1 + Math.sin(frame * 0.2) * 0.12;

  // Comic cues timing
  const isPassingAwp = frame >= 1080 && frame <= 1260; // 00:18 - 00:21
  const isWrongTurn = frame >= 1200 && frame <= 1400; // 00:20 - 00:23

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {/* Cartoon Halftone / Dark Comic Overlay outside minimap */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(10, 10, 18, 0.55)",
          maskImage: `radial-gradient(circle 300px at ${MAP_LEFT + MAP_WIDTH / 2}px ${
            MAP_TOP + MAP_HEIGHT / 2
          }px, transparent 82%, black 100%)`,
          WebkitMaskImage: `radial-gradient(circle 300px at ${
            MAP_LEFT + MAP_WIDTH / 2
          }px ${MAP_TOP + MAP_HEIGHT / 2}px, transparent 82%, black 100%)`,
        }}
      />

      {/* Comic Minimap Circular Frame */}
      <div
        style={{
          position: "absolute",
          left: MAP_LEFT,
          top: MAP_TOP,
          width: MAP_WIDTH,
          height: MAP_HEIGHT,
          borderRadius: "50%",
          border: "8px solid #000000",
          boxShadow: "0 0 0 6px #FFFFFF, 12px 12px 0px #000000",
        }}
      >
        {/* SVG Tracker Overlay */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
          }}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        >
          <defs>
            <filter id="handDrawn" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.04"
                numOctaves="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="3"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>

          {/* Running Trail Path - Black Base Line */}
          <path
            d={SVG_PATH}
            fill="none"
            stroke="#000000"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - drawProgress}
            filter="url(#handDrawn)"
          />

          {/* Running Trail Path - Inner White Dashes */}
          <path
            d={SVG_PATH}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="12 10"
            pathLength="1"
            strokeDashoffset={1 - drawProgress}
          />

          {/* Red Target Box (Position of AWP) matching user hand-drawn box */}
          <g
            transform={`translate(${TARGET_X}, ${TARGET_Y}) scale(${targetPulse})`}
          >
            {/* Wobbly hand-drawn red square */}
            <rect
              x="-24"
              y="-24"
              width="48"
              height="48"
              fill="rgba(255, 42, 42, 0.35)"
              stroke="#FF2A2A"
              strokeWidth="5"
              rx="6"
              filter="url(#handDrawn)"
            />
            {/* Inner crosshair */}
            <line x1="-16" y1="0" x2="16" y2="0" stroke="#FF2A2A" strokeWidth="3" />
            <line x1="0" y1="-16" x2="0" y2="16" stroke="#FF2A2A" strokeWidth="3" />
            {/* Pulsing Target Dot */}
            <circle cx="0" cy="0" r="6" fill="#FFDE00" stroke="#000000" strokeWidth="2" />
          </g>

          {/* Runner Head Indicator */}
          {drawProgress > 0 && drawProgress < 1 && (
            <g transform={`translate(${headX}, ${headY})`}>
              <circle
                r="12"
                fill="#FFDE00"
                stroke="#000000"
                strokeWidth="4"
              />
              <text
                x="0"
                y="5"
                textAnchor="middle"
                fontSize="14"
                fontWeight="900"
              >
                🏃
              </text>
            </g>
          )}
        </svg>

        {/* Comic Label on Target Box */}
        <div
          style={{
            position: "absolute",
            left: TARGET_X - 55,
            top: TARGET_Y + 32,
            backgroundColor: "#FF2A2A",
            color: "#FFFDF0",
            border: "3px solid #000000",
            boxShadow: "4px 4px 0px #000000",
            padding: "4px 10px",
            fontFamily: "'Bangers', 'Luckiest Guy', sans-serif",
            fontSize: 18,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            transform: `rotate(${stepped % 2 === 0 ? -3 : -1}deg)`,
          }}
        >
          📍 POSISI AWP
        </div>
      </div>

      {/* Top-Right: Gun Cutout Mascot Running with Sweat */}
      <div
        style={{
          position: "absolute",
          top: 90,
          right: 50,
          zIndex: 60,
        }}
      >
        <GunCutoutMascot
          mode="running"
          size={210}
          sweat={true}
          badgeText="OTAK SENKU: ON 🧠"
          subText="Amanin AWP bos!"
        />
      </div>

      {/* Comic Callout 1: 00:14 - 00:18 GAS AMANIN AWP */}
      {frame >= 840 && frame < 1080 && (
        <div
          style={{
            position: "absolute",
            top: MAP_TOP + MAP_HEIGHT + 30,
            left: 50,
            zIndex: 65,
          }}
        >
          <CartoonTextBox
            bg="#FFDE00"
            fontSize={36}
            rotation={-2}
            shadowOffset={6}
          >
            LARI KELILING MAP AMANIN AWP! 🏃‍♂️💨
          </CartoonTextBox>
        </div>
      )}

      {/* Comic Callout 2: 00:18 - 00:21 LEWAT DOANG ANJIR GAK DIAMBIL */}
      {isPassingAwp && (
        <div
          style={{
            position: "absolute",
            top: MAP_TOP + MAP_HEIGHT + 20,
            left: 40,
            zIndex: 70,
          }}
        >
          <CartoonTextBox
            bg="#FF2A2A"
            textColor="#FFFDF0"
            fontSize={38}
            rotation={3}
            shadowOffset={8}
            burst={true}
          >
            LEWAT DOANG ANJIR GAK DIAMBIL 💀⁉️
          </CartoonTextBox>
        </div>
      )}

      {/* Comic Callout 3: 00:20 - 00:24 SALAH MANUVER MAS (Bent sign style) */}
      {isWrongTurn && (
        <div
          style={{
            position: "absolute",
            top: MAP_TOP + MAP_HEIGHT + 110,
            left: 50,
            zIndex: 75,
          }}
        >
          <CartoonTextBox
            bg="#00E5FF"
            textColor="#000000"
            fontSize={34}
            rotation={-4}
            shadowOffset={6}
          >
            SALAH MANUVER MAS! 🔄🤣
          </CartoonTextBox>
        </div>
      )}
    </div>
  );
};
