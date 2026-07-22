import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      imageData: true,
      imageMimeType: true,
      imageFileName: true,
      updatedAt: true,
    },
  });

  if (!product?.imageData || !product.imageMimeType) {
    return new Response("Not found", { status: 404 });
  }

  const fileName = encodeURIComponent(product.imageFileName || `product-${id}`);
  return new Response(Buffer.from(product.imageData), {
    headers: {
      "Cache-Control": "private, max-age=3600, must-revalidate",
      "Content-Disposition": `inline; filename*=UTF-8''${fileName}`,
      "Content-Type": product.imageMimeType,
      "Last-Modified": product.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
