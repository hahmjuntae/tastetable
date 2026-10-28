import { handleHealth } from "@/lib/handlers.ts";

export const dynamic = "force-dynamic";

export const GET = () => handleHealth();
