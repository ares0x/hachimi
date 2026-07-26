// packages/ui/src/api/index.ts - Client API Adapter for Daemon Server (Port 3700)

const getApiBase = () => {
  if (typeof window !== "undefined" && (window as any).__HACHIMI_API_BASE__) {
    return (window as any).__HACHIMI_API_BASE__;
  }
  return typeof process !== "undefined" && process.env?.VITE_API_BASE ? process.env.VITE_API_BASE : "";
};

export interface StatusData {
  status: string;
  uptime: number;
  paths?: { dataDir: string; sessionsDir: string };
  llm?: { provider: string; model: string };
  context?: { tokens: number; maxTokens: number; ratio: string };
  memory?: { totalCount: number };
  session?: { id: string; title: string; messages: any[] };
}

export interface SessionItem {
  id: string;
  title: string;
  updatedAt: number;
  mode?: string;
  runs?: number;
}

export async function fetchStatus(): Promise<StatusData | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/status`);
    if (!res.ok) return null;
    return (await res.json()) as StatusData;
  } catch {
    return null;
  }
}

export async function fetchSessions(): Promise<SessionItem[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions`);
    if (!res.ok) return [];
    const data = (await res.json()) as { sessions?: SessionItem[] };
    return data.sessions || [];
  } catch {
    return [];
  }
}

export async function fetchSession(sessionId: string): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions/${sessionId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: any };
    return data.session || null;
  } catch {
    return null;
  }
}

export async function createSession(title?: string): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: any };
    return data.session || null;
  } catch {
    return null;
  }
}

export async function renameSession(id: string, title: string): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: any };
    return data.session || null;
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/sessions/${id}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendSteerPrompt(prompt: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/chat/steer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export async function streamChatPrompt(
  prompt: string,
  sessionId: string,
  onChunk: (chunk: string) => void,
  onConfirmRequired?: (info: { toolName: string; args: string }) => void,
  onDone?: (content: string) => void,
  onError?: (err: string) => void
) {
  try {
    const res = await fetch(`${getApiBase()}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        prompt,
        sessionId,
        stream: true,
      }),
    });

    if (!res.ok) {
      if (onError) onError(`Request failed: ${res.statusText}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      if (onError) onError("No response reader available");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk" && data.chunk) {
              onChunk(data.chunk);
            } else if (data.type === "confirm_required" && onConfirmRequired) {
              onConfirmRequired({ toolName: data.toolName, args: data.args });
            } else if (data.type === "done") {
              if (onDone) onDone(data.content || "");
            }
          } catch {
            /* ignore JSON parse errors */
          }
        }
      }
    }
  } catch (err: any) {
    if (onError) onError(err?.message || String(err));
  }
}

export async function exportBundle(): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/export`);
    if (!res.ok) return null;
    const data = (await res.json()) as { bundle?: any };
    return data.bundle || null;
  } catch {
    return null;
  }
}
