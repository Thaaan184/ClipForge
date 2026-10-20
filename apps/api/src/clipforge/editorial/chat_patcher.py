"""Chat-Edit Patch Engine for ClipForge v3 P5.

Translates natural language instructions and quick chips into targeted code patches:
- Quick chips: 'Lebih rame', 'Lebih clean', 'Caption lebih besar', 'Ganti musik', 'Zoom lebih sering'.
- Timestamped edits: Scopes changes strictly within [t - 3s, t + 3s], leaving other frames untouched.
- Enforces strict leak-guard check and worker typecheck before git commit.
"""

import json
import re
from pathlib import Path
from typing import Any
import structlog
from openai import AsyncOpenAI

from clipforge.core.config import settings
from clipforge.editorial.leak_guard import scan_code_string
from clipforge.editorial.worker_client import worker_client
from clipforge.editorial.workspace import commit_workspace_version

logger = structlog.get_logger(__name__)


def parse_timestamp_from_text(text: str) -> float | None:
    """Parse timecode like [00:04.2] or 00:04 into seconds."""
    match = re.search(r"\[?(\d{1,2}):(\d{2})(?:\.(\d+))?\]?", text)
    if not match:
        return None
    mins = int(match.group(1))
    secs = int(match.group(2))
    ms = float("0." + match.group(3)) if match.group(3) else 0.0
    return mins * 60 + secs + ms


def apply_code_patch(code: str, old_str: str, new_str: str) -> str:
    """Safely apply text replacement if old string exists."""
    if old_str in code:
        return code.replace(old_str, new_str, 1)
    return code


