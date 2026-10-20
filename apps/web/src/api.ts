import {
  Candidate,
  Clip,
  EditorialAsset,
  EditorialMessage,
  EditorialSession,
  EditorialStatus,
  EditorialVersion,
  FinishedClip,
  Job,
  JobParams,
  ManualClipSegment,
  SceneGraph,
  ScenePreset,
  SubtitleTrack,
  SubtitleWord,
  TimelineData,
} from "./types";

const API_BASE = "";

export function getYoutubeThumbnail(videoId?: string | null, sourceUrl?: string | null): string | null {
  if (videoId && videoId.length === 11) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  if (sourceUrl) {
    const match = sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) {
      return `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`;
    }
  }
  return null;
}

export function getClipThumbUrl(clipId: string): string {
  return `${API_BASE}/api/clips/${clipId}/thumb`;
}

export async function createJob(
  sourceUrl: string,
  genre = "gaming",
  language = "id",
  params?: JobParams
): Promise<Job> {
  const payload: any = {
    source_url: sourceUrl,
    genre,
    language,
    ...(params || {}),
    params,
  };
  const res = await fetch(`${API_BASE}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create job" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function createManualJob(
  sourceUrl: string,
  clipsOrStart: string | number | ManualClipSegment[],
  endTime?: string | number,
  options?: {
    title?: string;
    reframe_mode?: string;
    subtitle_style?: string;
    subtitle_position?: string;
    language?: string;
  }
): Promise<Job> {
  const payload: any = {
    source_url: sourceUrl,
    reframe_mode: options?.reframe_mode || "blur",
    subtitle_style: options?.subtitle_style || "none",
    subtitle_position: options?.subtitle_position || "bottom",
    language: options?.language || "id",
  };

  if (Array.isArray(clipsOrStart)) {
    payload.clips = clipsOrStart;
  } else {
    payload.start_time = clipsOrStart;
    payload.end_time = endTime;
    payload.title = options?.title || undefined;
  }

  const res = await fetch(`${API_BASE}/api/jobs/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create manual clip job" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function addManualClipsToJob(
  jobId: string,
  clips: ManualClipSegment[],
  options?: {
    reframe_mode?: string;
    subtitle_style?: string;
    subtitle_position?: string;
  }
): Promise<{ status: string; job_id: string; clips_count: number; message: string }> {
  const payload = {
    clips,
    reframe_mode: options?.reframe_mode,
    subtitle_style: options?.subtitle_style,
    subtitle_position: options?.subtitle_position,
  };
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/manual-clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to add manual clips to job" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch job ${jobId}`);
  }
  return res.json();
}

export async function listJobs(limit = 10): Promise<Job[]> {
  const res = await fetch(`${API_BASE}/api/jobs?limit=${limit}`);
  if (!res.ok) {
    throw new Error("Failed to list jobs");
  }
  return res.json();
}

export async function getJobClips(
  jobId: string
): Promise<{ clips: Clip[]; total: number }> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/clips`);
  if (!res.ok) {
    throw new Error(`Failed to fetch clips for job ${jobId}`);
  }
  return res.json();
}


export async function cancelJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to cancel job ${jobId}`);
  }
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete job ${jobId}`);
  }
}

export async function getTimeline(jobId: string): Promise<TimelineData> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/timeline`);
  if (!res.ok) {
    throw new Error(`Failed to fetch timeline for job ${jobId}`);
  }
  return res.json();
}

export async function getCandidates(
  jobId: string
): Promise<{ candidates: Candidate[]; total: number }> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/candidates`);
  if (!res.ok) {
    throw new Error(`Failed to fetch candidates for job ${jobId}`);
  }
  return res.json();
}

export async function updateCandidate(
  candidateId: string,
  payload: {
    status?: "proposed" | "kept" | "rejected";
    user_start_s?: number;
    user_end_s?: number;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/jobs/candidates/${candidateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to update candidate ${candidateId}`);
  }
}

