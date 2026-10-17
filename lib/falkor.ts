import { FalkorDB, type Graph } from "falkordb";

let client: Promise<FalkorDB> | null = null;

/** One shared connection per process. FALKORDB_URL: falkor[s]://[user[:pass]@]host:port */
export function db(): Promise<FalkorDB> {
  if (!client) {
    const url = process.env.FALKORDB_URL || "falkor://localhost:16379";
    client = FalkorDB.connect({ url, socket: { connectTimeout: 10_000 } } as never).catch((err) => {
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
