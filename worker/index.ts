import { handleHealth, handlePlan } from "../lib/handlers.ts";

type Env = { ASSETS: { fetch: (req: Request) => Promise<Response> } };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/plan") return handlePlan(req);
    if (pathname === "/api/health") return handleHealth();
    return env.ASSETS.fetch(req);
  },
};
