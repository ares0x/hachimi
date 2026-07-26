// packages/channels/web/public/app.js - Hachimi Design System v1.1.0 Interactive Client

document.addEventListener("DOMContentLoaded", () => {
  const promptInput = document.getElementById("prompt-input");
  const btnSend = document.getElementById("btn-send");
  const btnSteer = document.getElementById("btn-steer");
  const btnExport = document.getElementById("btn-export");
  const inputImport = document.getElementById("input-import");
  const btnNewSession = document.getElementById("btn-new-session");
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const themeText = document.getElementById("theme-text");
  const messagesContainer = document.getElementById("messages-container");
  const sessionList = document.getElementById("session-list");
  const inspectorSessionId = document.getElementById("inspector-session-id");

  let currentSessionId = null;

  // 1. Theme Toggle (Light default, Dark alternate) per §3.2 & §3.3
  let currentTheme = localStorage.getItem("hachimi-theme") || "light";
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeButtonUI();

  btnThemeToggle.addEventListener("click", () => {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("hachimi-theme", currentTheme);
    updateThemeButtonUI();
  });

  function updateThemeButtonUI() {
    if (currentTheme === "dark") {
      themeIcon.textContent = "🌙";
      themeText.textContent = "Dark";
    } else {
      themeIcon.textContent = "☀️";
      themeText.textContent = "Light";
    }
  }

  // 2. Fetch Daemon & Agent Runtime Status
  async function updateStatus() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById("status-provider").textContent = data.llm?.provider || "mock";
      document.getElementById("status-tokens").textContent = `${
        data.context?.estimatedTokens || 0
      } / ${data.context?.maxTokens || 12000} (${data.context?.ratio || "0%"})`;
      document.getElementById("status-memories").textContent =
        `${data.memory?.totalCount || 0} items`;

      if (data.session && !currentSessionId) {
        currentSessionId = data.session.id;
        if (inspectorSessionId) inspectorSessionId.textContent = currentSessionId;
      }
    } catch (e) {
      console.error("Unable to fetch status:", e);
    }
  }

  // 3. Load & Render Historical Session Messages
  async function loadSessionMessages(sessionId) {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.session) return;

      messagesContainer.innerHTML = "";

      if (data.session.messages && data.session.messages.length > 0) {
        data.session.messages.forEach((msg) => {
          appendMessage(msg.role, msg.content);
        });
      } else {
        appendMessage(
          "assistant",
          "Hello! I am your Hachimi personal AI assistant. I can help manage your daily tasks, retrieve memory preferences, and execute system tools safely. How can I assist you today?"
        );
      }
    } catch (e) {
      console.error("Unable to load session messages:", e);
    }
  }

  // 4. Fetch Sessions List
  async function loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();

      sessionList.innerHTML = "";
      const sessions = data.sessions || [];

      if (!currentSessionId && sessions.length > 0) {
        currentSessionId = sessions[0].id;
        if (inspectorSessionId) inspectorSessionId.textContent = currentSessionId;
      }

      sessions.forEach((sess) => {
        const li = document.createElement("li");
        li.className = `session-item ${sess.id === currentSessionId ? "active" : ""}`;
        li.textContent = sess.title || sess.id;
        li.addEventListener("click", () => {
          currentSessionId = sess.id;
          if (inspectorSessionId) inspectorSessionId.textContent = currentSessionId;
          document.querySelectorAll(".session-item").forEach((el) => el.classList.remove("active"));
          li.classList.add("active");
          document.getElementById("current-session-title").textContent = sess.title || sess.id;
          loadSessionMessages(sess.id);
        });
        sessionList.appendChild(li);
      });

      if (currentSessionId) {
        const activeSess = sessions.find((s) => s.id === currentSessionId);
        if (activeSess) {
          document.getElementById("current-session-title").textContent =
            activeSess.title || activeSess.id;
        }
        loadSessionMessages(currentSessionId);
      }
    } catch (e) {
      console.error("Unable to load sessions:", e);
    }
  }

  // 5. Append Message following Design System §8.7
  function appendMessage(role, text) {
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${role}`;

    let contentEl;

    if (role === "user") {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = typeof text === "string" ? text : JSON.stringify(text);
      wrapper.appendChild(bubble);
      contentEl = bubble;
    } else {
      const identity = document.createElement("div");
      identity.className = "assistant-identity";
      identity.innerHTML = `<div class="assistant-avatar">H</div><span>Hachimi</span>`;

      const flow = document.createElement("div");
      flow.className = "document-flow";
      flow.textContent = typeof text === "string" ? text : JSON.stringify(text);

      wrapper.appendChild(identity);
      wrapper.appendChild(flow);
      contentEl = flow;
    }

    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return contentEl;
  }

  // 6. Send Chat Prompt (SSE Streaming)
  async function sendMessage() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    appendMessage("user", prompt);
    promptInput.value = "";

    const assistantContentEl = appendMessage("assistant", "Thinking...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          prompt,
          sessionId: currentSessionId,
          stream: true,
        }),
      });

      if (!response.ok) {
        assistantContentEl.textContent = "Request failed. Daemon returned an error.";
        return;
      }

      assistantContentEl.textContent = "";

      const reader = response.body.getReader();
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
              if (data.type === "chunk") {
                assistantContentEl.textContent += data.chunk;
              } else if (data.type === "done") {
                if (data.content && !assistantContentEl.textContent) {
                  assistantContentEl.textContent = data.content;
                }
              }
            } catch (e) {
              /* ignore parse errors */
            }
          }
        }
      }

      updateStatus();
      loadSessions();
    } catch (err) {
      assistantContentEl.textContent = `Send exception: ${err.message || String(err)}`;
    }
  }

  // 7. Mid-turn Steering
  async function sendSteer() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    try {
      const res = await fetch("/api/chat/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      appendMessage(
        "assistant",
        `[⚡ Steer Response]: ${data.success ? "Successfully injected steering prompt" : "Agent currently idle"}`
      );
      promptInput.value = "";
    } catch (err) {
      alert(`Steer Error: ${err.message}`);
    }
  }

  // 8. Portable Bundle Export
  async function exportBundle() {
    try {
      const res = await fetch("/api/export");
      const data = await res.json();

      if (data.success && data.bundle) {
        const blob = new Blob([JSON.stringify(data.bundle, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hachimi_bundle_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert(`Export error: ${err.message}`);
    }
  }

  // 9. Portable Bundle Import
  async function importBundle(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const bundle = JSON.parse(e.target.result);
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bundle, mergeStrategy: "additive" }),
        });
        const data = await res.json();
        if (data.success) {
          alert(
            `Bundle imported successfully! Skipped memories: ${data.result?.skippedMemoriesCount || 0}`
          );
          updateStatus();
          loadSessions();
        } else {
          alert(`Bundle import failed`);
        }
      } catch (err) {
        alert(`Failed to read file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // Bind Event Listeners
  btnSend.addEventListener("click", sendMessage);
  btnSteer.addEventListener("click", sendSteer);
  btnExport.addEventListener("click", exportBundle);
  inputImport.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      importBundle(e.target.files[0]);
    }
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  btnNewSession.addEventListener("click", async () => {
    const title = prompt("Enter new session title:", `Session ${new Date().toLocaleTimeString()}`);
    if (!title) return;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (data.session) {
      currentSessionId = data.session.id;
      if (inspectorSessionId) inspectorSessionId.textContent = currentSessionId;
      loadSessions();
    }
  });

  // Initialization
  async function init() {
    await updateStatus();
    await loadSessions();
  }

  init();
});
