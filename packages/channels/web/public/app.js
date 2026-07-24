// packages/channels/web/public/app.js

document.addEventListener("DOMContentLoaded", () => {
  const promptInput = document.getElementById("prompt-input");
  const btnSend = document.getElementById("btn-send");
  const btnSteer = document.getElementById("btn-steer");
  const btnExport = document.getElementById("btn-export");
  const inputImport = document.getElementById("input-import");
  const btnNewSession = document.getElementById("btn-new-session");
  const messagesContainer = document.getElementById("messages-container");
  const sessionList = document.getElementById("session-list");

  let currentSessionId = null;

  // 1. 获取守护进程与 Agent 状态
  async function updateStatus() {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById("status-provider").textContent = data.llm?.provider || "mock";
      document.getElementById("status-tokens").textContent =
        `${data.context?.estimatedTokens || 0} / ${data.context?.maxTokens || 12000} (${data.context?.ratio || "0%"})`;
      document.getElementById("status-memories").textContent = `${data.memory?.totalCount || 0} 条`;

      if (data.session && !currentSessionId) {
        currentSessionId = data.session.id;
      }
    } catch (e) {
      console.error("无法获取状态:", e);
    }
  }

  // 2. 获取会话列表
  async function loadSessions() {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();

      sessionList.innerHTML = "";
      (data.sessions || []).forEach((sess) => {
        const li = document.createElement("li");
        li.className = `session-item ${sess.id === currentSessionId ? "active" : ""}`;
        li.textContent = sess.title || sess.id;
        li.addEventListener("click", () => {
          currentSessionId = sess.id;
          document.querySelectorAll(".session-item").forEach((el) => el.classList.remove("active"));
          li.classList.add("active");
          document.getElementById("current-session-title").textContent = sess.title || sess.id;
        });
        sessionList.appendChild(li);
      });
    } catch (e) {
      console.error("无法加载会话:", e);
    }
  }

  // 3. 追加消息泡泡
  function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "👤" : "🍯";

    const bubble = document.createElement("div");
    bubble.className = "bubble glass-bubble";
    bubble.textContent = text;

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return bubble;
  }

  // 4. 发送对话请求 (支持 SSE 流式打字机)
  async function sendMessage() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    appendMessage("user", prompt);
    promptInput.value = "";

    const assistantBubble = appendMessage("assistant", "正在思考中...");

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
        assistantBubble.textContent = "请求失败，守护进程返回错误。";
        return;
      }

      assistantBubble.textContent = "";

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
                assistantBubble.textContent += data.chunk;
              } else if (data.type === "done") {
                if (data.content && !assistantBubble.textContent) {
                  assistantBubble.textContent = data.content;
                }
              }
            } catch (e) {
              /* ignore parse errors */
            }
          }
        }
      }

      updateStatus();
    } catch (err) {
      assistantBubble.textContent = `发送异常: ${err.message || String(err)}`;
    }
  }

  // 5. C6 Mid-turn Steer 对话中途转向
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
        `[⚡ Steer 中途转向响应]: ${data.success ? "成功注入转向指令" : "Agent 当前未在运行中"}`
      );
      promptInput.value = "";
    } catch (err) {
      alert(`Steer 错误: ${err.message}`);
    }
  }

  // 6. Phase D Portable Bundle 导出
  async function exportBundle() {
    try {
      const res = await fetch("/api/export");
      const data = await res.json();

      if (data.success && data.bundle) {
        const blob = new Blob([JSON.stringify(data.bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hachimi_bundle_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert(`导出失败: ${err.message}`);
    }
  }

  // 7. Phase D Portable Bundle 导入
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
          alert(`数据包导入成功！跳过重复记忆: ${data.result?.skippedMemoriesCount || 0} 条`);
          updateStatus();
          loadSessions();
        } else {
          alert(`数据包导入失败`);
        }
      } catch (err) {
        alert(`读取文件失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // 绑定事件
  btnSend.addEventListener("click", sendMessage);
  btnSteer.addEventListener("click", sendSteer);
  btnExport.addEventListener("click", exportBundle);
  inputImport.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      importBundle(e.target.files[0]);
    }
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  btnNewSession.addEventListener("click", async () => {
    const title = prompt("请输入新会话标题:", `会话 ${new Date().toLocaleTimeString()}`);
    if (!title) return;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (data.session) {
      currentSessionId = data.session.id;
      loadSessions();
    }
  });

  // 初始化加载
  updateStatus();
  loadSessions();
});
