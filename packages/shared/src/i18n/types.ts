export type Locale = "en" | "zh-CN";

export interface I18nDictionary {
  // --- Circuit Breaker & Intercept Messages ---
  "tool.rejected_by_user": string; // [用户拦截]
  "tool.sandbox_timeout": string; // [沙箱熔断]
  "tool.sandbox_truncated": string; // [沙箱提示]
  "tool.sandbox_error": string; // [沙箱拦截] exec error
  "tool.path_security_fail": string; // [沙箱拦截] path security
  "tool.circuit_breaker": string; // [工具熔断]
  "tool.long_running_timeout_hint": string; // long-running tool timeout recovery hint
  "agent.no_recursive_dispatch": string; // [系统安全拦截] recursive sub-agent
  "agent.max_steps_reached": string; // [系统拦截] max rounds
  "agent.subagent_dispatched": string; // [异步派发成功]
  "agent.subagent_completed": string; // [子 Agent 运行完成]
  "agent.subagent_budget_exhausted": string; // [子 Agent 预算用尽]

  // --- Error Classes ---
  "error.permission_denied": string; // [用户/策略拒绝]
  "error.tool_timeout": string; // [沙箱/工具超时]
  "error.tool_circuit_broken": string; // [工具熔断]

  // --- Tool Summary Labels ---
  "summary.truncated": string; // …[已截断]
  "summary.write_file": string; // 写入文件
  "summary.target_path": string; // 目标路径
  "summary.file_size": string; // 文件大小
  "summary.content_preview": string; // 内容预览
  "summary.preview_truncated": string; // 预览截断提示
  "summary.delete_file": string; // 删除文件
  "summary.note": string; // 注意
  "summary.permanent_delete_warning": string; // 永久删除警告
  "summary.read_file": string; // 读取文件
  "summary.path": string; // 路径
  "summary.range": string; // 范围
  "summary.default": string; // (默认)
  "summary.list_dir": string; // 列出目录
  "summary.directory": string; // 目录
  "summary.exec_command": string; // 执行命令
  "summary.executable": string; // 可执行文件
  "summary.arguments_list": string; // 参数列表
  "summary.full_command": string; // 完整命令行
  "summary.too_long_truncated": string; // …[过长截断]
  "summary.update_work_plan": string; // 更新 Work 计划
  "summary.current": string; // (当前)
  "summary.plan_content": string; // 计划内容
  "summary.content_truncated": string; // …[内容已截断]

  // --- Tool: meta/calc ---
  "tool.calc.description": string; // 执行简单的加减乘除计算
  "tool.calc.divide_by_zero": string; // 错误：除数不能为 0
  "tool.calc.unsupported_operator": string; // 不支持的运算符
  "tool.meta.datetime.description": string; // 获取系统当前本地日期、时间与时区
  "tool.meta.datetime.format_param": string; // ISO 或 local，默认 local
  "tool.meta.datetime.utc_result": string; // [当前 UTC 时间]
  "tool.meta.datetime.local_result": string; // [当前本地时间]

  // --- Tool: shell/run-command ---
  "tool.shell.description": string;
  "tool.shell.command_param": string;
  "tool.shell.args_param": string;
  "tool.shell.empty_command": string;
  "tool.shell.no_output": string;
  "tool.shell.output_truncated": string;
  "tool.shell.command_failed": string;

  // --- Tool: fs/read-file ---
  "tool.fs.read_file.description": string;
  "tool.fs.read_file.path_param": string;
  "tool.fs.read_file.offset_param": string;
  "tool.fs.read_file.limit_param": string;
  "tool.fs.read_file.label": string;
  "tool.fs.read_file.not_found": string;
  "tool.fs.read_file.not_a_file": string;
  "tool.fs.read_file.binary": string;
  "tool.fs.read_file.empty_range": string;
  "tool.fs.read_file.truncated_note": string;
  "tool.fs.read_file.error": string;

  // --- Tool: fs/write-file ---
  "tool.fs.write_file.description": string;
  "tool.fs.write_file.path_param": string;
  "tool.fs.write_file.content_param": string;
  "tool.fs.write_file.label": string;
  "tool.fs.write_file.success": string;
  "tool.fs.write_file.error": string;

  // --- Tool: fs/delete-file ---
  "tool.fs.delete_file.description": string;
  "tool.fs.delete_file.path_param": string;
  "tool.fs.delete_file.label": string;
  "tool.fs.delete_file.not_found": string;
  "tool.fs.delete_file.not_regular_file": string;
  "tool.fs.delete_file.success": string;
  "tool.fs.delete_file.error": string;

  // --- Tool: fs/list-dir ---
  "tool.fs.list_dir.description": string;
  "tool.fs.list_dir.path_param": string;
  "tool.fs.list_dir.limit_param": string;
  "tool.fs.list_dir.label": string;
  "tool.fs.list_dir.not_found": string;
  "tool.fs.list_dir.not_a_directory": string;
  "tool.fs.list_dir.more_entries": string;
  "tool.fs.list_dir.header": string;
  "tool.fs.list_dir.error": string;

  // --- Agent ---
  "agent.remember_prefixes": string[];
  "agent.remember_confirmation": string;
  "agent.remember_empty_prompt": string;
  "agent.steer_prefix": string;
  "agent.turn_log": string;
  "agent.tool_stopped_rejected": string;
  "agent.multiple_tools_rejected": string;
  "agent.max_tool_rounds_reached": string;
  "runtime.agent_failure": string;

