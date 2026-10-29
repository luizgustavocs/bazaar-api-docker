import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { formatCharacterData } from "../utils/formatters";

interface CharacterQuery {
  name?: string;
  vocation?: string;
  world?: string;
  minLevel?: string;
  maxLevel?: string;
  sortBy?: "price_asc" | "price_desc" | "level_asc" | "level_desc";
  page?: string;
  limit?: string;
}

export async function characterRoutes(fastify: FastifyInstance) {
  fastify.get("/", async () => {
    return {
      message: "Tibia Scout API",
      endpoints: ["/characters", "/characters/expired", "/health"],
    };
  });

  fastify.get("/characters", async (request) => {
    const { name, vocation, world, minLevel, maxLevel, sortBy, page, limit } =
      request.query as CharacterQuery;

    const currentPage = parseInt(page || "1");
    const itemsPerPage = parseInt(limit || "20");
    const skip = (currentPage - 1) * itemsPerPage;

    // endsAt é um timestamp Unix em texto (sempre 10 dígitos), então a
    // comparação lexicográfica equivale à numérica. Nunca lista leilão expirado,
    // mesmo que o sync esteja atrasado.
    const nowInSeconds = Math.floor(Date.now() / 1000).toString();

    const where: Prisma.CharacterWhereInput = {
      level: { gt: 0 },
      vocation: { not: "" },
      auction: { is: { endsAt: { gt: nowInSeconds } } },
    };

    if (name) {
      where.name = { contains: name };
    }

    if (vocation) {
      where.vocation = {
        contains: vocation,
      };
    }

    if (world) {
      where.world = {
        contains: world,
      };
    }

    if (minLevel || maxLevel) {
      const levelFilter: Prisma.IntFilter = { gt: 0 };
      if (minLevel) levelFilter.gte = parseInt(minLevel);
      if (maxLevel) levelFilter.lte = parseInt(maxLevel);
      where.level = levelFilter;
    }

    let orderBy: Prisma.CharacterOrderByWithRelationInput = { level: "desc" };
    if (sortBy === "level_asc") orderBy = { level: "asc" };
    if (sortBy === "level_desc") orderBy = { level: "desc" };
    if (sortBy === "price_asc") orderBy = { auction: { price: "asc" } };
    if (sortBy === "price_desc") orderBy = { auction: { price: "desc" } };

    const [totalItems, characters] = await Promise.all([
      prisma.character.count({ where }),
      prisma.character.findMany({
        where,
        include: { auction: true },
        orderBy,
        skip,
        take: itemsPerPage,
      }),
    ]);

    return {
      metadata: {
        total: totalItems,
        page: currentPage,
        totalPages: Math.ceil(totalItems / itemsPerPage),
        hasMore: skip + characters.length < totalItems,
      },
      data: characters.map(formatCharacterData),
    };
  });

  fastify.get("/characters/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const character = await prisma.character.findUnique({
      where: { id: parseInt(id) },
      include: { auction: true },
    });

    if (!character) {
      return reply.status(404).send({ error: "Character not found" });
    }

    return formatCharacterData(
      character as Parameters<typeof formatCharacterData>[0],
    );
  });

  fastify.delete("/characters/expired", async (_request, reply) => {
    try {
      const nowInSeconds = Math.floor(Date.now() / 1000).toString();

      const expiredAuctions = await prisma.auction.findMany({
        where: {
          endsAt: {
            lt: nowInSeconds,
          },
        },
        select: {
          id: true,
          characterId: true,
        },
      });

      if (expiredAuctions.length === 0) {
        return { message: "Nenhum leilão para limpar", count: 0 };
      }

      const auctionIds = expiredAuctions.map((a) => a.id);
      const characterIds = expiredAuctions.map((a) => a.characterId);

      await prisma.auction.deleteMany({
        where: {
          id: { in: auctionIds },
        },
      });

      const deletedCharacters = await prisma.character.deleteMany({
        where: {
          id: { in: characterIds },
        },
      });

      return {
        message: "Limpeza concluída",
        count: deletedCharacters.count,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: "Internal Server Error" });
    }
  });
}
