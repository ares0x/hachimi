// packages/channels/api/src/server.ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  type AppContext,
  HarnessRuntime,
  createAgentSession,
  getOrCreateHarnessRuntime,
} from "@hachimi/core";
import { log } from "@hachimi/shared";
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

export interface HachimiApiServerOptions {
  runtime?: HarnessRuntime;
  appContext?: AppContext;
  port?: number;
  host?: string;
  secretKey?: string;
}

export interface HachimiApiServer {
  runtime: HarnessRuntime;
  appContext: AppContext;
  fastify: FastifyInstance;
  listen(): Promise<string>;
  close(): Promise<void>;
}

export function createHachimiApiServer(options: HachimiApiServerOptions = {}): HachimiApiServer {
  const runtime =
    options.runtime ||
    getOrCreateHarnessRuntime(
      options.appContext ? { providerOverride: options.appContext.config.llm.activeProvider } : {}
    );
  const appContext = runtime.context;

  const secretKey = options.secretKey || process.env.HACHIMI_API_SECRET;
  const authRequired = Boolean(secretKey);

  const server = fastify({ logger: false });

  server.register(cors, { origin: true });
  server.register(websocket);

  // F3: 托管 Web UI 静态资源
  const webPublicDir = resolve(process.cwd(), "packages", "channels", "web", "public");
  if (existsSync(webPublicDir)) {
    server.register(fastifyStatic, {
      root: webPublicDir,
      prefix: "/",
    });
  }

  // C5 传输层 Token 鉴权中间件
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (
      request.url === "/health" ||
      request.url === "/" ||
      request.url.startsWith("/style.css") ||
      request.url.startsWith("/app.js")
    ) {
      return;
    }

    if (!authRequired) {
      return;
    }

    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (request.query && typeof request.query === "object" && "token" in request.query) {
      token = String((request.query as any).token);
    }

    if (!token || token !== secretKey) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid or missing Bearer API secret token",
      });
    }
  });

  // 1. GET /health
  server.get("/health", async () => {
    return {
      status: "ok",
      authRequired,
      version: "0.1.0",
      timestamp: Date.now(),
    };
  });

  // 2. GET /api/status
  server.get("/api/status", async () => {
    return runtime.getStatus();
  });

  // 3. POST /api/chat (全部委派给 HarnessRuntime.execute)
  server.post("/api/chat", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as {
      prompt?: string;
      sessionId?: string;
      provider?: string;
      stream?: boolean;
    };

    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      reply.code(400).send({ error: "Missing required parameter: prompt" });
      return;
    }

    const isSSE =
      body.stream === true || (request.headers.accept || "").includes("text/event-stream");

    if (isSSE) {
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");

      try {
        const output = await runtime.execute({
          prompt,
          sessionId: body.sessionId,
          channel: "web-sse",
          providerOverride: body.provider,
          options: {
            onChunk: (chunk) => {
              reply.raw.write(`data: ${JSON.stringify({ type: "chunk", chunk })}\n\n`);
            },
          },
        });

        reply.raw.write(
          `data: ${JSON.stringify({
            type: "done",
            sessionId: output.sessionId,
            content: output.content,
          })}\n\n`
        );
      } catch (err: any) {
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "error",
            error: err?.message || String(err),
          })}\n\n`
        );
      } finally {
        reply.raw.end();
      }
      return;
    }

    try {
      const output = await runtime.execute({
        prompt,
        sessionId: body.sessionId,
        channel: "api-json",
        providerOverride: body.provider,
      });

      return {
        success: true,
        sessionId: output.sessionId,
        content: output.content,
        durationMs: output.durationMs,
      };
    } catch (err: any) {
      reply.code(500).send({
        success: false,
        sessionId: body.sessionId,
        error: err?.message || String(err),
      });
    }
  });

  // C6: POST /api/chat/steer
  server.post("/api/chat/steer", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { prompt?: string };
    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      reply.code(400).send({ error: "Missing required parameter: prompt" });
      return;
    }

    const steered = runtime.steer(prompt);
    return { success: steered, prompt, isRunning: runtime.agent.isRunning() };
  });

  // C6: POST /api/chat/followup
  server.post("/api/chat/followup", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { prompt?: string };
    const prompt = (body.prompt || "").trim();
    if (!prompt) {
      reply.code(400).send({ error: "Missing required parameter: prompt" });
      return;
    }

    runtime.followUp(prompt);
    return { success: true, prompt };
  });

  // Phase D: GET /api/export
  server.get("/api/export", async () => {
    const bundle = await runtime.exportBundle();
    return { success: true, bundle };
  });

  // Phase D: POST /api/import
  server.post("/api/import", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as { bundle?: any; mergeStrategy?: "additive" | "overwrite" };
    if (!body.bundle) {
      reply.code(400).send({ error: "Missing required parameter: bundle" });
      return;
    }
    const result = await runtime.importBundle(body.bundle, {
      mergeStrategy: body.mergeStrategy,
    });
    return { success: true, result };
  });

  // 4. GET /api/sessions & POST /api/sessions
  server.get("/api/sessions", async () => {
    return { sessions: runtime.sessions.list() };
  });

  server.post("/api/sessions", async (request: FastifyRequest) => {
    const body = (request.body || {}) as { title?: string };
    const created = runtime.sessions.create(body.title);
    return { session: created };
  });

  // 5. GET /api/memory
  server.get("/api/memory", async (request: FastifyRequest) => {
    const query = ((request.query as any)?.query || "").trim();
    if (query) {
      const results = runtime.memory.search(query);
      return { query, results };
    }
    return { memories: runtime.memory.list() };
  });

  // 6. GET /api/ws (WebSocket 通信全部委派给 HarnessRuntime)
  server.get("/api/ws", { websocket: true }, (socket, req) => {
    socket.on("message", async (rawMessage: any) => {
      try {
        const payload = JSON.parse(rawMessage.toString());
        if (payload.type === "chat" && payload.prompt) {
          const output = await runtime.execute({
            prompt: payload.prompt,
            sessionId: payload.sessionId,
            channel: "ws",
            providerOverride: payload.provider,
            options: {
              onChunk: (chunk) => {
                socket.send(JSON.stringify({ type: "chunk", chunk }));
              },
            },
          });

          socket.send(
            JSON.stringify({ type: "done", sessionId: output.sessionId, content: output.content })
          );
        } else if (payload.type === "steer" && payload.prompt) {
          const steered = runtime.steer(payload.prompt);
          socket.send(JSON.stringify({ type: "steer_ack", success: steered }));
        } else if (payload.type === "followup" && payload.prompt) {
          runtime.followUp(payload.prompt);
          socket.send(JSON.stringify({ type: "followup_ack", success: true }));
        } else if (payload.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch (err: any) {
        socket.send(JSON.stringify({ type: "error", message: err?.message || String(err) }));
      }
    });
  });

  return {
    runtime,
    appContext,
    fastify: server,
    async listen() {
      const port = options.port || Number(process.env.HACHIMI_PORT || 3700);
      const host = options.host || process.env.HACHIMI_HOST || "127.0.0.1";
      const address = await server.listen({ port, host });
      log("info", `🚀 Hachimi Daemon Server running at ${address}`, {
        authRequired,
        port,
        host,
      });
      return address;
    },
    async close() {
      await server.close();
    },
  };
}