export async function triggerRender(
  jobId: string,
  payload?: {
    candidate_ids?: string[];
    reframe_mode?: string;
    subtitle_style?: string;
    subtitle_position?: string;
  }
): Promise<{ status: string; job_id: string; message?: string }> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to trigger render" }));
    throw new Error(err.detail || `Failed to trigger render for job ${jobId}`);
  }
  return res.json();
}

export async function getClip(clipId: string): Promise<Clip> {
  const res = await fetch(`${API_BASE}/api/clips/${clipId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch clip ${clipId}`);
  }
  return res.json();
}

export async function getClipSubtitles(clipId: string): Promise<SubtitleTrack> {
  const res = await fetch(`${API_BASE}/api/clips/${clipId}/subtitles`);
  if (!res.ok) {
    throw new Error(`Failed to fetch subtitles for clip ${clipId}`);
  }
  return res.json();
}

export async function updateClipSubtitles(
  clipId: string,
  words: SubtitleWord[],
  stylePreset: string | { preset?: string },
  subtitlePosition = "bottom"
): Promise<{ revision: number }> {
  const presetStr =
    typeof stylePreset === "string"
      ? stylePreset
      : stylePreset?.preset || "none";

  const res = await fetch(`${API_BASE}/api/clips/${clipId}/subtitles`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      words,
      style_preset: presetStr,
      subtitle_position: subtitlePosition,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update subtitles for clip ${clipId}`);
  }
  return res.json();
}

export async function previewSubtitleFrame(
  clipId: string,
  t_s: number,
  stylePreset: string | { preset?: string },
  reframeMode = "blur",
  words?: SubtitleWord[],
  subtitlePosition = "bottom"
): Promise<Blob> {
  const presetStr =
    typeof stylePreset === "string"
      ? stylePreset
      : stylePreset?.preset || "none";

  const res = await fetch(`${API_BASE}/api/clips/${clipId}/subtitles/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      t_s,
      style_preset: presetStr,
      reframe_mode: reframeMode,
      words,
      subtitle_position: subtitlePosition,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to render subtitle frame preview`);
  }
  return res.blob();
}

export async function rerenderClip(
  clipId: string,
  options?: {
    reframe_mode?: string;
    subtitle_style?: string;
    subtitle_position?: string;
  }
): Promise<Clip> {
  const res = await fetch(`${API_BASE}/api/clips/${clipId}/rerender`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    throw new Error(`Failed to rerender clip ${clipId}`);
  }
  return res.json();
}

export async function saveFinishedClip(clipId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/clips/${clipId}/save`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to save finished clip ${clipId}`);
  }
  return res.json();
}

export async function listFinishedClips(): Promise<FinishedClip[]> {
  const res = await fetch(`${API_BASE}/api/clips/finished`);
  if (!res.ok) {
    throw new Error(`Failed to list finished clips`);
  }
  return res.json();
}

export async function deleteFinishedClip(clipId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/clips/finished/${clipId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete finished clip ${clipId}`);
  }
  return res.json();
}

export async function listAllClips(limit = 50): Promise<Clip[]> {
  const res = await fetch(`${API_BASE}/api/clips?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to list all clips`);
  }
  return res.json();
}

// -------------------------------------------------------------
// Freeform Canvas Studio APIs
// -------------------------------------------------------------

export function getSegmentProxyUrl(segmentId: string): string {
  return `${API_BASE}/api/segments/${segmentId}/proxy`;
}

export async function createJobSegment(
  jobId: string,
  start_s: number,
  end_s: number
): Promise<{ segment_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}/segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_s, end_s }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to prepare segment" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getSegmentInfo(segmentId: string): Promise<{
  segment_id: string;
  status: string;
  full_width?: number;
  full_height?: number;
  proxy_width?: number;
  proxy_height?: number;
  fps?: number;
  duration_s?: number;
  padding_before?: number;
  error?: string | null;
}> {
  const res = await fetch(`${API_BASE}/api/segments/${segmentId}`);
  if (!res.ok) {
    throw new Error(`Failed to get segment info for ${segmentId}`);
  }
  return res.json();
}

