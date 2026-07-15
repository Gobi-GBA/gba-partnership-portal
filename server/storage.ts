// Storage entry point — picks the database driver at runtime:
//   - DATABASE_URL set  → Postgres (Neon serverless driver; used on Vercel)
//   - otherwise         → local SQLite file (sandbox / self-hosted)
// The SQLite driver is loaded lazily so serverless deployments never touch
// the native better-sqlite3 module at runtime.
import type { IStorage } from "./storage-common";

export { hashPassword, verifyPassword } from "./storage-common";
export type { IStorage } from "./storage-common";

const implPromise: Promise<IStorage> = process.env.DATABASE_URL
  ? import("./storage-pg").then((m) => m.createPgStorage())
  : import("./storage-sqlite").then((m) => m.createSqliteStorage());

// Every IStorage method returns a Promise, so a thin async proxy keeps the
// public `storage` object synchronous to import while the driver loads lazily.
export const storage: IStorage = new Proxy({} as IStorage, {
  get(_target, prop: string) {
    return (...args: unknown[]) =>
      implPromise.then((impl) => (impl as any)[prop](...args));
  },
});