def patch_composition_code(
    code: str,
    instruction: str,
    target_timestamp_s: float | None = None,
    fps: int = 30,
) -> tuple[str, str]:
    """Determine and apply minimal targeted TSX patch based on instruction."""
    inst_lower = instruction.lower()
    summary = "Perubahan komposisi berdasarkan instruksi chat"

    # 1. Timestamp-scoped edit
    t_parsed = parse_timestamp_from_text(instruction)
    t_sec = target_timestamp_s if target_timestamp_s is not None else t_parsed
    if t_sec is not None:
        start_frame = max(0, int((t_sec - 1.5) * fps))
        end_frame = int((t_sec + 1.5) * fps)
        summary = f"Efek lokal di jendela [{t_sec:.1f}s ± 1.5s]"

        # Check if instruction is to delete/remove something at this timestamp
        if "hapus" in inst_lower or "hilangkan" in inst_lower:
            # Comment out or remove element in this window
            scoped_removal = f"{{/* Removed around {t_sec}s */}}"
            summary = f"Penghapusan elemen di [{t_sec:.1f}s]"
            return code, summary

        # Otherwise insert localized highlight or callout
        scoped_callout = f"""
      {{/* Localized punch highlight at [{t_sec:.1f}s] */}}
      {{frame >= {start_frame} && frame <= {end_frame} && (
        <div style={{{{ position: "absolute", bottom: 420, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 40 }}}}>
          <CartoonTextBox bg="#00E5FF" textColor="#000" fontSize={{32}} borderWidth={{4}} shadowOffset={{5}}>
            PUNCAK MOMEN!
          </CartoonTextBox>
        </div>
      )}}
"""
        # Inject right before subtitles
        if "<KineticCaptions" in code:
            code = code.replace("<KineticCaptions", f"{scoped_callout}\n      <KineticCaptions", 1)
        elif "</AbsoluteFill>" in code:
            code = code.replace("</AbsoluteFill>", f"{scoped_callout}\n    </AbsoluteFill>", 1)
        return code, summary

    # 2. "Caption lebih besar"
    if "caption lebih besar" in inst_lower or "perbesar subtitle" in inst_lower or "font lebih besar" in inst_lower:
        summary = "Ukuran caption diperbesar"
        code = re.sub(r'fontSize=\{[0-9]+\}', 'fontSize={46}', code)
        if 'fontSize' not in code and '<KineticCaptions' in code:
            code = code.replace('<KineticCaptions', '<KineticCaptions fontSize={46}', 1)
        return code, summary

    # 3. "Caption lebih kecil"
    if "caption lebih kecil" in inst_lower or "perkecil subtitle" in inst_lower:
        summary = "Ukuran caption diperkecil"
        code = re.sub(r'fontSize=\{[0-9]+\}', 'fontSize={28}', code)
        return code, summary

    # 4. "Lebih rame"
    if "lebih rame" in inst_lower or "tambah efek" in inst_lower or "heboh" in inst_lower:
        summary = "Meningkatkan intensitas efek visual (zoom & screen shake)"
        code = re.sub(r'zoomFactor=\{[0-9\.]+\}', 'zoomFactor={1.28}', code)
        code = re.sub(r'zoom=\{[0-9\.]+\}', 'zoom={1.28}', code)
        code = re.sub(r'intensity=\{[0-9]+\}', 'intensity={26}', code)
        return code, summary

    # 5. "Lebih clean"
    if "lebih clean" in inst_lower or "kurangi efek" in inst_lower or "bersih" in inst_lower:
        summary = "Gaya disetel lebih clean dan minimalis"
        code = re.sub(r'intensity=\{[0-9]+\}', 'intensity={0}', code)
        code = re.sub(r'zoomFactor=\{[0-9\.]+\}', 'zoomFactor={1.08}', code)
        code = re.sub(r'zoom=\{[0-9\.]+\}', 'zoom={1.08}', code)
        return code, summary

    # 6. "Zoom lebih sering"
    if "zoom lebih sering" in inst_lower or "tambah zoom" in inst_lower or "punch zoom" in inst_lower:
        summary = "Meningkatkan frekuensi dan pembesaran punch zoom"
        code = re.sub(r'zoomFactor=\{[0-9\.]+\}', 'zoomFactor={1.24}', code)
        code = re.sub(r'zoom=\{[0-9\.]+\}', 'zoom={1.24}', code)
        return code, summary

    # 7. "Ganti musik"
    if "ganti musik" in inst_lower or "ganti backsound" in inst_lower:
        summary = "Musik latar diganti"
        code = re.sub(r'baseVolume=\{[0-9\.]+\}', 'baseVolume={0.30}', code)
        if 'bgm.mp3' in code:
            code = code.replace('bgm.mp3', 'bgm_alt.mp3')
        elif 'music.mp3' in code:
            code = code.replace('music.mp3', 'music_alt.mp3')
        return code, summary

    # 8. "Ducking musik lebih halus" / audio ducking
    if "ducking" in inst_lower or "suara musik" in inst_lower:
        summary = "Menyesuaikan level ducking musik latar"
        code = re.sub(r'duckedVolume=\{[0-9\.]+\}', 'duckedVolume={0.06}', code)
        return code, summary

    # 9. "Hapus b-roll"
    if "hapus b-roll" in inst_lower or "hilangkan b-roll" in inst_lower:
        summary = "Menghapus layer B-roll video overlay"
        code = re.sub(r'\{\/\* User Image Asset.*?\)\}\s*\}', '{/* B-roll removed */}', code, flags=re.DOTALL)
        return code, summary

    return code, summary


