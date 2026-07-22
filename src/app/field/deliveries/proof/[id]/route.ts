import { prisma } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { UserRole } from "@/generated/prisma/client";
import { getPrismaRolesFromUser } from "@/lib/user-role-utils";
import {
  DELIVERY_PROOF_MAX_SIZE,
  hasExpectedDeliveryProofSignature,
} from "@/lib/delivery-proof";

type DeliveryProofFile = {
  fileName: string;
  mimeType: string;
  fileDataUrl: string;
  fileSizeBytes: number | null;
  assignedDriverId: string | null;
  dealerId: string;
  isActive: boolean;
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
      proof."fileSizeBytes",
      proof."isActive",
      delivery."assignedDriverId",
      delivery."dealerId"
    FROM public."DeliveryProof" proof
    INNER JOIN public."Order" delivery ON delivery."id" = proof."orderId"
    WHERE proof."id" = ${id}
    LIMIT 1
  `;
  const proof = rows[0];

  if (!proof) {
    return new Response("Not found", { status: 404 });
  }

  const roles = getPrismaRolesFromUser(session.user);
  const isDriver = roles.includes(UserRole.DRIVER_TRANSPORT);
  const isDealer = roles.includes(UserRole.DEALER);
  const canViewInternally = [
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.QC_TEAM,
    UserRole.DISPATCH_TEAM,
    UserRole.ORDER_TEAM,
  ].some((role) => roles.includes(role));
  const isAssignedDriver =
    isDriver && proof.assignedDriverId === session.user.id;
  const isOwningDealer = isDealer && proof.dealerId === session.user.id;

  if (!canViewInternally && !isAssignedDriver && !isOwningDealer) {
    return new Response("Forbidden", { status: 403 });
  }

  // Replaced proof versions are audit-only and available only to internal roles.
  if (!proof.isActive && !canViewInternally) {
    return new Response("Not found", { status: 404 });
  }

  const expectedPrefix = `data:${proof.mimeType};base64,`;

  if (!proof.fileDataUrl.startsWith(expectedPrefix)) {
    return new Response("Invalid proof data", { status: 500 });
  }

  const bytes = Buffer.from(
    proof.fileDataUrl.slice(expectedPrefix.length),
    "base64",
  );

  if (
    bytes.length <= 0 ||
    bytes.length > DELIVERY_PROOF_MAX_SIZE ||
    (proof.fileSizeBytes !== null && proof.fileSizeBytes !== bytes.length) ||
    !hasExpectedDeliveryProofSignature(bytes, proof.mimeType)
  ) {
    return new Response("Invalid proof data", { status: 500 });
  }

  const encodedFileName = encodeURIComponent(proof.fileName);

  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `inline; filename*=UTF-8''${encodedFileName}`,
      "Content-Security-Policy": "frame-ancestors 'self'",
      "Content-Type": proof.mimeType,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
