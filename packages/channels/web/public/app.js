// packages/channels/web/public/app.js - Hachimi Shell Layout v1 Client

document.addEventListener("DOMContentLoaded", () => {
  const promptInput = document.getElementById("prompt-input");
  const btnSend = document.getElementById("btn-send");
  const btnSteer = document.getElementById("btn-steer");
  const btnNewSession = document.getElementById("btn-new-session");
  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const themeText = document.getElementById("theme-text");
  const messagesContainer = document.getElementById("messages-container");
  const sessionList = document.getElementById("session-list");
  const emptyState = document.getElementById("empty-state");
  const inspectorSessionId = document.getElementById("inspector-session-id");
  const toastViewport = document.getElementById("toast-viewport");

  // Inspector & Settings
  const inspectorToggle = document.getElementById("inspector-toggle");
  const contextPanel = document.getElementById("context-panel");
  const settingsDialog = document.getElementById("settings-dialog");
  const btnOpenSettings = document.getElementById("btn-open-settings");
  const btnCloseSettings = document.getElementById("btn-close-settings");
  const btnNavSettings = document.getElementById("btn-nav-settings");
  const btnNavMemory = document.getElementById("btn-nav-memory");
  const btnSettingsExport = document.getElementById("btn-settings-export");
  const inputSettingsImport = document.getElementById("input-settings-import");
  const chipExportBundle = document.getElementById("chip-export-bundle");

  // Mobile Drawers
  const navToggle = document.getElementById("nav-toggle");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const contextBackdrop = document.getElementById("context-backdrop");

  let currentSessionId = null;

  // 1. Toast Notifications
  function showToast(message, type = "info") {
    if (!toastViewport) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type === "success" ? "toast-success" : type === "danger" ? "toast-danger" : ""}`;

    const msgEl = document.createElement("div");
    msgEl.className = "toast-message";
    msgEl.textContent = message;

    const dismiss = document.createElement("button");
    dismiss.className = "btn-icon toast-dismiss";
    dismiss.innerHTML = `✕`;
    dismiss.onclick = () => toast.remove();

    toast.appendChild(msgEl);
    toast.appendChild(dismiss);
    toastViewport.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4000);
  }

  // 2. Relative Time Formatter for Titled Session Items per PM Spec §2.5
  function formatRelativeTime(timestamp) {
    if (!timestamp) return "Just now";
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return "Yesterday";
    return new Date(timestamp).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  }

  // 3. Theme Toggle (Light default, Dark alternate)
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
    themeText.textContent = currentTheme === "dark" ? "🌙 Dark" : "☀️ Light";
  }

  // 4. Inspector Toggle & Tabs (§2.7)
  let inspectorOpen = false;
  function toggleInspector() {
    inspectorOpen = !inspectorOpen;
    contextPanel.style.display = inspectorOpen ? "flex" : "none";
    if (inspectorOpen && window.innerWidth < 1100) {
      document.body.classList.add("context-open");
    } else {
      document.body.classList.remove("context-open");
    }
  }

  if (inspectorToggle) inspectorToggle.addEventListener("click", toggleInspector);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tabName = e.target.getAttribute("data-tab");
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");

      document.querySelectorAll(".tab-content").forEach((tc) => (tc.style.display = "none"));
      const targetContent = document.getElementById(`tab-content-${tabName}`);
      if (targetContent) targetContent.style.display = "block";
    });
  });

  // 5. Settings Modal (§2.8)
  function openSettings() {
    if (settingsDialog && typeof settingsDialog.showModal === "function") {
      settingsDialog.showModal();
    } else if (settingsDialog) {
      settingsDialog.style.display = "block";
    }
  }

  function closeSettings() {
    if (settingsDialog && typeof settingsDialog.close === "function") {
      settingsDialog.close();
    } else if (settingsDialog) {
      settingsDialog.style.display = "none";
    }
  }

  if (btnOpenSettings) btnOpenSettings.addEventListener("click", openSettings);
  if (btnNavSettings) btnNavSettings.addEventListener("click", openSettings);
  if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettings);

  if (btnNavMemory) {
    btnNavMemory.addEventListener("click", () => {
      showToast("Memory Browser: Navigated to memory workspace", "info");
    });
  }

  // 6. Responsive Drawers
  if (navToggle) {
    navToggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", () => {
      document.body.classList.remove("sidebar-open");
    });
  }
  if (contextBackdrop) {
    contextBackdrop.addEventListener("click", () => {
      document.body.classList.remove("context-open");
      contextPanel.style.display = "none";
      inspectorOpen = false;
    });
  }

  // Keyboard Shortcuts (⌘K, ⌘\, ⌘,) per Design System §15
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
      e.preventDefault();
      toggleInspector();
    } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      openSettings();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "b") {
      e.preventDefault();
      document.body.classList.toggle("sidebar-open");
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      createNewSession();
    }
  });

  // 7. Update Status & Chrome Health Bar (§2.4)
  async function updateStatus() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data = await res.json();

      const provider = data.llm?.provider || "deepseek";
      const ratio = data.context?.ratio || "0%";
      const memories = data.memory?.totalCount || 0;

      const summaryText = `Connected · ${provider} · ${ratio} context · ${memories} memories · PathJail on`;
      const chromeSummary = document.getElementById("chrome-summary");
      if (chromeSummary) chromeSummary.textContent = summaryText;

      const settingsProviderVal = document.getElementById("settings-provider-val");
      if (settingsProviderVal) settingsProviderVal.textContent = provider;

      if (data.session && !currentSessionId) {
        currentSessionId = data.session.id;
        if (inspectorSessionId) inspectorSessionId.textContent = currentSessionId;
      }
    } catch (e) {
      console.error("Unable to fetch status:", e);
    }
  }

  // 8. Load & Render Historical Session Messages
  async function loadSessionMessages(sessionId) {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.session) return;

      messagesContainer.innerHTML = "";

      if (data.session.messages && data.session.messages.length > 0) {
        if (emptyState) emptyState.style.display = "none";
        data.session.messages.forEach((msg) => {
          appendMessage(msg.role, msg.content);
        });
      } else {
        if (emptyState) {
          messagesContainer.appendChild(emptyState);
          emptyState.style.display = "block";
        }
      }
    } catch (e) {
      console.error("Unable to load session messages:", e);
    }
  }

  // 9. Fetch Sessions List (Titled Work Items per §2.5)
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

        const titleSpan = document.createElement("span");
        titleSpan.className = "session-title";
        titleSpan.textContent = sess.title || sess.id;

        const metaSpan = document.createElement("span");
        metaSpan.className = "session-meta";
        metaSpan.textContent = formatRelativeTime(sess.updatedAt);

        li.appendChild(titleSpan);
        li.appendChild(metaSpan);

        li.addEventListener("click", () => {
          currentSessionId = sess.id;
          if (inspectorSessionId) inspectorSessionId.textContent = currentSessionId;
          document.querySelectorAll(".session-item").forEach((el) => el.classList.remove("active"));
          li.classList.add("active");
          document.getElementById("current-session-title").textContent = sess.title || sess.id;
          document.body.classList.remove("sidebar-open");
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

  // 10. Append Message (Document Flow)
  function appendMessage(role, text) {
    if (emptyState && emptyState.parentNode === messagesContainer) {
      emptyState.style.display = "none";
    }

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
      identity.innerHTML = `<div class="assistant-avatar">H</div><span>Hachimi</span><span class="assistant-time">${new Date().toLocaleTimeString()}</span>`;

      const flow = document.createElement("div");
      flow.className = "document-flow";

      const str = typeof text === "string" ? text : JSON.stringify(text);
      const p = document.createElement("p");
      p.textContent = str;
      flow.appendChild(p);

      wrapper.appendChild(identity);
      wrapper.appendChild(flow);
      contentEl = p;
    }

    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return contentEl;
  }

  // 11. Send Prompt
  async function sendMessage(overridePrompt) {
    const prompt = (overridePrompt || promptInput.value).trim();
    if (!prompt) return;

    appendMessage("user", prompt);
    promptInput.value = "";

    const assistantContentEl = appendMessage("assistant", "Thinking...");
    const turnStart = Date.now();

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
        showToast("Request failed. Daemon error.", "danger");
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

      const latencyMs = Date.now() - turnStart;
      const inspectorLatency = document.getElementById("inspector-latency");
      if (inspectorLatency) inspectorLatency.textContent = `${latencyMs}ms`;

      updateStatus();
      loadSessions();
    } catch (err) {
      assistantContentEl.textContent = `Send exception: ${err.message || String(err)}`;
      showToast(`Send exception: ${err.message || String(err)}`, "danger");
    }
  }

  // Suggestion Chips Click Handlers
  document.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => {
      const promptAttr = chip.getAttribute("data-prompt");
      if (promptAttr) sendMessage(promptAttr);
    });
  });

  if (chipExportBundle) {
    chipExportBundle.addEventListener("click", exportBundle);
  }

  // 12. Steering
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
      showToast(
        data.success ? "Steering prompt injected" : "Agent is idle",
        data.success ? "success" : "info"
      );
      promptInput.value = "";
    } catch (err) {
      showToast(`Steer Error: ${err.message}`, "danger");
    }
  }

  // 13. Bundle Export / Import
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
        showToast("Portable Memory Bundle exported!", "success");
      }
    } catch (err) {
      showToast(`Export error: ${err.message}`, "danger");
    }
  }

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
          showToast(
            `Bundle imported! Skipped memories: ${data.result?.skippedMemoriesCount || 0}`,
            "success"
          );
          updateStatus();
          loadSessions();
        } else {
          showToast("Bundle import failed", "danger");
        }
      } catch (err) {
        showToast(`Failed to read file: ${err.message}`, "danger");
      }
    };
    reader.readAsText(file);
  }

  if (btnSettingsExport) btnSettingsExport.addEventListener("click", exportBundle);
  if (inputSettingsImport) {
    inputSettingsImport.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        importBundle(e.target.files[0]);
      }
    });
  }

  // 14. Create New Session
  async function createNewSession() {
    const title = prompt("Enter new session title:", "New Workspace Session");
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
      showToast("New session created", "success");
      loadSessions();
    }
  }

  // Event Listeners
  btnSend.addEventListener("click", () => sendMessage());
  btnSteer.addEventListener("click", sendSteer);

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  btnNewSession.addEventListener("click", createNewSession);

  // Initialization
  async function init() {
    await updateStatus();
    await loadSessions();
  }

  init();
});
