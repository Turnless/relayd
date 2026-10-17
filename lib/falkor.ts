import { FalkorDB, type FalkorDBOptions, type Graph } from "falkordb";

let client: Promise<FalkorDB> | null = null;

/**
 * One shared connection per process.
 * FalkorDB Cloud: FALKORDB_HOST, FALKORDB_PORT, FALKORDB_USERNAME, FALKORDB_PASSWORD
 * (separate variables, so passwords with special characters need no URL-encoding).
 * Otherwise FALKORDB_URL: falkor://[user[:pass]@]host:port (default falkor://localhost:16379).
 */
export function connectionOptions(): FalkorDBOptions {
  const host = process.env.FALKORDB_HOST?.trim();
  if (host) {
    return {
      socket: { host, port: Number(process.env.FALKORDB_PORT || 6379), connectTimeout: 10_000 },
      username: process.env.FALKORDB_USERNAME?.trim() || undefined,
      password: process.env.FALKORDB_PASSWORD || undefined,
    };
  }
  return { url: process.env.FALKORDB_URL || "falkor://localhost:16379", socket: { connectTimeout: 10_000 } };
}

export function db(): Promise<FalkorDB> {
  if (!client) {
    client = FalkorDB.connect(connectionOptions()).catch((err) => {
      client = null;
      throw err;
    });
  }
  return client;
}

export async function graph(name: string): Promise<Graph> {
  return (await db()).selectGraph(name);
}

export type Params = Record<string, unknown>;

export async function run<T = Record<string, unknown>>(g: Graph, cypher: string, params: Params = {}) {
  const res = await g.query<T>(cypher, { params } as never);
  return res.data ?? [];
}

export async function runRO<T = Record<string, unknown>>(g: Graph, cypher: string, params: Params = {}) {
  const res = await g.roQuery<T>(cypher, { params } as never);
  return res.data ?? [];
}

/** Graph name for a ward. Every ward (tenant) gets its own isolated graph. */
export const wardGraph = (ward: string) => `relayd_ward_${ward.replace(/[^A-Za-z0-9]/g, "")}`;
