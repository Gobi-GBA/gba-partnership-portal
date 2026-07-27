// Storage entry point — picks the database driver at runtime:
//   - DATABASE_URL set  → Postgres (Neon serverless driver; used on Vercel)
//   - otherwise         → local SQLite file (sandbox / self-hosted)
// The SQLite driver is loaded lazily so serverless deployments never touch
// the native better-sqlite3 module at runtime.
import type { IStorage } from "./storage-common.js";

export { hashPassword, verifyPassword } from "./storage-common.js";
export type { IStorage } from "./storage-common.js";

const implPromise: Promise<IStorage> = process.env.DATABASE_URL
  ? import("./storage-pg.js").then((m) => m.createPgStorage())
  : import("./storage-sqlite.js").then((m) => m.createSqliteStorage());

// v6.0: data version — bumped after every write (any method not starting with
// get/list) so the hot-list micro-cache in routes.ts invalidates instantly.
let dataVersion = 1;
export function getDataVersion() {
  return dataVersion;
}
const READ_METHOD = /^(get|list)/;

// Every IStorage method returns a Promise, so a thin async proxy keeps the
// public `storage` object synchronous to import while the driver loads lazily.
export const storage: IStorage = new Proxy({} as IStorage, {
  get(_target, prop: string) {
    return (...args: unknown[]) =>
      implPromise.then((impl) => {
        const out = (impl as any)[prop](...args);
        if (!READ_METHOD.test(prop) && out instanceof Promise) {
          const bump = () => {
            dataVersion++;
          };
          out.then(bump, bump);
        }
        return out;
      });
  },
});
