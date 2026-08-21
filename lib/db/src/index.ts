import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export let pool: pg.Pool;
export let db: any;

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("No database URL");
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} catch (e) {
  console.warn('[AI Studio] Database not connected — using mock');
  
  const createChainable = (): any => {
    const fn = () => createChainable();
    fn.then = (resolve: any) => resolve([]);
    fn.catch = (reject: any) => fn;
    fn.finally = (cb: any) => { cb(); return fn; };
    return new Proxy(fn, {
      get: (target, prop) => {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return target[prop as keyof typeof target];
        }
        return createChainable();
      }
    });
  };

  db = new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'query') {
        const noOp = { 
          findMany: async () => [], 
          findFirst: async () => null,
          findUnique: async () => null, 
          create: async (d: any) => d?.data ?? {},
          update: async (d: any) => d?.data ?? {}, 
          delete: async () => ({}) 
        };
        return new Proxy({}, { get: () => noOp });
      }
      return createChainable();
    }
  });
}

export * from "./schema";
