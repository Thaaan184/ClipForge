# Kontrak Komponen: Editorial Manifest (`manifest.json`)

## 1. Definisi & Tujuan
`manifest.json` adalah berkas konteks tunggal dan sumber kebenaran (single source of truth) yang ditempatkan di `{workspace}/context/manifest.json`. Berkas ini menyediakan metadata klip, transkripsi kata berbasis waktu, sinyal multimodal (audio, chat, heatmap peaks), jeda suara VAD (untuk ducking BGM), metadata evaluasi Scout, daftar aset pengguna, style pack, dan parameter batas aman tampilan (safe zone).

Semua nilai waktu (`start`, `end`, `t`) menggunakan satuan detik bilangan riil (float) yang **relatif terhadap awal klip** ($0.0 \le t \le \text{duration}$).

## 2. Skema JSON (`manifest_version: 1`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EditorialManifest",
  "type": "object",
  "required": [
    "manifest_version",
    "clip",
    "transcript",
    "signals",
    "scout",
    "assets",
    "style_pack",
    "script",
    "safe_zone"
  ],
  "properties": {
    "manifest_version": { "type": "integer", "enum": [1] },
    "clip": {
      "type": "object",
      "required": ["id", "source_job_id", "duration", "fps", "width", "height", "source_file"],
      "properties": {
        "id": { "type": "string" },
        "source_job_id": { "type": "string" },
        "duration": { "type": "number", "minimum": 0.1 },
        "fps": { "type": "integer", "enum": [30] },
        "width": { "type": "integer", "enum": [1080] },
        "height": { "type": "integer", "enum": [1920] },
        "source_file": { "type": "string" }
      }
    },
    "transcript": {
      "type": "object",
      "required": ["language", "words"],
      "properties": {
        "language": { "type": "string" },
        "words": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["w", "start", "end", "conf"],
            "properties": {
              "w": { "type": "string" },
              "start": { "type": "number", "minimum": 0.0 },
              "end": { "type": "number", "minimum": 0.0 },
              "conf": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
            }
          }
        }
      }
    },
    "signals": {
      "type": "object",
      "required": ["peaks", "vad_silences"],
      "properties": {
        "peaks": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["t", "score", "kinds"],
            "properties": {
              "t": { "type": "number", "minimum": 0.0 },
              "score": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
              "kinds": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        },
        "vad_silences": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["start", "end"],
            "properties": {
              "start": { "type": "number", "minimum": 0.0 },
              "end": { "type": "number", "minimum": 0.0 }
            }
          }
        }
      }
    },
    "scout": {
      "type": "object",
      "required": ["category", "title", "hook", "reason", "confidence"],
      "properties": {
        "category": { "type": "string" },
        "title": { "type": "string" },
        "hook": { "type": "string" },
        "reason": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
      }
    },
    "assets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "path", "label", "hint", "description", "duration", "bpm"],
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string", "enum": ["image", "audio", "video"] },
          "path": { "type": "string" },
          "label": { "type": "string" },
          "hint": { "type": "string" },
          "description": { "type": "string" },
          "duration": { "type": "number" },
          "bpm": { "type": ["number", "null"] }
        }
      }
    },
    "style_pack": { "type": "string" },
    "script": {
      "type": "object",
      "required": ["mode", "text"],
      "properties": {
        "mode": { "type": "string", "enum": ["none", "strict", "guide"] },
        "text": { "type": "string" }
      }
    },
    "safe_zone": {
      "type": "object",
      "required": ["top", "bottom", "left", "right"],
      "properties": {
        "top": { "type": "number", "default": 0.12 },
        "bottom": { "type": "number", "default": 0.20 },
        "left": { "type": "number", "default": 0.06 },
        "right": { "type": "number", "default": 0.12 }
      }
    }
  }
}
```

## 3. TypeScript Interface (`kit/types.ts` / worker)

```typescript
export interface ManifestWord {
  w: string;
  start: number;
  end: number;
  conf: number;
}

export interface ManifestPeak {
  t: number;
  score: number;
  kinds: string[];
}

export interface ManifestSilence {
  start: number;
  end: number;
}

export interface ManifestAsset {
  id: string;
  type: "image" | "audio" | "video";
  path: string;
  label: string;
  hint: string;
  description: string;
  duration: number;
  bpm: number | null;
}

export interface EditorialManifest {
  manifest_version: 1;
  clip: {
    id: string;
    source_job_id: string;
    duration: number;
    fps: 30;
    width: 1080;
    height: 1920;
    source_file: string;
  };
  transcript: {
    language: string;
    words: ManifestWord[];
  };
  signals: {
    peaks: ManifestPeak[];
    vad_silences: ManifestSilence[];
  };
  scout: {
    category: string;
    title: string;
    hook: string;
    reason: string;
    confidence: number;
  };
  assets: ManifestAsset[];
  style_pack: string;
  script: {
    mode: "none" | "strict" | "guide";
    text: string;
  };
  safe_zone: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}
```
