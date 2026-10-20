# ADR-006: Ekstraksi Metadata dan Deskripsi Aset Visual

## Status
Diterima (D6)

## Konteks
Pengguna dapat mengunggah berbagai aset (foto, stiker PNG, overlay video B-roll, efek audio MP3/WAV) ke dalam Asset Tray. Agent editorial membutuhkan pemahaman terhadap isi aset agar dapat menyisipkannya pada momen transkrip yang relevan.

## Keputusan
1. **Metadata Teknis**: Wajib diekstraksi menggunakan `ffprobe` (durasi, resolusi, format, sample rate, aspect ratio).
2. **Deskripsi Semantik**:
   - Jika `llm_vision_model` dikonfigurasi dan model multimodal aktif: ekstrak keyframe tengah (untuk video) atau gambar (untuk foto) lalu kirim prompt singkat untuk menghasilkan ringkasan deskripsi visual 1 kalimat.
   - Fallback: Gunakan nama file yang disanitasi (`label`) serta input `hint` opsional yang diberikan pengguna secara manual di UI.

## Konsekuensi
- **Positif**: Tetap dapat beroperasi 100% tanpa model vision eksternal; tidak menambah dependensi library Python baru (cukup NumPy/FFmpeg).
- **Negatif**: Deskripsi otomatis memerlukan konsumsi token vision bila diaktifkan.
