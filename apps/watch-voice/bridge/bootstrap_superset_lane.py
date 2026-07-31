#!/usr/bin/env python3
"""Bootstrap an isolated Superset workspace/terminal for Watch voice.

Reads the running local host-service token from its own-user process environment,
never prints it, and writes a 0600 Yapitalism manifest. Idempotent at project and
workspace layers; creates a terminal only when the workspace has no active one.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

HOST = "http://127.0.0.1:48900"
TRPC = HOST + "/trpc"
REPO = Path("/Users/aytuncyildizli/hermes-workspace/research-intake/superset-voice-current-main")
WORKTREE = Path("/Users/aytuncyildizli/hermes-workspace/research-intake/superset-watchos-voice-spike")
MANIFEST = Path.home() / ".cache" / "superset-watch-voice" / "yapitalism-manifest.json"


def host_environment() -> dict[str, str]:
    pid = subprocess.check_output(
        "lsof -tiTCP:48900 -sTCP:LISTEN | head -1", shell=True, text=True
    ).strip()
    if not pid:
        raise RuntimeError("Superset host-service is not listening on 48900")
    command = subprocess.check_output(["ps", "eww", "-p", pid, "-o", "command="], text=True)
    env: dict[str, str] = {}
    for name in ("HOST_SERVICE_SECRET", "HOST_DB_PATH"):
        match = re.search(rf"(?:^| ){name}=([^ ]+)", command)
        if not match:
            raise RuntimeError(f"running Superset host omitted {name}")
        env[name] = match.group(1)
    return env


def request(token: str, procedure: str, payload: dict, *, mutation: bool) -> dict:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if mutation:
        headers["Content-Type"] = "application/json"
        data = json.dumps({"json": payload}, separators=(",", ":")).encode()
        req = urllib.request.Request(f"{TRPC}/{procedure}", data=data, headers=headers, method="POST")
    else:
        encoded = urllib.parse.urlencode({"input": json.dumps({"json": payload}, separators=(",", ":"))})
        req = urllib.request.Request(f"{TRPC}/{procedure}?{encoded}", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as response:
        wire = json.load(response)
    if "error" in wire:
        raise RuntimeError(f"Superset {procedure} rejected request")
    data = wire["result"]["data"]
    return data.get("json", data)


def project_id(token: str) -> tuple[str, bool]:
    found = request(token, "project.findByPath", {"repoPath": str(REPO)}, mutation=False)
    candidates = found.get("candidates", [])
    if candidates:
        return candidates[0]["id"], False
    created = request(
        token,
        "project.create",
        {"name": "Superset Watch Voice", "mode": {"kind": "importLocal", "repoPath": str(REPO), "initIfNeeded": False}},
        mutation=True,
    )
    return created["id"], True


def workspace_id(token: str, project: str) -> tuple[str, bool]:
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=WORKTREE, text=True).strip()
    created = request(
        token,
        "workspaces.create",
        {"projectId": project, "name": "Watch Voice Lane", "branch": branch, "worktreePath": str(WORKTREE)},
        mutation=True,
    )
    workspace = created.get("workspace", created)
    return workspace["id"], not bool(created.get("alreadyExists", False))


def active_terminal(db_path: str, workspace: str) -> str | None:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    row = con.execute(
        "select id from terminal_sessions where origin_workspace_id=? and status='active' order by last_attached_at desc limit 1",
        (workspace,),
    ).fetchone()
    return row[0] if row else None


def main() -> None:
    env = host_environment()
    project, project_created = project_id(env["HOST_SERVICE_SECRET"])
    workspace, workspace_created = workspace_id(env["HOST_SERVICE_SECRET"], project)
    terminal = active_terminal(env["HOST_DB_PATH"], workspace)
    terminal_created = False
    if terminal is None:
        result = request(
            env["HOST_SERVICE_SECRET"],
            "terminal.createSession",
            {"workspaceId": workspace, "cwd": str(WORKTREE), "cols": 100, "rows": 30},
            mutation=True,
        )
        terminal = result["terminalId"]
        terminal_created = True
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({
        "endpoint": TRPC,
        "bearer_token": env["HOST_SERVICE_SECRET"],
        "workspace_id": workspace,
        "terminal_id": terminal,
        "timeout_seconds": 5.0,
    }))
    os.chmod(MANIFEST, 0o600)
    print(json.dumps({
        "ok": True,
        "project_created": project_created,
        "workspace_created": workspace_created,
        "terminal_created": terminal_created,
        "manifest": str(MANIFEST),
        "manifest_mode": oct(MANIFEST.stat().st_mode & 0o777),
    }))


if __name__ == "__main__":
    main()