async def llm_chat_edit(
    workspace_dir: Path,
    instruction: str,
    timestamps: list[str] | None = None,
) -> dict[str, Any] | None:
    """Invoke LLM for conversational discussion or TSX code composition generation."""
    if not settings.llm_base_url:
        return None

    comp_path = workspace_dir / "src" / "Composition.tsx"
    orig_code = comp_path.read_text(encoding="utf-8") if comp_path.exists() else ""
    manifest_path = workspace_dir / "context" / "manifest.json"
    manifest_info = ""
    assets_list: list[dict[str, Any]] = []
    if manifest_path.exists():
        try:
            m = json.loads(manifest_path.read_text(encoding="utf-8"))
            clip = m.get("clip", {})
            words = m.get("transcript", {}).get("words", [])
            peaks = m.get("signals", {}).get("peaks", [])
            assets_list = m.get("assets", [])
            manifest_info = (
                f"Durasi: {clip.get('duration_s', 40)}s ({clip.get('fps', 30)} FPS). "
                f"Jumlah kata transkrip: {len(words)}. Sinyal puncak: {peaks[:8]}."
            )
            if words:
                word_samples = [
                    f"'{w.get('w') or w.get('text')}' ({(w.get('start') or w.get('start_s', 0)):.1f}s-{(w.get('end') or w.get('end_s', 0)):.1f}s)"
                    for w in words[:25]
                    if w.get('w') or w.get('text')
                ]
                manifest_info += f"\nTranskrip kata: {', '.join(word_samples)}"
        except Exception:
            pass

    # Read uploaded assets and inspect text/markdown documents for AI context
    assets_info: list[str] = []
    documents_context: list[str] = []
    pub_assets = workspace_dir / "public" / "assets"
    if pub_assets.exists():
        for f in sorted(pub_assets.iterdir()):
            if f.is_file():
                match_asset = next(
                    (a for a in assets_list if Path(a.get("path", "")).name == f.name),
                    None,
                )
                label = (match_asset.get("label") if match_asset else "") or f.stem
                asset_type = (
                    match_asset.get("type")
                    if match_asset
                    else ("document" if f.suffix.lower() in (".txt", ".md") else "media")
                )
                rel_path = f"assets/{f.name}"

                if f.suffix.lower() in (".txt", ".md") or asset_type == "document":
                    try:
                        doc_text = f.read_text(encoding="utf-8")
                    except Exception:
                        try:
                            doc_text = f.read_text(encoding="latin-1")
                        except Exception:
                            doc_text = ""
                    if len(doc_text) > 25000:
                        doc_text = doc_text[:25000] + "\n...(dipotong karena melebihi 25.000 karakter)"

                    documents_context.append(
                        f"=== DOKUMEN ASET @{label} (berkas: {rel_path}) ===\n{doc_text}\n=== AKHIR DOKUMEN @{label} ==="
                    )
                    assets_info.append(f"- @{label} [Dokumen Teks]: {rel_path} ({len(doc_text)} karakter)")
                else:
                    assets_info.append(f"- @{label} [{asset_type}]: {rel_path}")

    system_prompt = (
        "Kamu adalah Lead Video Editor AI untuk ClipForge Editorial Studio. "
        "Gaya bicaramu: Profesional, solutif, taktis, bersahabat, dan santai seperti rekan editor berpengalaman.\n"
        "Aturan Penting:\n"
        "1. DILARANG KERAS menyuruh pengguna menjalankan perintah terminal / CLI (seperti 'npx remotion preview', 'npx remotion render', 'npm install', 'simpan file ke src/...'). Pengguna sedang berada di antarmuka web GUI ClipForge Studio. Segala penyimpanan file, kompilasi TypeScript, dan rendering video dijalankan otomatis oleh sistem backend.\n"
        "2. Pengguna dapat melampirkan berkas teks/markdown (.txt, .md) sebagai aset (seperti skrip naskah, beat sheet, narasi, petunjuk editing) dan memanggilnya di chat menggunakan format '@nama_label' (misal: @script, @narasi, @brief).\n"
        "3. Jika pengguna meminta revisi bertahap (seperti menghapus teks tertentu, mengganti tone, merapikan styling, atau meminimalkan subtitle): EDIT kode yang ada di '[src/Composition.tsx Saat Ini]'. JANGAN me-reset atau mengembalikan ke template awal yang membatalkan revisi sebelumnya!\n"
        "4. JIKA PENGGUNA MEMBERIKAN BRIEF / MEMINTA EKSEKUSI ('eksekusi', 'edit berdasarkan brief', 'sesuaikan dengan brief', 'buat semirip mungkin'): JANGAN basa-basi berbelit-belit. LANGSUNG buat kode implementasi lengkap 'src/Composition.tsx' di dalam blok ```tsx ... ``` yang menerapkan adegan, teks, timing kamera, dan efek sesuai brief tersebut.\n"
        "5. DILARANG menggunakan network calls atau 'fetch()' di dalam kode Remotion. Jangan membuat helper probe yang memanggil fetch().\n"
        "6. Untuk aset grafis/meme/audio: JANGAN memanggil <Img> atau <Audio> ke file yang tidak ada di daftar aset workspace public, karena Remotion renderer akan crash (HTTP 404). Gunakan fallback native SVG transparan atau emoji bersih TANPA border/background box yang mengganggu.\n"
        "7. Komposisi utama wajib diekspor sebagai 'export const EditorialComposition: React.FC = () => { ... }' dan 'export default EditorialComposition;' agar dapat dimuat oleh Remotion Root.\n"
        "8. Kode TSX wajib valid Remotion vertikal 9:16 (1080x1920, 30fps), dilarang menggunakan process.env / child_process / eval / dynamic import.\n"
        "9. Selalu jelaskan alasan dan ringkasan revisi yang kamu lakukan secara singkat dan jelas."
    )

    user_prompt = f"Pesan Pengguna: {instruction}\n"
    if timestamps:
        user_prompt += f"Timestamp terkait: {', '.join(timestamps)}\n"
    if manifest_info:
        user_prompt += f"\n[Konteks Klip]\n{manifest_info}\n"
    if assets_info:
        user_prompt += f"\n[Daftar Aset Terlampir di Workspace]:\n" + "\n".join(assets_info) + "\n"
    if documents_context:
        user_prompt += f"\n[Isi Berkas Dokumen Aset (.txt/.md) yang Dipanggil/Terlampir]:\n" + "\n\n".join(documents_context) + "\n"
    if orig_code:
        user_prompt += f"\n[src/Composition.tsx Saat Ini]\n```tsx\n{orig_code}\n```\n"

    try:
        client = AsyncOpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key or "sk-dummy",
        )
        model_name = settings.llm_model or "ag/gemini-3.8-flash"
        resp = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=4000,
            temperature=0.7,
        )
        content = resp.choices[0].message.content or ""
        return {"content": content, "orig_code": orig_code}
    except Exception as exc:
        logger.warning("llm_chat_edit_failed", error=str(exc))
        return None


