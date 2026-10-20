# Bukti Acceptance Criterion 8: Worker Clean Environment

Worker process environment keys dump:
```json
[
  "HOME",
  "LANG",
  "PATH",
  "TMPDIR"
]
```

- Seluruh environment key yang diwarisi terbatas pada whitelist (`PATH`, `HOME`, `LANG`, `TMPDIR`).
- 0 backend secrets/API keys yang dapat diakses oleh Node worker.
