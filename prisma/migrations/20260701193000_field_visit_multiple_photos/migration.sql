-- Add gallery photos for field visit reports. Existing single shop photos are
-- backfilled so previously created visit reports continue to work.
CREATE TABLE "FieldVisitPhoto" (
  "id" TEXT NOT NULL,
  "fieldVisitId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileDataUrl" TEXT NOT NULL,
  "caption" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FieldVisitPhoto_pkey" PRIMARY KEY ("id")
);

INSERT INTO "FieldVisitPhoto" (
  "id",
  "fieldVisitId",
  "fileName",
  "mimeType",
  "fileDataUrl",
  "caption",
  "sortOrder",
  "uploadedAt"
)
SELECT
  CONCAT('legacy_', "id"),
  "id",
  "shopPhotoFileName",
  "shopPhotoMimeType",
  "shopPhotoDataUrl",
  'Shop proof photo',
  0,
  "createdAt"
FROM "FieldVisit";

CREATE INDEX "FieldVisitPhoto_fieldVisitId_idx"
  ON "FieldVisitPhoto"("fieldVisitId");
CREATE INDEX "FieldVisitPhoto_sortOrder_idx"
  ON "FieldVisitPhoto"("sortOrder");
CREATE INDEX "FieldVisitPhoto_uploadedAt_idx"
  ON "FieldVisitPhoto"("uploadedAt");

ALTER TABLE "FieldVisitPhoto"
  ADD CONSTRAINT "FieldVisitPhoto_fieldVisitId_fkey"
  FOREIGN KEY ("fieldVisitId") REFERENCES "FieldVisit"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
