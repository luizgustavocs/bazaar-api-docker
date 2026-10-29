import { FastifyInstance } from "fastify";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { timingSafeEqual } from "crypto";
import path from "path";

interface SyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  lastLines: string[];
}

const MAX_LINES = 40;

const state: SyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  lastLines: [],
};

function pushOutput(chunk: Buffer): void {
  const lines = chunk.toString().split("\n").filter(Boolean);
  for (const line of lines) {
    console.log(`[SYNC] ${line}`);
    state.lastLines.push(line);
  }
  if (state.lastLines.length > MAX_LINES) {
    state.lastLines.splice(0, state.lastLines.length - MAX_LINES);
  }
}

function isAuthorized(provided: unknown, secret: string): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Rotas internas para disparar o sync a partir de um cron externo (ex: cron-job.org).
// O sync roda em um processo separado (apps/crawler/dist/.../ci.js) para isolar
// memória e falhas da API.
export async function syncRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", async (request, reply) => {
    const secret = process.env.SYNC_SECRET;
    if (!secret) {
      return reply.status(503).send({ error: "SYNC_SECRET não configurado" });
    }
    if (!isAuthorized(request.headers["x-sync-token"], secret)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  fastify.post("/internal/sync", async (_request, reply) => {
    if (state.running) {
      return reply
        .status(409)
        .send({ message: "Sync já em andamento", startedAt: state.startedAt });
    }

    const script = path.resolve(
      process.cwd(),
      "apps/crawler/dist/crawler/src/ci.js",
    );
    if (!existsSync(script)) {
      return reply
        .status(500)
        .send({ error: "ci.js não encontrado. Rode o build." });
    }

    state.running = true;
    state.startedAt = new Date().toISOString();
    state.finishedAt = null;
    state.exitCode = null;
    state.lastLines = [];

    const child = spawn(process.execPath, [script], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", pushOutput);
    child.stderr.on("data", pushOutput);
    child.on("error", (err) => pushOutput(Buffer.from(`spawn error: ${err.message}`)));
    child.on("close", (code) => {
      state.running = false;
      state.finishedAt = new Date().toISOString();
      state.exitCode = code;
    });

    return reply
      .status(202)
      .send({ message: "Sync iniciado", startedAt: state.startedAt });
  });

  fastify.get("/internal/sync/status", async () => state);
}
