"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import {
  generateDailyBusinessArchive,
  getDefaultArchiveDate,
} from "@/lib/daily-business-archive";
import { createSecurityAuditLog } from "@/lib/security-audit";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function generateDailyArchiveAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_backups",
    "/internal/backups",
  );

  if (!hasAccess) {
    redirect("/internal/backups?error=permission-denied");
  }

  const businessDate = clean(formData.get("businessDate")) || getDefaultArchiveDate();

  try {
    const result = await generateDailyBusinessArchive(businessDate);
    await createSecurityAuditLog({
      eventType: "DAILY_ARCHIVE_GENERATED",
      user: currentUser,
      path: "/internal/backups",
      description: `Generated daily business archive ${result.fileName}.`,
    });
    revalidatePath("/internal/backups");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/internal/backups?error=daily-failed&detail=${encodeURIComponent(message.slice(0, 240))}`);
  }

  redirect(`/internal/backups?success=daily-generated&date=${encodeURIComponent(businessDate)}`);
}
