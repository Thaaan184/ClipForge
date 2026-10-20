# Bukti Acceptance Criteria 4 & 5: Semaphore Serialization

Dua permintaan render diluncurkan secara concurrent. Semaphore membatasi concurrency = 1 slot:

```text
Urutan Eksekusi: ['start_1', 'end_1', 'start_2', 'end_2']
- start_1: t=1792486812.9440
- end_1: t=1792486813.2445
- start_2: t=1792486813.2445
- end_2: t=1792486813.5449
```

Hasil: Job 2 menunggu sampai Job 1 selesai sempurna sebelum memulai eksekusi.
