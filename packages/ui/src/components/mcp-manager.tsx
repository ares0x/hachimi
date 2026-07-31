import {
  Check,
  ExternalLink,
  Globe,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";

export interface McpServerItem {
  id: string;
  name: string;
  description?: string;
  command?: string;
  args?: string[];
  status: "connected" | "error" | "disabled";
  toolsCount?: number;
  env?: Record<string, string>;
  isBuiltin?: boolean;
}

const CURATED_MARKETPLACE_ITEMS = [
  {
    id: "fetch",
    name: "Fetch / Web Reader",
    vendor: "modelcontextprotocol",
    category: "web-scraping",
    description:
      "Provides web content fetching capabilities for LLMs, retrieving and converting HTML pages to clean markdown text.",
    tags: ["web-fetching", "html-to-markdown", "content-extraction", "zero-key"],
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    verified: true,
  },
  {
    id: "context7",
    name: "Context7",
    vendor: "upstash",
    category: "development",
    description:
      "Up-to-date code documentation for LLMs and AI code editors. Provides version-specific documentation and code examples.",
    tags: ["documentation", "code-examples", "library-docs", "api-reference"],
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    verified: true,
  },
  {
    id: "github",
    name: "GitHub MCP",
    vendor: "modelcontextprotocol",
    category: "developer-tools",
    description:
      "Allows LLMs to inspect GitHub repositories, search code, manage issues, and review pull requests.",
    tags: ["github", "git-repo", "code-search", "pull-requests"],
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envRequired: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    verified: true,
  },
  {
    id: "filesystem",
    name: "PathJail Filesystem",
    vendor: "hachimi",
    category: "system",
    description:
      "Secure local filesystem operations with strict PathJail sandbox boundary controls.",
    tags: ["filesystem", "path-jail", "sandbox", "local-first"],
    command: "builtin",
    verified: true,
  },
  {
    id: "sqlite",
    name: "SQLite Database",
    vendor: "modelcontextprotocol",
    category: "database",
    description:
      "Enables LLMs to perform schema inspection, SQL queries, and business intelligence tasks on local SQLite databases.",
    tags: ["sqlite", "database", "sql-queries", "local-db"],
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite"],
    verified: true,
  },
  {
    id: "firecrawl",
    name: "Firecrawl Web Crawler",
    vendor: "firecrawl",
    category: "web-scraping",
    description:
      "Turn entire websites into LLM-ready markdown or structured data with JS rendering.",
    tags: ["web-crawler", "scraping", "browser", "markdown"],
    command: "npx",
    args: ["-y", "@mendable/firecrawl-mcp-server"],
    envRequired: ["FIRECRAWL_API_KEY"],
    verified: true,
  },
];

export function McpManager() {
  const [activeSubTab, setActiveSubTab] = useState<"marketplace" | "installed">("marketplace");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerCmd, setNewServerCmd] = useState("");
  const [installedServers, setInstalledServers] = useState<McpServerItem[]>([
    {
      id: "fetch",
      name: "Fetch / Web Reader",
      description: "Built-in web page content reader",
      command: "builtin",
      status: "connected",
      toolsCount: 1,
      isBuiltin: true,
    },
    {
      id: "filesystem",
      name: "PathJail Filesystem",
      description: "Built-in PathJail sandbox reader",
      command: "builtin",
      status: "connected",
      toolsCount: 1,
      isBuiltin: true,
    },
  ]);

  const filteredMarket = CURATED_MARKETPLACE_ITEMS.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleInstallServer = (item: (typeof CURATED_MARKETPLACE_ITEMS)[0]) => {
    if (installedServers.some((s) => s.id === item.id)) return;
    setInstalledServers((prev) => [
      ...prev,
      {
        id: item.id,
        name: item.name,
        description: item.description,
        command: item.command,
        args: item.args,
        status: "connected",
        toolsCount: 3,
      },
    ]);
    setActiveSubTab("installed");
  };

  const handleAddCustomServer = () => {
    if (!newServerName || !newServerCmd) return;
    const newId = newServerName.toLowerCase().replace(/\s+/g, "-");
    setInstalledServers((prev) => [
      ...prev,
      {
        id: newId,
        name: newServerName,
        command: newServerCmd,
        status: "connected",
        toolsCount: 1,
      },
    ]);
    setNewServerName("");
    setNewServerCmd("");
    setAddModalOpen(false);
    setActiveSubTab("installed");
  };

  const handleRemoveServer = (id: string) => {
    setInstalledServers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggleServer = (id: string) => {
    setInstalledServers((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: s.status === "disabled" ? "connected" : "disabled" } : s
      )
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden pr-10">
      {/* Sub Header Navigation */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-1 rounded-xl bg-surface-hover/60 p-1">
          <button
            type="button"
            onClick={() => setActiveSubTab("marketplace")}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97]",
              activeSubTab === "marketplace"
                ? "bg-surface-elevated text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Globe className="size-3.5 shrink-0" />
            应用市场
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("installed")}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97]",
              activeSubTab === "installed"
                ? "bg-surface-elevated text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Server className="size-3.5 shrink-0" />
            已安装 ({installedServers.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === "marketplace" && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索 MCP 服务器..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8.5 w-48 rounded-xl border border-border/50 bg-surface/80 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {activeSubTab === "installed" && (
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-xs transition-transform active:scale-[0.97] hover:opacity-90"
            >
              <Plus className="size-3.5 shrink-0" />
              添加服务器
            </button>
          )}
        </div>
      </div>

      {/* Main Content View */}
      <div className="flex-1 overflow-y-auto pt-4 scroll-quiet">
        {activeSubTab === "marketplace" && (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {filteredMarket.map((item) => {
              const isInstalled = installedServers.some((s) => s.id === item.id);
              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs backdrop-blur-xs transition-all hover:border-border hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-medium text-foreground">{item.name}</h4>
                          {item.verified && (
                            <span className="inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              <Check className="size-2.5 shrink-0" /> 已验证
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          作者 {item.vendor} · {item.category}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isInstalled}
                        onClick={() => handleInstallServer(item)}
                        className={cn(
                          "flex items-center gap-1 whitespace-nowrap shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97]",
                          isInstalled
                            ? "border border-border/40 bg-surface-hover text-muted-foreground cursor-default"
                            : "bg-primary text-primary-foreground hover:opacity-90 shadow-xs"
                        )}
                      >
                        {isInstalled ? (
                          <>
                            <Check className="size-3" /> 已安装
                          </>
                        ) : (
                          <>
                            <Zap className="size-3" /> 安装
                          </>
                        )}
                      </button>
                    </div>

                    <p className="mt-2.5 text-xs leading-relaxed text-foreground/80">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-border/20">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-surface-hover/80 px-2 py-0.5 text-[10px] text-muted-foreground font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeSubTab === "installed" && (
          <div className="space-y-3">
            {installedServers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between rounded-2xl border border-border/40 bg-surface-elevated/70 p-4 shadow-xs backdrop-blur-xs"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      "grid size-10 place-items-center rounded-xl border border-border/40 text-foreground",
                      server.status === "connected" &&
                        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                      server.status === "disabled" && "bg-surface-hover text-muted-foreground"
                    )}
                  >
                    <Server className="size-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-foreground">{server.name}</h4>
                      <span
                        className={cn(
                          "inline-block size-2 rounded-full",
                          server.status === "connected" &&
                            "bg-emerald-500 ring-2 ring-emerald-500/20",
                          server.status === "disabled" && "bg-muted-foreground/40"
                        )}
                      />
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {server.status === "connected" ? "已连接" : "已禁用"}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-muted-foreground font-mono">
                      {server.command === "builtin"
                        ? "核心内置服务"
                        : `${server.command} ${(server.args || []).join(" ")}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleServer(server.id)}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors active:scale-[0.97]",
                      server.status === "connected"
                        ? "bg-primary"
                        : "bg-surface-hover border border-border/60"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-md transition-transform",
                        server.status === "connected" ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>

                  {!server.isBuiltin && (
                    <button
                      type="button"
                      onClick={() => handleRemoveServer(server.id)}
                      className="grid size-8 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
                      title="删除服务器"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Custom MCP Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-border/50 bg-surface-elevated p-5 shadow-2xl">
            <h3 className="text-base font-medium text-foreground">添加自定义 MCP 服务器</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              输入 Stdio 或 HTTP 类型 MCP 服务启动命令
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">服务器名称</label>
                <input
                  type="text"
                  placeholder="例如: My Custom MCP"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="mt-1.5 h-9 w-full rounded-xl border border-border/50 bg-surface/80 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">启动命令 (Command)</label>
                <input
                  type="text"
                  placeholder="例如: npx -y @modelcontextprotocol/server-xxx"
                  value={newServerCmd}
                  onChange={(e) => setNewServerCmd(e.target.value)}
                  className="mt-1.5 h-9 w-full rounded-xl border border-border/50 bg-surface/80 px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="rounded-xl border border-border/50 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-surface-hover active:scale-[0.97]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddCustomServer}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 active:scale-[0.97]"
              >
                保存并连接
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
