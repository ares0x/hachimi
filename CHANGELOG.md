# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Multi-provider transport layer (DeepSeek, Anthropic Claude, OpenAI, Moonshot/Kimi, Qwen/DashScope, Ollama)
- Four-tier memory system (Working / Session / Long-term / Archival) with embedding-based hybrid retrieval
- Daemon mode via `apps/server` (Fastify REST/SSE/WS)
- Bearer Token authentication for daemon server
- Mid-turn Steering (`steer()`, `followUp()`)
- ToolSandbox with 30s timeout and 1MB buffer cap for dangerous tools
- Portable Memory (`HachimiBundleV1`) with export, additive merge import, and schema migration
- Unified extension system (`CapabilitySource`, `SkillPackageLoader`, `HookRegistry`)
- Native MCP client integration
- Dual storage engines (SQLite + File)
- TUI channel (Ink + React)
- CLI channel
- Web UI channel (minimal glassmorphism UI)
- Telegram Bot channel (grammy + authorization whitelist)
- Work data model with CLI management subcommands
- Event persistence and recovery
- Permission system with policy-based defaults

[Unreleased]: https://github.com/ares0x/hachimi/compare/v0.1.0...HEAD
