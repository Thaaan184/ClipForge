# Bukti Acceptance Criterion 6: Crash Recovery & Idempotent Retry

- State crash: Terdeteksi dan dicatat ke `editorial_sessions` sebagai status `FAILED` dengan `failed_stage = 'RENDERING_FINAL'` dan pesan error lengkap.
- State retry: Dapat dipanggil ulang secara idempoten tanpa menggandakan record versi atau file.
