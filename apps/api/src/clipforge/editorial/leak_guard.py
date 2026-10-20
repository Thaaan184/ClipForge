"""Security Leak-Guard for Editorial Studio v3 (RULES §7).

Performs:
1. Static code analysis (rejects forbidden Node.js APIs, network calls, eval).
2. Secret scanner (rejects API keys, tokens, and private keys).
3. Path traversal & symlink escape validation.
4. Clean environment variable builder for Remotion processes.
"""

import os
import re
from pathlib import Path
from typing import Any

# Forbidden tokens and imports in Remotion workspace code
FORBIDDEN_CODE_PATTERNS = [
    (r"\bprocess\.env\b", "Accessing process.env is forbidden"),
    (r"\bchild_process\b", "Importing or using child_process is forbidden"),
    (r"\bfs(/promises)?\b", "Direct filesystem imports (fs) are forbidden in Remotion code"),
    (r"\beval\s*\(", "eval() is strictly forbidden"),
    (r"\bFunction\s*\(", "Dynamic Function() constructor is strictly forbidden"),
    (r"\bfetch\s*\(", "Network fetch() calls are forbidden in composition code"),
    (r"\bXMLHttpRequest\b", "XMLHttpRequest is forbidden"),
    (r"\bWebSocket\b", "WebSocket connections are forbidden"),
    (r"\b(http|https)\.get\b", "Raw network requests are forbidden"),
]

# Patterns for hardcoded secret detection
SECRET_PATTERNS = [
    (r"sk-[a-zA-Z0-9_\-]{20,}", "OpenAI API Key detected"),
    (r"AKIA[0-9A-Z]{16}", "AWS Access Key ID detected"),
    (r"ghp_[a-zA-Z0-9]{36}", "GitHub Personal Access Token detected"),
    (r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----", "Private cryptographic key detected"),
    (r"(?i)(api_key|secret|password|bearer|auth_token)\s*[:=]\s*['\"][a-zA-Z0-9_\-]{16,}['\"]", "Hardcoded credential token detected"),
]

# Whitelist of environment variables allowed for Remotion rendering processes
ALLOWED_ENV_VARS = {
    "PATH",
    "NODE_PATH",
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "REMOTION_CHROMIUM_EXECUTABLE_PATH",
    "PUPPETEER_EXECUTABLE_PATH",
}


class LeakGuardViolation(Exception):
    """Raised when workspace code or environment violates security leak-guard rules."""
    pass


def scan_code_string(code_content: str, filename: str = "Composition.tsx") -> list[str]:
    """Scan a code string for forbidden APIs, network calls, and hardcoded secrets."""
    errors: list[str] = []

    for pattern, desc in FORBIDDEN_CODE_PATTERNS:
        if re.search(pattern, code_content):
            errors.append(f"Security violation in {filename}: {desc}")

    for pattern, desc in SECRET_PATTERNS:
        if re.search(pattern, code_content):
            errors.append(f"Secret detected in {filename}: {desc}")

    return errors


def audit_workspace_security(workspace_dir: Path) -> dict[str, Any]:
    """
    Examine an entire editorial workspace:
    - Verifies all source files (.tsx, .ts, .js) against code & secret rules.
    - Verifies that no symlinks escape outside workspace_dir.
    """
    resolved_workspace = workspace_dir.resolve()
    errors: list[str] = []
    scanned_files: list[str] = []

    if not resolved_workspace.exists():
        return {"passed": False, "errors": [f"Workspace does not exist: {workspace_dir}"], "scanned_files": []}

    for root, dirs, files in os.walk(resolved_workspace):
        root_path = Path(root)

        # Check all entries in current directory for symlink escape
        for entry_name in dirs + files:
            entry = root_path / entry_name
            if entry.is_symlink():
                target = entry.resolve()
                if not str(target).startswith(str(resolved_workspace)):
                    kind = "directory" if entry.is_dir() else "file"
                    errors.append(f"Symlink {kind} escape detected: {entry} -> {target}")

        for file in files:
            file_path = root_path / file
            # Only scan source files and JSON context
            if file.endswith((".tsx", ".ts", ".js", ".jsx", ".json", ".md")):
                scanned_files.append(str(file_path.relative_to(resolved_workspace)))
                try:
                    content = file_path.read_text(encoding="utf-8", errors="ignore")
                    file_errors = scan_code_string(content, filename=file_path.name)
                    errors.extend(file_errors)
                except Exception as exc:
                    errors.append(f"Failed to read file {file_path}: {exc}")

    return {
        "passed": len(errors) == 0,
        "errors": errors,
        "scanned_files": scanned_files,
    }


def get_clean_worker_env() -> dict[str, str]:
    """
    Produce a whitelisted, clean environment dictionary for worker processes.
    Strips all backend secrets, database passwords, and API keys.
    """
    clean_env: dict[str, str] = {}
    for key in ALLOWED_ENV_VARS:
        val = os.environ.get(key)
        if val is not None:
            clean_env[key] = val

    # Ensure minimal system defaults if missing
    clean_env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    clean_env.setdefault("LANG", "en_US.UTF-8")
    clean_env.setdefault("NODE_ENV", "production")

    return clean_env