async def execute_chat_edit(
    workspace_dir: Path,
    instruction: str,
    timestamps: list[str] | None = None,
) -> dict[str, Any]:
    """Execute a single chat-edit turn with LLM assistant, leak-guard, typecheck, and git commit."""
    comp_path = workspace_dir / "src" / "Composition.tsx"
    if not comp_path.exists():
        return {"success": False, "error": "src/Composition.tsx tidak ditemukan di workspace."}

    orig_code = comp_path.read_text(encoding="utf-8")
    t_sec = parse_timestamp_from_text(timestamps[0]) if timestamps else None

    # 1. Try LLM first if configured
    llm_res = await llm_chat_edit(workspace_dir, instruction, timestamps)
    if llm_res and llm_res.get("content"):
        reply_content = llm_res["content"]

        # Check if LLM outputted a full replacement code block for Composition.tsx
        code_match = re.search(
            r"```(?:tsx|typescript|jsx|javascript)?\s*(import\s+React.*?export\s+const\s+EditorialComposition.*?)\s*```",
            reply_content,
            re.DOTALL,
        )
        if not code_match:
            # Fallback pattern for any valid full TSX export
            code_match = re.search(
                r"```(?:tsx|typescript)?\s*(import\s+React.*?export\s+const.*?)\s*```",
                reply_content,
                re.DOTALL,
            )

        if code_match:
            new_code = code_match.group(1).strip()

            # Auto-sanitize any probe helper using fetch(staticFile(...))
            if "fetch(staticFile(" in new_code:
                new_code = re.sub(
                    r"const probe = async \(.*?\).*?return.*?\n\};",
                    "const AVAILABLE_ASSETS: Record<string, boolean> = { 'preview.mp4': true, 'clip_source.mp4': true };",
                    new_code,
                    flags=re.DOTALL,
                )
                new_code = re.sub(
                    r"Promise\.all\(MANIFEST\.map\(async \(p\) => \[p, await probe\(p\)\] as const\)\)\.then\(.*?\);",
                    "setFound(AVAILABLE_ASSETS); setLoaded(true);",
                    new_code,
                    flags=re.DOTALL,
                )

            # Ensure EditorialComposition export exists for Remotion Root
            if "export const EditorialComposition" not in new_code and "EditorialComposition" not in new_code:
                fc_match = re.search(r"export\s+const\s+([A-Za-z0-9_]+)\s*:\s*React\.FC", new_code)
                if fc_match:
                    main_name = fc_match.group(1)
                    new_code += f"\n\nexport const EditorialComposition: React.FC = {main_name};\nexport default EditorialComposition;\n"

            errors = scan_code_string(new_code, "src/Composition.tsx")
            if not errors:
                comp_path.write_text(new_code, encoding="utf-8")
                tc = await worker_client.typecheck(workspace_dir)
                if tc.get("success"):
                    commit_sha = commit_workspace_version(
                        workspace_dir, f"chat-edit AI: {instruction[:60]}"
                    )
                    clean_reply = re.sub(
                        r"```(?:tsx|typescript|jsx|javascript)?\s*import\s+React.*?```",
                        "*(Kode komposisi diperbarui)*",
                        reply_content,
                        flags=re.DOTALL,
                    ).strip()
                    # Strip out any lingering terminal CLI instructions
                    clean_reply = re.sub(r"(?i)Langkah\s+render\s+preview:?.*?(?=\n\n|$)", "", clean_reply, flags=re.DOTALL).strip()
                    clean_reply = re.sub(r"(?i)(?:Jalankan|Buka)\s+.*?(?:npx remotion|npm run).*?(?=\n|$)", "", clean_reply).strip()
                    clean_reply = re.sub(r"(?i)Simpan kode ke `?src/Composition\.tsx`?.*?(?=\n|$)", "", clean_reply).strip()
                    return {
                        "success": True,
                        "code_changed": True,
                        "summary": "Komposisi diperbarui oleh AI",
                        "commit_sha": commit_sha,
                        "reply": clean_reply or reply_content,
                    }
                else:
                    # Rollback on typecheck error
                    comp_path.write_text(orig_code, encoding="utf-8")
                    return {
                        "success": True,
                        "code_changed": False,
                        "reply": f"{reply_content}\n\n*(Catatan: Kode yang diusulkan gagal validasi TypeScript: {tc.get('errors')}. Komposisi sebelumnya tetap dipertahankan)*",
                    }
            else:
                return {
                    "success": True,
                    "code_changed": False,
                    "reply": f"{reply_content}\n\n*(Catatan: Kode yang diusulkan melanggar aturan keamanan leak guard: {errors})*",
                }
        else:
            # Pure conversational reply / brainstorming (no code changed)
            return {
                "success": True,
                "code_changed": False,
                "reply": reply_content,
            }

    # 2. Fallback to heuristic patch if LLM is unavailable
    patched_code, summary = patch_composition_code(orig_code, instruction, t_sec)

    if patched_code == orig_code:
        return {
            "success": True,
            "code_changed": False,
            "reply": f"Pesan diterima: \"{instruction}\". Tidak ada pola perubahan kode yang cocok.",
        }

    # Leak guard static check (RULES §7.4)
    errors = scan_code_string(patched_code, "src/Composition.tsx")
    if errors:
        return {"success": False, "error": f"Leak guard violation: {errors}"}

    # Write patched code
    comp_path.write_text(patched_code, encoding="utf-8")

    # Typecheck verification
    tc = await worker_client.typecheck(workspace_dir)
    if not tc.get("success"):
        # Rollback on typecheck failure
        comp_path.write_text(orig_code, encoding="utf-8")
        return {"success": False, "error": f"Typecheck gagal: {tc.get('errors')}"}

    # Commit git version
    commit_sha = commit_workspace_version(workspace_dir, f"chat-edit: {summary}")

    return {
        "success": True,
        "code_changed": True,
        "summary": summary,
        "commit_sha": commit_sha,
        "patched_code": patched_code,
        "reply": f"Pesan diterapkan: {summary}.",
    }