export async function getCandidateScene(candidateId: string): Promise<SceneGraph> {
  const res = await fetch(`${API_BASE}/api/jobs/candidates/${candidateId}/scene`);
  if (!res.ok) {
    throw new Error(`Failed to get candidate scene`);
  }
  return res.json();
}

export async function saveCandidateScene(
  candidateId: string,
  scene: SceneGraph
): Promise<SceneGraph> {
  const res = await fetch(`${API_BASE}/api/jobs/candidates/${candidateId}/scene`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scene),
  });
  if (!res.ok) {
    let msg = `Gagal menyimpan kanvas (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") {
        msg = err.detail;
      } else if (Array.isArray(err.detail)) {
        msg = err.detail.map((d: any) => `${d.loc?.slice(-1)[0] || "field"}: ${d.msg}`).join("; ");
      } else if (err.detail) {
        msg = JSON.stringify(err.detail);
      }
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function getScenePresets(): Promise<ScenePreset[]> {
  const res = await fetch(`${API_BASE}/api/presets/scenes`);
  if (!res.ok) {
    throw new Error("Gagal mengambil daftar preset kanvas");
  }
  return res.json();
}

export async function createScenePreset(
  name: string,
  scene: SceneGraph
): Promise<ScenePreset> {
  const res = await fetch(`${API_BASE}/api/presets/scenes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, scene }),
  });
  if (!res.ok) {
    let msg = `Gagal membuat preset (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") msg = err.detail;
      else if (Array.isArray(err.detail)) msg = err.detail.map((d: any) => d.msg).join("; ");
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function updateScenePreset(
  presetId: string,
  scene: SceneGraph,
  name?: string
): Promise<ScenePreset> {
  const res = await fetch(`${API_BASE}/api/presets/scenes/${presetId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, scene }),
  });
  if (!res.ok) {
    let msg = `Gagal memperbarui preset (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") msg = err.detail;
      else if (Array.isArray(err.detail)) msg = err.detail.map((d: any) => d.msg).join("; ");
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteScenePreset(presetId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/presets/scenes/${presetId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Gagal menghapus preset");
  }
}

export async function updateCandidateRenderMode(
  candidateId: string,
  renderMode: "preset" | "freeform"
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/jobs/candidates/${candidateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ render_mode: renderMode }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update candidate render mode`);
  }
}


export function getClipVideoUrl(clipId: string): string {
  return `${API_BASE}/api/clips/${clipId}/video`;
}

export function getClipSrtUrl(clipId: string): string {
  return `${API_BASE}/api/clips/${clipId}/subtitles.srt`;
}

export function getFinishedClipVideoUrl(clipId: string): string {
  return `${API_BASE}/api/clips/finished/${clipId}/video`;
}

export function getFinishedClipSrtUrl(clipId: string): string {
  return `${API_BASE}/api/clips/finished/${clipId}/srt`;
}

export function getEditorialSourceUrl(clipId: string): string {
  return `${API_BASE}/api/clips/${clipId}/editorial-source`;
}

export async function getEditorialSourceMeta(clipId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/clips/${clipId}/editorial-source/meta`);
  if (!res.ok) {
    throw new Error(`Failed to fetch editorial source meta for clip ${clipId}`);
  }
  return res.json();
}

export async function requestEditorialSource(clipId: string, reframeMode = "blur"): Promise<any> {
  const res = await fetch(`${API_BASE}/api/clips/${clipId}/editorial-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reframe_mode: reframeMode }),
  });
  if (!res.ok) {
    throw new Error(`Failed to generate editorial source for clip ${clipId}`);
  }
  return res.json();
}

// ---------------------------------------------------------
// Editorial Studio API Client (v3 P3)
// ---------------------------------------------------------

