"""Unit tests for Editorial Agent Runtime and Tool Sandbox (ClipForge v3 P4 Task 3)."""
import json
import pytest
from pathlib import Path

from clipforge.editorial.agent_runtime import (
    AgentToolContext,
    synthesize_gaming_composition,
    MAX_ITERATIONS,
    ReadOnlyKitViolation,
    WorkspaceAccessViolation,
)


@pytest.fixture
def mock_workspace(tmp_path: Path) -> Path:
    """Set up a dummy workspace with template structure."""
    src_dir = tmp_path / "src"
    src_dir.mkdir(parents=True)
    kit_dir = tmp_path / "kit"
    kit_dir.mkdir(parents=True)
    context_dir = tmp_path / "context"
    context_dir.mkdir(parents=True)

    # Protected kit file
    (kit_dir / "SourceVideo.tsx").write_text("// protected kit", encoding="utf-8")

    # Initial Composition.tsx
    comp = src_dir / "Composition.tsx"
    comp.write_text("export const Composition = () => null;", encoding="utf-8")

    # Initial manifest.json
    manifest = {
        "clip_id": "clip_test_01",
        "clip": {"fps": 30, "duration": 15.0},
        "scout": {
            "hook": "ROUND 12 CLUTCH!",
            "category": "highlight"
        },
        "assets": [
            {"id": "ast_bgm", "label": "hype_bgm", "path": "public/bgm.mp3", "type": "audio"}
        ],
        "signals": {
            "peaks": [{"t": 2.5, "intensity": 0.95}],
            "vad_silences": [[0.0, 0.4]]
        },
        "transcript": {
            "words": [
                {"word": "CLUTCH", "start": 0.5, "end": 1.2},
                {"word": "ACE!", "start": 1.3, "end": 2.0}
            ]
        }
    }
    (context_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (context_dir / "style.md").write_text("# gaming_hype style", encoding="utf-8")
    return tmp_path


def test_agent_tool_read_file(mock_workspace: Path):
    """Verifies agent tool read_file safely reads files inside workspace."""
    ctx = AgentToolContext(mock_workspace)
    res = ctx.read_file("src/Composition.tsx")
    assert res["success"] is True
    assert "Composition" in res["content"]


def test_agent_tool_list_assets(mock_workspace: Path):
    """Verifies agent tool list_assets parses workspace manifest."""
    ctx = AgentToolContext(mock_workspace)
    res = ctx.list_assets()
    assert len(res["assets"]) == 1
    assert res["assets"][0]["label"] == "hype_bgm"


def test_agent_tool_write_file_leak_guard_rejection(mock_workspace: Path):
    """Verifies leak-guard rejects code containing forbidden tokens (process.env / eval)."""
    ctx = AgentToolContext(mock_workspace)
    leaky_code = "const token = process.env.API_KEY;\nexport const Comp = () => null;"
    res = ctx.write_file("src/Composition.tsx", leaky_code)
    assert res["success"] is False
    assert "Pelanggaran leak-guard" in res["error"]


def test_agent_tool_kit_readonly_protection(mock_workspace: Path):
    """Verifies kit/ files are read-only and cannot be overwritten by agent."""
    ctx = AgentToolContext(mock_workspace)
    with pytest.raises(ReadOnlyKitViolation):
        ctx.write_file("kit/SourceVideo.tsx", "// hacked")


def test_agent_tool_path_traversal_jail(mock_workspace: Path):
    """Verifies path traversal outside workspace is blocked."""
    ctx = AgentToolContext(mock_workspace)
    with pytest.raises(WorkspaceAccessViolation):
        ctx.read_file("../../../etc/passwd")


def test_synthesize_gaming_composition(mock_workspace: Path):
    """Verifies dynamic TSX synthesizer generates valid 9:16 layout without leak tokens."""
    manifest = json.loads((mock_workspace / "context" / "manifest.json").read_text(encoding="utf-8"))
    tsx = synthesize_gaming_composition(manifest, "# gaming style")

    assert "EditorialComposition" in tsx
    assert "ROUND 12 CLUTCH!" in tsx
    assert "ScreenShake" in tsx
    assert "PunchZoom" in tsx
    assert "process.env" not in tsx
    assert "child_process" not in tsx
    assert "eval" not in tsx


def test_max_iteration_limit_constant():
    """Verifies P4 constraint: agent loop cannot exceed 8 iterations."""
    assert MAX_ITERATIONS == 8
