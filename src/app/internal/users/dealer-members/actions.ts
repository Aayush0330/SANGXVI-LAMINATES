"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import {
  formatIndianPhoneNumber,
  formatPersonName,
} from "@/lib/user-formatters";
import { createSecurityAuditLog } from "@/lib/security-audit";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function dealerMembersRedirect(
  message: string,
  type: "error" | "success" = "error",
): never {
  redirect(`/internal/users/dealer-members?${type}=${encodeURIComponent(message)}`);
}

function revalidateDealerMemberPaths() {
  revalidatePath("/internal/users/dealer-members");
  revalidatePath("/internal/users");
  revalidatePath("/internal/dashboard");
  revalidatePath("/internal/security");
}

function validateDealerMemberInput(formData: FormData) {
  const memberName = formatPersonName(cleanText(formData.get("memberName")));
  const dealerName = formatPersonName(cleanText(formData.get("dealerName")));
  const contactNumber = formatIndianPhoneNumber(cleanText(formData.get("contactNumber")));

  if (!memberName || !dealerName || !contactNumber) {
    dealerMembersRedirect("missing-fields");
  }

  return {
    memberName,
    dealerName,
    contactNumber,
  };
}

export async function createDealerMemberAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users/dealer-members",
  );

  if (!hasAccess) {
    dealerMembersRedirect("permission-denied");
  }

  const dealerMemberInput = validateDealerMemberInput(formData);

  const duplicateMember = await prisma.dealerMember.findFirst({
    where: {
      dealerName: {
        equals: dealerMemberInput.dealerName,
        mode: "insensitive",
      },
      contactNumber: dealerMemberInput.contactNumber,
    },
    select: {
      id: true,
    },
  });

  if (duplicateMember) {
    dealerMembersRedirect("duplicate-member");
  }

  const dealerMember = await prisma.dealerMember.create({
    data: {
      ...dealerMemberInput,
      createdById: currentUser.id,
      createdByName: currentUser.name,
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
    },
  });

  await createSecurityAuditLog({
    eventType: "DEALER_MEMBER_CREATED",
    user: currentUser,
    path: "/internal/users/dealer-members",
    description: `Added dealer member ${dealerMember.memberName} for ${dealerMember.dealerName}.`,
  });

  revalidateDealerMemberPaths();
  dealerMembersRedirect("dealer-member-created", "success");
}

export async function updateDealerMemberAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users/dealer-members",
  );

  if (!hasAccess) {
    dealerMembersRedirect("permission-denied");
  }

  const dealerMemberId = cleanText(formData.get("dealerMemberId"));
  const dealerMemberInput = validateDealerMemberInput(formData);

  if (!dealerMemberId) {
    dealerMembersRedirect("missing-member-id");
  }

  const existingDealerMember = await prisma.dealerMember.findUnique({
    where: {
      id: dealerMemberId,
    },
    select: {
      id: true,
      memberName: true,
      dealerName: true,
      contactNumber: true,
    },
  });

  if (!existingDealerMember) {
    dealerMembersRedirect("member-not-found");
  }

  const duplicateMember = await prisma.dealerMember.findFirst({
    where: {
      dealerName: {
        equals: dealerMemberInput.dealerName,
        mode: "insensitive",
      },
      contactNumber: dealerMemberInput.contactNumber,
      NOT: {
        id: dealerMemberId,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicateMember) {
    dealerMembersRedirect("duplicate-member");
  }

  const updatedDealerMember = await prisma.dealerMember.update({
    where: {
      id: dealerMemberId,
    },
    data: {
      ...dealerMemberInput,
      updatedById: currentUser.id,
      updatedByName: currentUser.name,
    },
  });

  await createSecurityAuditLog({
    eventType: "DEALER_MEMBER_UPDATED",
    user: currentUser,
    path: "/internal/users/dealer-members",
    description: `Updated dealer member ${updatedDealerMember.memberName} for ${updatedDealerMember.dealerName}.`,
  });

  revalidateDealerMemberPaths();
  dealerMembersRedirect("dealer-member-updated", "success");
}

export async function deleteDealerMemberAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users/dealer-members",
  );

  if (!hasAccess) {
    dealerMembersRedirect("permission-denied");
  }

  const dealerMemberId = cleanText(formData.get("dealerMemberId"));

  if (!dealerMemberId) {
    dealerMembersRedirect("missing-member-id");
  }

  const existingDealerMember = await prisma.dealerMember.findUnique({
    where: {
      id: dealerMemberId,
    },
    select: {
      id: true,
      memberName: true,
      dealerName: true,
    },
  });

  if (!existingDealerMember) {
    dealerMembersRedirect("member-not-found");
  }

  await prisma.dealerMember.delete({
    where: {
      id: dealerMemberId,
    },
  });

  await createSecurityAuditLog({
    eventType: "DEALER_MEMBER_DELETED",
    user: currentUser,
    path: "/internal/users/dealer-members",
    description: `Removed dealer member ${existingDealerMember.memberName} from ${existingDealerMember.dealerName}.`,
  });

  revalidateDealerMemberPaths();
  dealerMembersRedirect("dealer-member-deleted", "success");
}