export async function createEditorialSession(
  clipId: string,
  stylePack = "gaming_hype"
): Promise<EditorialSession> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clip_id: clipId, style_pack: stylePack }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal membuat sesi editorial untuk klip ${clipId}`);
  }
  return res.json();
}

export async function getEditorialSession(sessionId: string): Promise<EditorialSession> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal memuat sesi editorial ${sessionId}`);
  }
  return res.json();
}

export async function getEditorialStatus(sessionId: string): Promise<EditorialStatus> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal memeriksa status sesi editorial ${sessionId}`);
  }
  return res.json();
}

export async function listEditorialAssets(sessionId: string): Promise<EditorialAsset[]> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/assets`);
  if (!res.ok) {
    throw new Error(`Gagal memuat daftar aset sesi ${sessionId}`);
  }
  return res.json();
}

export async function uploadEditorialAsset(
  sessionId: string,
  file: File,
  label = "",
  hint = ""
): Promise<EditorialAsset> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("label", label);
  formData.append("hint", hint);

  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/assets`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal mengunggah aset ${file.name}`);
  }
  return res.json();
}

export async function updateEditorialAsset(
  sessionId: string,
  assetId: string,
  payload: { label?: string; hint?: string }
): Promise<EditorialAsset> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/assets/${assetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal memperbarui metadata aset ${assetId}`);
  }
  return res.json();
}

export async function deleteEditorialAsset(
  sessionId: string,
  assetId: string
): Promise<{ success: boolean; asset_id: string }> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/assets/${assetId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal menghapus aset ${assetId}`);
  }
  return res.json();
}

export function getEditorialAssetFileUrl(sessionId: string, assetId: string): string {
  return `${API_BASE}/api/editorial/sessions/${sessionId}/assets/${assetId}/file`;
}

export async function listEditorialVersions(sessionId: string): Promise<EditorialVersion[]> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/versions`);
  if (!res.ok) {
    throw new Error(`Gagal memuat riwayat versi sesi ${sessionId}`);
  }
  return res.json();
}

export async function restoreEditorialVersion(
  sessionId: string,
  versionNum: number
): Promise<{ success: boolean; session_id: string; restored_version: number }> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/versions/${versionNum}/restore`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal me-restore versi ${versionNum}`);
  }
  return res.json();
}

export async function renderEditorialPreview(sessionId: string): Promise<{ success: boolean; preview_path: string }> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/preview`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal merender video pratinjau editorial`);
  }
  return res.json();
}

export async function renderEditorialFinal(sessionId: string): Promise<{ success: boolean; render_id: string }> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/render-final`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal memulai render final editorial`);
  }
  return res.json();
}

export function getEditorialPreviewVideoUrl(sessionId: string): string {
  return `${API_BASE}/api/editorial/sessions/${sessionId}/preview.mp4`;
}

export function getEditorialFinalVideoUrl(sessionId: string): string {
  return `${API_BASE}/api/editorial/sessions/${sessionId}/final.mp4`;
}

export async function listEditorialMessages(sessionId: string): Promise<EditorialMessage[]> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/messages`);
  if (!res.ok) {
    throw new Error(`Gagal memuat riwayat percakapan editorial`);
  }
  return res.json();
}

export async function sendEditorialMessage(
  sessionId: string,
  text: string,
  mode = "chat",
  timestamps?: string[]
): Promise<EditorialMessage> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode, timestamps }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal mengirim pesan`);
  }
  return res.json();
}

export async function runEditorialAutopilot(sessionId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/autopilot`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal menjalankan autopilot editorial`);
  }
  return res.json();
}

export async function getEditorialCode(sessionId: string): Promise<{ session_id: string; path: string; code: string }> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/code`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal memuat kode komposisi`);
  }
  return res.json();
}

export async function updateEditorialCode(sessionId: string, code: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/editorial/sessions/${sessionId}/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal menyimpan kode komposisi`);
  }
  return res.json();
}


