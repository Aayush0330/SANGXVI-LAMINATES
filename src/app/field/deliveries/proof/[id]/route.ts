import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { UserRole } from "@/generated/prisma/client";

type DeliveryProofFile = {
  fileName: string;
  mimeType: string;
  fileDataUrl: string;
  assignedDriverId: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const rows = await prisma.$queryRaw<DeliveryProofFile[]>`
    SELECT
      proof."fileName",
      proof."mimeType",
      proof."fileDataUrl",
      delivery."assignedDriverId"
    FROM "DeliveryProof" proof
    INNER JOIN "Order" delivery ON delivery."id" = proof."orderId"
    WHERE proof."id" = ${id}
    LIMIT 1
  `;
  const proof = rows[0];

  if (!proof) {
    return new Response("Not found", { status: 404 });
  }

  if (
    session.user.role === UserRole.DRIVER_TRANSPORT &&
    proof.assignedDriverId !== session.user.id
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const internalProofRoles: UserRole[] = [
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.INVENTORY_TEAM,
    UserRole.DISPATCH_TEAM,
  ];

  if (
    session.user.role !== UserRole.DRIVER_TRANSPORT &&
    !internalProofRoles.includes(session.user.role)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const expectedPrefix = `data:${proof.mimeType};base64,`;

  if (!proof.fileDataUrl.startsWith(expectedPrefix)) {
    return new Response("Invalid proof data", { status: 500 });
  }

  const bytes = Buffer.from(proof.fileDataUrl.slice(expectedPrefix.length), "base64");
  const encodedFileName = encodeURIComponent(proof.fileName);

  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedFileName}`,
      "Content-Type": proof.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
