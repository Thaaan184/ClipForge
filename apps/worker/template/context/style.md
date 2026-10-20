# Style Pack: gaming_hype (v0)

Panduan gaya komposisi video vertikal (1080×1920, 30 FPS) untuk konten gaming berenergi tinggi (Valorant, CS2, Mobile Legends, PUBG).

## 1. Safe Zone
Semua teks, judul, dan elemen penting WAJIB berada di dalam batas aman:
- Top Margin: 12% (1296px vertical canvas: top safe boundary Y >= 230px)
- Bottom Margin: 20% (Y <= 1536px, aman dari UI TikTok/Shorts dan caption platform)
- Left Margin: 6% (X >= 65px)
- Right Margin: 12% (X <= 950px, aman dari tombol Like/Share)

## 2. Komponen Kit yang Tersedia
- `<SourceVideo src="clip_source.mp4" />`: Video gameplay utama 9:16.
- `<PunchZoom peaks={peaks} zoomFactor={1.15}>`: Efek zoom mendadak sinkron dengan puncak audio/sinyal.
- `<KineticCaptions words={words} />`: Subtitle dinamis per kata dengan penyorotan warna kuning/oranye.
- `<CartoonTextBox bg="#FFDE00" textColor="#000">`: Kartun pop-up callout dengan animasi bouncy spring.
- `<ScreenShake active={true} intensity={20}>`: Getaran layar pada momen ledakan/tembakan.
- `<StickerImage src="public/assets/..." rotation={-3} />`: Stiker gambar atau meme dengan outline putih dan drop-shadow tebal.
- `<DuckedMusic src="public/assets/..." vadSilences={vadSilences} />`: Backsound musik otomatis ducking (mengecil saat ada vokal streamer).

## 3. Aturan Momen
- **Hook (0.0s - 2.5s)**: Gunakan `CartoonTextBox` atau judul menarik di atas (Y=260px) untuk memancing atensi penonton.
- **Climax / Peak (|t - t_puncak| <= 150ms)**: Letakkan punch zoom atau screen shake tepat pada detik `peaks[i].t`.
- **Subtitle**: Teks kata selalu diambil dari `manifest.transcript.words` dengan batas safezone bawah (Y=1450px).
