import { handlePlan } from "@/lib/handlers.ts";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => handlePlan(req);
