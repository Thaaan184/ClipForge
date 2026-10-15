import {
  Candidate,
  Clip,
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
      : stylePreset?.preset || "classic_white";

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
      : stylePreset?.preset || "classic_white";

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
