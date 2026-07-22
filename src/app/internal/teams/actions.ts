"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { getPrismaRolesFromUser } from "@/lib/user-role-utils";
import {
  UserRole,
  WorkTeamMemberRole,
  WorkTeamType,
} from "@/generated/prisma/client";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function validTeamText(name: string, description: string) {
  return name.length > 0 && name.length <= 120 && description.length <= 1000;
}

function teamPageUrl(
  type: "error" | "success",
  message: string,
  teamId?: string | null,
) {
  const anchor = teamId ? `#team-${encodeURIComponent(teamId)}` : "#create-team";
  return `/internal/teams?${type}=${encodeURIComponent(message)}${anchor}`;
}

async function getEligiblePhysicalWorker(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
    },
    include: {
      roleAssignments: true,
    },
  });

  if (!user) {
    return null;
  }

  const roles = getPrismaRolesFromUser(user);
  return roles.includes(UserRole.DISPATCH_TEAM) ? user : null;
}

async function getExistingPhysicalMembership(
  userId: string,
  excludeTeamId?: string,
) {
  return prisma.workTeamMember.findFirst({
    where: {
      userId,
      ...(excludeTeamId ? { teamId: { not: excludeTeamId } } : {}),
      team: { teamType: WorkTeamType.PHYSICAL_DISPATCH },
    },
    select: {
      id: true,
      teamId: true,
      team: { select: { name: true } },
    },
  });
}

export async function createPhysicalTeamAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_teams",
    "/internal/teams",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const name = cleanText(formData.get("name"));
  const description = cleanText(formData.get("description"));
  const leadUserId = cleanText(formData.get("leadUserId"));
  const initialMemberId = cleanText(formData.get("initialMemberId"));

  if (leadUserId && initialMemberId && leadUserId === initialMemberId) {
    redirect(teamPageUrl("error", "duplicate-lead-worker"));
  }

  if (!validTeamText(name, description)) {
    redirect(teamPageUrl("error", "team-name-required"));
  }

  const requestedUserIds = [...new Set([leadUserId, initialMemberId].filter(Boolean))];
  const eligibleUsers = requestedUserIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: requestedUserIds },
          status: "ACTIVE",
          OR: [
            { role: UserRole.DISPATCH_TEAM },
            {
              roleAssignments: {
                some: { role: UserRole.DISPATCH_TEAM },
              },
            },
          ],
        },
        select: { id: true },
      })
    : [];

  if (eligibleUsers.length !== requestedUserIds.length) {
    redirect(teamPageUrl("error", "physical-member-role-required"));
  }

  const eligibleIds = new Set(eligibleUsers.map((user) => user.id));

  if (requestedUserIds.length) {
    const existingMembership = await prisma.workTeamMember.findFirst({
      where: {
        userId: { in: requestedUserIds },
        team: { teamType: WorkTeamType.PHYSICAL_DISPATCH },
      },
      select: { id: true },
    });

    if (existingMembership) {
      redirect(teamPageUrl("error", "worker-already-assigned"));
    }
  }

  const team = await prisma.$transaction(async (tx) => {
    const createdTeam = await tx.workTeam.create({
      data: {
        name,
        description: description || null,
        parentTeamId: null,
        teamType: WorkTeamType.PHYSICAL_DISPATCH,
        createdById: currentUser.id,
        updatedById: currentUser.id,
      },
    });

    if (leadUserId && eligibleIds.has(leadUserId)) {
      await tx.workTeamMember.create({
        data: {
          teamId: createdTeam.id,
          userId: leadUserId,
          role: WorkTeamMemberRole.LEAD,
          addedById: currentUser.id,
        },
      });
    }

    if (
      initialMemberId &&
      initialMemberId !== leadUserId &&
      eligibleIds.has(initialMemberId)
    ) {
      await tx.workTeamMember.create({
        data: {
          teamId: createdTeam.id,
          userId: initialMemberId,
          role: WorkTeamMemberRole.MEMBER,
          addedById: currentUser.id,
        },
      });
    }

    return createdTeam;
  });

  await createSecurityAuditLog({
    eventType: "WORK_TEAM_CREATED",
    user: currentUser,
    path: "/internal/teams",
    description: `Created physical team ${name}.`,
  });

  revalidatePath("/internal/teams");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/dispatch");
  redirect(teamPageUrl("success", "team-created", team.id));
}

export async function updatePhysicalTeamAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_teams",
    "/internal/teams",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const teamId = cleanText(formData.get("teamId"));
  const name = cleanText(formData.get("name"));
  const description = cleanText(formData.get("description"));

  if (!teamId || !validTeamText(name, description)) {
    redirect(teamPageUrl("error", "team-update-invalid", teamId));
  }

  const team = await prisma.workTeam.findFirst({
    where: {
      id: teamId,
      teamType: WorkTeamType.PHYSICAL_DISPATCH,
    },
    select: { id: true },
  });

  if (!team) {
    redirect(teamPageUrl("error", "team-missing"));
  }

  await prisma.workTeam.update({
    where: { id: teamId },
    data: {
      name,
      description: description || null,
      parentTeamId: null,
      teamType: WorkTeamType.PHYSICAL_DISPATCH,
      updatedById: currentUser.id,
    },
  });

  await createSecurityAuditLog({
    eventType: "WORK_TEAM_UPDATED",
    user: currentUser,
    path: "/internal/teams",
    description: `Updated physical team ${name}.`,
  });

  revalidatePath("/internal/teams");
  revalidatePath("/internal/order-receiving");
  redirect(teamPageUrl("success", "team-saved", teamId));
}

export async function togglePhysicalTeamStatusAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_teams",
    "/internal/teams",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const teamId = cleanText(formData.get("teamId"));
  const isActive = cleanText(formData.get("isActive")) === "true";

  if (!teamId) {
    redirect(teamPageUrl("error", "team-missing"));
  }

  const team = await prisma.workTeam.findFirst({
    where: {
      id: teamId,
      teamType: WorkTeamType.PHYSICAL_DISPATCH,
    },
    select: { id: true, name: true },
  });

  if (!team) {
    redirect(teamPageUrl("error", "team-missing"));
  }

  await prisma.workTeam.update({
    where: { id: teamId },
    data: {
      isActive,
      updatedById: currentUser.id,
    },
  });

  await createSecurityAuditLog({
    eventType: "WORK_TEAM_UPDATED",
    user: currentUser,
    path: "/internal/teams",
    description: `${isActive ? "Activated" : "Deactivated"} physical team ${team.name}.`,
  });

  revalidatePath("/internal/teams");
  revalidatePath("/internal/order-receiving");
  redirect(teamPageUrl("success", isActive ? "team-enabled" : "team-disabled", teamId));
}

export async function addPhysicalTeamMemberAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_teams",
    "/internal/teams",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const teamId = cleanText(formData.get("teamId"));
  const userId = cleanText(formData.get("userId"));
  const role =
    cleanText(formData.get("role")) === WorkTeamMemberRole.LEAD
      ? WorkTeamMemberRole.LEAD
      : WorkTeamMemberRole.MEMBER;

  if (!teamId || !userId) {
    redirect(teamPageUrl("error", "member-invalid", teamId));
  }

  const [team, user] = await Promise.all([
    prisma.workTeam.findFirst({
      where: {
        id: teamId,
        teamType: WorkTeamType.PHYSICAL_DISPATCH,
      },
      select: { id: true },
    }),
    getEligiblePhysicalWorker(userId),
  ]);

  if (!team || !user) {
    redirect(teamPageUrl("error", "physical-member-role-required", teamId));
  }

  const existingMembership = await getExistingPhysicalMembership(userId, teamId);
  if (existingMembership) {
    redirect(teamPageUrl("error", "worker-already-assigned", teamId));
  }

  await prisma.$transaction(async (tx) => {
    if (role === WorkTeamMemberRole.LEAD) {
      await tx.workTeamMember.updateMany({
        where: {
          teamId,
          role: WorkTeamMemberRole.LEAD,
          userId: { not: userId },
        },
        data: { role: WorkTeamMemberRole.MEMBER },
      });
    }

    await tx.workTeamMember.upsert({
      where: {
        teamId_userId: { teamId, userId },
      },
      update: {
        role,
        addedById: currentUser.id,
      },
      create: {
        teamId,
        userId,
        role,
        addedById: currentUser.id,
      },
    });
  });

  await createSecurityAuditLog({
    eventType: "WORK_TEAM_MEMBER_UPDATED",
    user: currentUser,
    path: "/internal/teams",
    description: `Assigned a physical team ${role === WorkTeamMemberRole.LEAD ? "lead" : "worker"}.`,
  });

  revalidatePath("/internal/teams");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/dispatch");
  redirect(teamPageUrl("success", "member-added", teamId));
}

export async function removePhysicalTeamMemberAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_work_teams",
    "/internal/teams",
  );

  if (!hasAccess) {
    redirect("/internal/dashboard");
  }

  const memberId = cleanText(formData.get("memberId"));
  const teamId = cleanText(formData.get("teamId"));

  if (!memberId) {
    redirect(teamPageUrl("error", "member-missing", teamId));
  }

  const member = await prisma.workTeamMember.findFirst({
    where: {
      id: memberId,
      team: { teamType: WorkTeamType.PHYSICAL_DISPATCH },
    },
    select: { id: true },
  });

  if (!member) {
    redirect(teamPageUrl("error", "member-missing", teamId));
  }

  await prisma.workTeamMember.delete({
    where: { id: memberId },
  });

  await createSecurityAuditLog({
    eventType: "WORK_TEAM_MEMBER_UPDATED",
    user: currentUser,
    path: "/internal/teams",
    description: "Removed a worker from a physical team.",
  });

  revalidatePath("/internal/teams");
  revalidatePath("/internal/order-receiving");
  revalidatePath("/internal/dispatch");
  redirect(teamPageUrl("success", "member-removed", teamId));
}
