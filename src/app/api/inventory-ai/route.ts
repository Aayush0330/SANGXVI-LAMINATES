import { checkPermission } from "@/lib/auth-guards";
import {
  getInventoryAiChatAnswer,
  getInventoryAiInsights,
} from "@/lib/inventory-ai-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { hasAccess } = await checkPermission(
    "manage_inventory",
    "/api/inventory-ai",
  );

  if (!hasAccess) {
    return Response.json({ error: "Access denied." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    question?: unknown;
  };
  const question =
    typeof body.question === "string"
      ? body.question.trim().slice(0, 180)
      : "";

  const insights = await getInventoryAiInsights();
  const answer = getInventoryAiChatAnswer(insights, question);

  return Response.json({ answer });
}
