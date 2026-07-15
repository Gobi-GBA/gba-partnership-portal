// Vercel serverless entry — all /api/* requests are rewritten here (see vercel.json).
// The Express app handles routing internally; static assets are served by Vercel's CDN.
import { app, ready } from "../server/app.js";

export default async function handler(req: any, res: any) {
  await ready;
  app(req, res);
}