  // --- CLI ---
  "cli.status.in_progress": string;
  "cli.status.pending": string;
  "cli.status.blocked": string;
  "cli.status.completed": string;
  "cli.status.failed": string;
  "cli.status.archived": string;
  "cli.time.just_now": string;
  "cli.time.minutes_ago": string;
  "cli.time.hours_ago": string;
  "cli.time.days_ago": string;
  "cli.work.no_works": string;
  "cli.work.table_headers": string[];
  "cli.work.footer": string;
  "cli.work.not_found": string;
  "cli.work.title_label": string;
  "cli.work.status_label": string;
  "cli.work.type_label": string;
  "cli.work.created_at_label": string;
  "cli.work.updated_at_label": string;
  "cli.work.session_count_label": string;
  "cli.work.no_activities": string;
  "cli.work.activity_user": string;
  "cli.work.activity_assistant": string;
  "cli.work.activity_tool_denied": string;
  "cli.work.activity_tool_approved": string;
  "cli.work.activity_approved": string;
  "cli.work.activity_denied": string;
  "cli.work.activity_pending": string;
  "cli.work.activity_steer": string;
  "cli.work.activity_error": string;
  "cli.work.activity_system": string;
  "cli.work.audit_header": string;
  "cli.work.audit_empty": string;
  "cli.work.audit_table_headers": string[];
  "cli.work.audit_footer": string;
  "cli.work.create_missing_intent": string;
  "cli.work.create_success": string;
  "cli.work.create_goal_label": string;
  "cli.work.create_hint": string;
  "cli.work.show_usage": string;
  "cli.work.audit_usage": string;
  "cli.work.unknown_subcommand": string;

  // --- TUI ---
  "tui.model.deepseek_v4_max": string;
  "tui.model.deepseek_v4_speed": string;
  "tui.model.custom_input": string;
  "tui.model.custom_manual": string;
  "tui.model.gpt5_opus": string;
  "tui.model.gpt5_plus": string;
  "tui.model.gpt5_turbo": string;
  "tui.model.claude_mythos": string;
  "tui.model.claude_opus": string;
  "tui.model.claude_sonnet": string;
  "tui.model.qwen_max": string;
  "tui.model.qwen_plus": string;
  "tui.model.qwen_turbo": string;
  "tui.model.kimi_frontier": string;
  "tui.model.kimi_reasoner": string;
  "tui.goodbye": string;
  "tui.session_reset": string;
  "tui.info": string;
  "tui.theme.tokyo_night": string;
  "tui.theme.amber": string;
  "tui.theme.neon": string;
  "tui.theme.select_title": string;
  "tui.theme.changed": string;
  "tui.provider.qwen_label": string;
  "tui.provider.mock_label": string;
  "tui.provider.step1_title": string;
  "tui.provider.step2_title": string;
  "tui.provider.custom_model_prompt": string;
  "tui.provider.api_key_prompt": string;
  "tui.provider.updated": string;
  "tui.provider.select_model_title": string;
  "tui.provider.model_updated": string;
  "tui.session.default_title": string;
  "tui.session.current_active": string;
  "tui.session.no_history": string;
  "tui.session.switch_title": string;
  "tui.session.switched": string;
  "tui.thinking": string;
  "tui.permission_prompt": string;
  "tui.error_prefix": string;

  // --- TUI Commands ---
  "tui.cmd.status": string;
  "tui.cmd.config": string;
  "tui.cmd.provider": string;
  "tui.cmd.model": string;
  "tui.cmd.theme": string;
  "tui.cmd.memories": string;
  "tui.cmd.remember": string;
  "tui.cmd.sessions": string;
  "tui.cmd.clear": string;
  "tui.cmd.prune": string;
  "tui.cmd.help": string;
  "tui.cmd.quit": string;
  "tui.cmd.provider_changed": string;
  "tui.cmd.model_changed": string;
  "tui.cmd.theme_changed": string;
  "tui.cmd.unknown_theme": string;
  "tui.cmd.dashboard_title": string;
  "tui.cmd.dashboard_line1": string;
  "tui.cmd.dashboard_line2": string;
  "tui.cmd.dashboard_line3": string;
  "tui.cmd.dashboard_line4": string;
  "tui.cmd.dashboard_line5": string;
  "tui.cmd.dashboard_line6": string;
  "tui.cmd.dashboard_line7": string;
  "tui.cmd.dashboard_line8": string;
  "tui.cmd.dashboard_line9": string;
  "tui.cmd.status_title": string;
  "tui.cmd.config_title": string;
  "tui.cmd.no_memories": string;
  "tui.cmd.memories_title": string;
  "tui.cmd.memories_count": string;
  "tui.cmd.remember_empty": string;
  "tui.cmd.remember_success": string;
  "tui.cmd.sessions_switched": string;
  "tui.cmd.sessions_not_found": string;
  "tui.cmd.sessions_created": string;
  "tui.cmd.clear_done": string;
  "tui.cmd.clear_no_session": string;
  "tui.cmd.prune_done": string;
  "tui.cmd.help_title": string;
  "tui.cmd.help_shortcuts_title": string;
  "tui.cmd.help_new_session": string;
  "tui.cmd.help_history": string;
  "tui.cmd.help_status": string;
  "tui.cmd.help_quit": string;
  "tui.cmd.help_navigation": string;
  "tui.cmd.help_natural_language": string;
  "tui.cmd.help_panel_title": string;
  "tui.cmd.slash_title": string;
  "tui.cmd.slash_hint": string;
  "tui.cmd.unknown_command": string;
}

export type I18nKey = keyof I18nDictionary;
