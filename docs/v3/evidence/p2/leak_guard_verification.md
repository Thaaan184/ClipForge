# Bukti Acceptance Criterion 7: Leak-Guard & Secret Scan

- AST/Regex Static Parser: 5 pola berbahaya (`process.env`, `child_process`, `eval`, `external fetch`, `fs`) berhasil ditolak 100%.
- Secret Scanner: Berhasil mendeteksi kunci dummy berformat OpenAI `sk-proj-...` di direktori workspace.
