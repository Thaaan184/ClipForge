# ADR-005: Klien LLM dan Tool-Calling Engine

## Status
Diterima (D5)

## Konteks
Stage Editorial v3 membutuhkan agent AI yang dapat memanipulasi file composition TSX, memeriksa typecheck, dan meminta render pratinjau. Sistem harus fleksibel mendukung API berbayar (OpenAI GPT-4o) maupun model open-source lokal (melalui 9Router, Ollama, atau vLLM).

## Keputusan
1. Menggunakan pustaka resmi `openai` (`AsyncOpenAI`) yang sudah terpasang di backend v2.
2. Memanfaatkan endpoint kompatibel OpenAI dengan format JSON schema Function Calling (`tools=[{"type": "function", ...}]`).
3. Konfigurasi terpusat pada `apps/api/src/clipforge/core/config.py`:
   - `llm_base_url`
   - `llm_api_key`
   - `llm_model`
4. Menjaga fallback deterministik (heuristic editor) jika LLM tidak terkonfigurasi atau mengalami kegagalan/timeout.

## Konsekuensi
- **Positif**: Kompatibel dengan semua provider modern; zero vendor lock-in; token dan log tersanitasi di backend.
- **Negatif**: Model lokal berukuran kecil (<8B parameter) mungkin memerlukan prompting ekstra ketat agar tidak melakukan halusinasi fungsi TSX Remotion.
