import Fastify from "fastify";
import cors from "@fastify/cors";
import { characterRoutes } from "./routes/character";
import { syncRoutes } from "./routes/sync";
import { healthRoutes } from "./controllers/healthController";

const app = Fastify({ logger: true, connectionTimeout: 10000 });

app.register(cors, { origin: true });

// ROTA RAIZ GLOBAL (Resolve o 404 do Render)
app.get("/", async () => {
  return {
    status: "online",
    project: "Tibia Scout API",
    documentation: "/api/characters",
  };
});

app.register(healthRoutes);
app.register(characterRoutes, { prefix: "/api" });
app.register(syncRoutes, { prefix: "/api" });

// Tratamento global de erros para não expor detalhes sensíveis do banco em produção
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  reply.status(500).send({
    error: "Internal Server Error",
    message: "Ocorreu um erro ao processar sua requisição no servidor.",
  });
});

export default app;
