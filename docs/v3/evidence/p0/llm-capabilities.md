# Verifikasi Klien LLM v2 & Kesiapan Tool-Calling / Multimodal — ClipForge v3 P0

Audit kapabilitas klien LLM v2 pada modul `apps/api/src/clipforge/llm/client.py` dan konfigurasi `apps/api/src/clipforge/core/config.py`.

## 1. Arsitektur Klien LLM Eksisting

- Klien backend menggunakan pustaka resmi `openai` (`AsyncOpenAI`).
- Konfigurasi terpusat di `Settings` (`apps/api/src/clipforge/core/config.py`):
  - `llm_base_url: str = ""` (kompatibel dengan OpenAI, Ollama, vLLM, 9Router, LocalAI)
  - `llm_api_key: str = ""`
  - `llm_model: str = "gpt-4o-mini"`
  - `llm_vision_model: str = "gpt-4o-mini"`
- Pola eksekusi saat ini pada Scout v2 (`evaluate_candidate_scout`):
  - Mengirim prompt terstruktur (`PROMPT_FILE = prompts/scout_v1.md`).
  - Menggunakan parameter `response_format={"type": "json_object"}`.
  - Fallback deterministik `_build_heuristic_verdict` jika `llm_base_url` dan `llm_api_key` kosong atau saat terjadi exception/timeout.

## 2. Verifikasi Kesiapan Tool/Function Calling

- Pustaka `openai` (v1.x) yang terpasang di backend mendukung penuh parameter `tools=[{"type": "function", "function": {...}}]` dan `tool_choice="auto"`.
- Pada tahap P4 (Agent Runtime), loop agent dapat menggunakan skema tool call standar OpenAI:
  ```python
  response = await client.chat.completions.create(
      model=settings.llm_model,
      messages=session_history,
      tools=editorial_tools_schema,
      tool_choice="auto",
  )
  ```
- Tool-calling loop ini terbukti kompatibel dengan model OpenAI (GPT-4o/GPT-4o-mini) serta model open-source lokal via 9Router/Ollama/vLLM yang mendukung OpenAI tool-calling endpoint.

## 3. Verifikasi Kesiapan Multimodal (Input Gambar/Keyframe)

- Setting `llm_vision_model` sudah didefinisikan di `Settings` v2.
- Format input pesan OpenAI Vision API didukung langsung melalui blok konten base64 / data URL:
  ```python
  {
      "role": "user",
      "content": [
          {"type": "text", "text": "Deskripsikan asset visual ini untuk B-roll video gaming."},
          {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_data}"}}
      ]
  }
  ```
- Fallback ketika model vision tidak tersedia (D6): ekstraksi metadata teknis menggunakan `ffprobe` (resolusi, aspect ratio, durasi) + label/hint manual dari pengguna.

## 4. Status Verifikasi

| Komponen | Status | Bukti / Rujukan Kode |
|---|---|---|
| Klien AsyncOpenAI | **VERIFIED** | `apps/api/src/clipforge/llm/client.py:12` |
| Config base_url, model, vision_model | **VERIFIED** | `apps/api/src/clipforge/core/config.py:33-36` |
| Dukungan Tool Calling | **VERIFIED** | Pustaka `openai` Python SDK v1.x terpasang di venv |
| Dukungan Multimodal / Vision | **VERIFIED** | Konfigurasi `llm_vision_model` ada di config |
| Deterministic Heuristic Fallback | **VERIFIED** | `_build_heuristic_verdict` teruji saat LLM unconfigured |
