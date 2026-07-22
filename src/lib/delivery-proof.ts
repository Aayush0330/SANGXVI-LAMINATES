import { createHash } from "crypto";

export const DELIVERY_PROOF_MAX_SIZE = 3 * 1024 * 1024;
export const DELIVERY_PROOF_MAX_NOTE_LENGTH = 500;
export const DELIVERY_PROOF_MIN_REPLACEMENT_REASON_LENGTH = 10;

export const DELIVERY_PROOF_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export function hasExpectedDeliveryProofSignature(
  bytes: Uint8Array,
  mimeType: string,
) {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (mimeType === "image/jpeg") {
    return startsWith([0xff, 0xd8, 0xff]);
  }

  if (mimeType === "image/png") {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mimeType === "image/webp") {
    return (
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      [0x57, 0x45, 0x42, 0x50].every(
        (byte, index) => bytes[index + 8] === byte,
      )
    );
  }

  if (mimeType === "application/pdf") {
    return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]);
  }

  return false;
}

export function sanitizeDeliveryProofFileName(
  fileName: string | undefined,
  mimeType: string,
) {
  const extension = MIME_EXTENSION[mimeType] ?? "";
  const cleaned = (fileName || `signed-duplicate-invoice${extension}`)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 180)
    .trim();

  if (!cleaned) {
    return `signed-duplicate-invoice${extension}`;
  }

  const lowerName = cleaned.toLowerCase();
  const knownExtensions = Object.values(MIME_EXTENSION);
  const hasKnownExtension = knownExtensions.some((value) =>
    lowerName.endsWith(value),
  );

  return hasKnownExtension ? cleaned : `${cleaned}${extension}`;
}

export async function readAndValidateDeliveryProof(
  file: File | null,
  note: string,
) {
  if (!file || file.size <= 0) {
    return { error: "missing-proof" as const };
  }

  if (!DELIVERY_PROOF_MIME_TYPES.has(file.type)) {
    return { error: "invalid-proof-type" as const };
  }

  if (file.size > DELIVERY_PROOF_MAX_SIZE) {
    return { error: "proof-too-large" as const };
  }

  if (note.length > DELIVERY_PROOF_MAX_NOTE_LENGTH) {
    return { error: "proof-note-too-long" as const };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length !== file.size || buffer.length < 12) {
    return { error: "invalid-proof-content" as const };
  }

  if (!hasExpectedDeliveryProofSignature(buffer, file.type)) {
    return { error: "invalid-proof-content" as const };
  }

  return {
    fileDataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
    fileSizeBytes: buffer.length,
    fileSha256: createHash("sha256").update(buffer).digest("hex"),
    mimeType: file.type,
    fileName: sanitizeDeliveryProofFileName(file.name, file.type),
  };
}
