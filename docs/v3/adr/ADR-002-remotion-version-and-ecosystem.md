# ADR-002: Versi Remotion dan Ekosistem Paket

## Status
Diterima (D2)

## Konteks
Remotion digunakan sebagai engine video rendering berbasis React/TSX untuk Editorial Studio. Ketidakcocokan versi minor/patch antar paket `@remotion/*` sering menyebabkan crash runtime dan kegagalan webpack bundling. Lisensi Remotion juga memiliki syarat tertentu untuk entitas komersial.

## Keputusan
1. Mengunci (pin exact) versi Remotion ke `4.0.530` di seluruh paket tanpa rentang versi (`^` atau `~`):
   - `remotion`: `4.0.530`
   - `@remotion/bundler`: `4.0.530`
   - `@remotion/cli`: `4.0.530`
   - `@remotion/renderer`: `4.0.530`
   - `@remotion/captions`: `4.0.530`
   - `@remotion/motion-blur`: `4.0.530`
   - `@remotion/shapes`: `4.0.530`
   - `@remotion/transitions`: `4.0.530`
   - `@remotion/zod-types`: `4.0.530`
2. Menggunakan Chromium headless shell bawaan (`@remotion/cli`) yang di-cache di path worker.
3. Status lisensi: Kompatibel dengan model evaluasi/internal. Untuk rilis komersial berbadan hukum PT NCT, lisensi Remotion Company License perlu diverifikasi oleh pemilik proyek.

## Konsekuensi
- **Positif**: Build deterministik, tidak ada resiko paket pecah akibat auto-update dependency.
- **Negatif**: Upgrade fitur Remotion di masa depan membutuhkan uji regresi manual di seluruh komponen.
