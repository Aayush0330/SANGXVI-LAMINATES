"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  EmployeeLifecycleType,
  GeofenceMode,
  UserRole,
  UserStatus,
} from "@/generated/prisma/client";
import { checkPermission } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { getIndiaWorkDate } from "@/lib/office-attendance";
import { hashPassword, isStrongEnoughPassword } from "@/lib/password";
import { createSecurityAuditLog } from "@/lib/security-audit";
import { deleteUserSessions } from "@/lib/session";
import {
  formatIndianPhoneNumber,
  formatPersonName,
  normalizeEmail,
} from "@/lib/user-formatters";

const validRoles = new Set(Object.values(UserRole));
const validStatuses = new Set(Object.values(UserStatus));
const validGeo = new Set(Object.values(GeofenceMode));

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const role = (value: string) =>
  validRoles.has(value as UserRole) ? (value as UserRole) : null;
const status = (value: string) =>
  validStatuses.has(value as UserStatus) ? (value as UserStatus) : null;
const geo = (value: string) =>
  validGeo.has(value as GeofenceMode)
    ? (value as GeofenceMode)
    : GeofenceMode.OFFICE_REQUIRED;

function selection(formData: FormData) {
  const primary = role(clean(formData.get("primaryRole") ?? formData.get("role")));
  if (!primary) return null;

  const roles = formData
    .getAll("roles")
    .map((value) => role(clean(value)))
    .filter((value): value is UserRole => Boolean(value));

  return { primary, roles: [...new Set([primary, ...roles])] };
}

function go(message: string, type: "error" | "success" = "error"): never {
  redirect(`/internal/users?${type}=${encodeURIComponent(message)}`);
}

function refresh() {
  [
    "/internal/users",
    "/internal/hr",
    "/internal/hr/reports",
    "/internal/dashboard",
    "/dealer/dashboard",
    "/field/dashboard",
    "/login",
  ].forEach((path) => revalidatePath(path));
}

async function ownerCount() {
  return prisma.user.count({
    where: {
      status: UserStatus.ACTIVE,
      OR: [
        { role: UserRole.OWNER },
        { roleAssignments: { some: { role: UserRole.OWNER } } },
      ],
    },
  });
}

function isCompanyEmployee(roles: UserRole[]) {
  return roles.some((assignedRole) => assignedRole !== UserRole.DEALER);
}

function lifecycleForStatus(statusValue: UserStatus) {
  if (statusValue === UserStatus.FORMER_EMPLOYEE) {
    return {
      eventType: EmployeeLifecycleType.EXITED,
      title: "Employee archived",
    };
  }
  if (statusValue === UserStatus.ACTIVE) {
    return {
      eventType: EmployeeLifecycleType.REACTIVATED,
      title: "Employee activated",
    };
  }
  return {
    eventType: EmployeeLifecycleType.STATUS_CHANGED,
    title: "Employee status changed",
  };
}

export async function createUserAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users",
  );
  if (!hasAccess) go("permission-denied");

  const name = formatPersonName(clean(formData.get("name")));
  const email = normalizeEmail(clean(formData.get("email")));
  const phone = formatIndianPhoneNumber(clean(formData.get("phone")));
  const password = clean(formData.get("password"));
  const selected = selection(formData);
  const selectedStatus = status(clean(formData.get("status")) || "ACTIVE");
  const geofenceMode = geo(clean(formData.get("geofenceMode")));

  if (!name || !email || !password || !selected || !selectedStatus) {
    go("missing-fields");
  }
  if (!isStrongEnoughPassword(password)) go("weak-password");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    go("duplicate-email");
  }

  const workDate = getIndiaWorkDate();
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        role: selected.primary,
        status: selectedStatus,
        geofenceMode,
        archivedAt:
          selectedStatus === UserStatus.FORMER_EMPLOYEE ? new Date() : null,
        archivedById:
          selectedStatus === UserStatus.FORMER_EMPLOYEE ? currentUser.id : null,
        archivedByName:
          selectedStatus === UserStatus.FORMER_EMPLOYEE ? currentUser.name : null,
        exitReason:
          selectedStatus === UserStatus.FORMER_EMPLOYEE
            ? "Created as former employee"
            : null,
      },
    });

    await tx.userRoleAssignment.createMany({
      data: selected.roles.map((assignedRole) => ({
        userId: createdUser.id,
        role: assignedRole,
        isPrimary: assignedRole === selected.primary,
        assignedById: currentUser.id,
        assignedByName: currentUser.name,
      })),
    });

    if (isCompanyEmployee(selected.roles)) {
      await tx.employeeProfile.create({
        data: {
          userId: createdUser.id,
          joiningDate: workDate,
          lastWorkingDate:
            selectedStatus === UserStatus.FORMER_EMPLOYEE ? workDate : null,
          createdById: currentUser.id,
          createdByName: currentUser.name,
          updatedById: currentUser.id,
          updatedByName: currentUser.name,
        },
      });
      await tx.employeeLifecycleEvent.create({
        data: {
          userId: createdUser.id,
          eventType:
            selectedStatus === UserStatus.FORMER_EMPLOYEE
              ? EmployeeLifecycleType.EXITED
              : EmployeeLifecycleType.JOINED,
          effectiveDate: workDate,
          title:
            selectedStatus === UserStatus.FORMER_EMPLOYEE
              ? "Former employee record created"
              : "Employee joined",
          newValue: selectedStatus,
          createdById: currentUser.id,
          createdByName: currentUser.name,
        },
      });
    }

    return createdUser;
  });

  await createSecurityAuditLog({
    eventType: "USER_CREATED",
    user: currentUser,
    path: "/internal/users",
    description: `Created ${user.email}. Roles: ${selected.roles.join(", ")}.`,
  });
  refresh();
  go("user-created", "success");
}

export async function updateUserAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users",
  );
  if (!hasAccess) go("permission-denied");

  const id = clean(formData.get("userId"));
  const name = formatPersonName(clean(formData.get("name")));
  const email = normalizeEmail(clean(formData.get("email")));
  const phone = formatIndianPhoneNumber(clean(formData.get("phone")));
  const selected = selection(formData);
  const selectedStatus = status(clean(formData.get("status")));
  const geofenceMode = geo(clean(formData.get("geofenceMode")));
  const mustChangePassword = clean(formData.get("mustChangePassword")) === "true";

  if (!id || !name || !email || !selected || !selectedStatus) {
    go("update-missing-fields");
  }

  const old = await prisma.user.findUnique({
    where: { id },
    include: { roleAssignments: true },
  });
  if (!old) go("user-not-found");
  if (await prisma.user.findFirst({ where: { email, NOT: { id } }, select: { id: true } })) {
    go("duplicate-email");
  }

  const oldRoles = [...new Set([old.role, ...old.roleAssignments.map((item) => item.role)])];
  if (
    id === currentUser.id &&
    (old.status !== selectedStatus ||
      old.role !== selected.primary ||
      [...oldRoles].sort().join() !== [...selected.roles].sort().join())
  ) {
    go("cannot-change-own-access");
  }
  if (
    oldRoles.includes(UserRole.OWNER) &&
    old.status === UserStatus.ACTIVE &&
    (!selected.roles.includes(UserRole.OWNER) || selectedStatus !== UserStatus.ACTIVE) &&
    (await ownerCount()) <= 1
  ) {
    go("last-owner-required");
  }

  const statusChanged = old.status !== selectedStatus;
  const rolesNowIncludeEmployee = isCompanyEmployee(selected.roles);
  const workDate = getIndiaWorkDate();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        role: selected.primary,
        status: selectedStatus,
        geofenceMode,
        mustChangePassword,
        archivedAt:
          selectedStatus === UserStatus.FORMER_EMPLOYEE
            ? old.archivedAt ?? new Date()
            : null,
        archivedById:
          selectedStatus === UserStatus.FORMER_EMPLOYEE ? currentUser.id : null,
        archivedByName:
          selectedStatus === UserStatus.FORMER_EMPLOYEE ? currentUser.name : null,
        exitReason:
          selectedStatus === UserStatus.FORMER_EMPLOYEE
            ? old.exitReason ?? "Employment ended"
            : null,
      },
    });
    await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
    await tx.userRoleAssignment.createMany({
      data: selected.roles.map((assignedRole) => ({
        userId: id,
        role: assignedRole,
        isPrimary: assignedRole === selected.primary,
        assignedById: currentUser.id,
        assignedByName: currentUser.name,
      })),
    });

    if (rolesNowIncludeEmployee) {
      await tx.employeeProfile.upsert({
        where: { userId: id },
        create: {
          userId: id,
          joiningDate: workDate,
          lastWorkingDate:
            selectedStatus === UserStatus.FORMER_EMPLOYEE ? workDate : null,
          createdById: currentUser.id,
          createdByName: currentUser.name,
          updatedById: currentUser.id,
          updatedByName: currentUser.name,
        },
        update: {
          lastWorkingDate:
            selectedStatus === UserStatus.FORMER_EMPLOYEE ? workDate : null,
          updatedById: currentUser.id,
          updatedByName: currentUser.name,
        },
      });
    }

    if (rolesNowIncludeEmployee && statusChanged) {
      const lifecycle = lifecycleForStatus(selectedStatus);
      await tx.employeeLifecycleEvent.create({
        data: {
          userId: id,
          eventType: lifecycle.eventType,
          effectiveDate: workDate,
          title: lifecycle.title,
          previousValue: old.status,
          newValue: selectedStatus,
          createdById: currentUser.id,
          createdByName: currentUser.name,
        },
      });
    }
  });

  await deleteUserSessions(id);
  await createSecurityAuditLog({
    eventType: statusChanged ? "USER_STATUS_CHANGED" : "USER_UPDATED",
    user: currentUser,
    path: "/internal/users",
    description: `Updated ${email}. Roles: ${selected.roles.join(", ")}. Status: ${selectedStatus}.`,
  });
  refresh();
  go(selectedStatus === UserStatus.ACTIVE ? "user-updated" : "user-disabled", "success");
}

export async function resetUserPasswordAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users",
  );
  if (!hasAccess) go("permission-denied");

  const id = clean(formData.get("userId"));
  const password = clean(formData.get("password"));
  const mustChangePassword = clean(formData.get("mustChangePassword")) === "true";
  if (!id || !password) go("missing-password-reset-fields");
  if (!isStrongEnoughPassword(password)) go("weak-password");

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, status: true },
  });
  if (!user) go("user-not-found");
  if (user.status === UserStatus.FORMER_EMPLOYEE) go("former-user-password-blocked");

  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashPassword(password), mustChangePassword },
  });
  await deleteUserSessions(id);
  await createSecurityAuditLog({
    eventType: "PASSWORD_RESET",
    user: currentUser,
    path: "/internal/users",
    description: `Password reset for ${user.email}.`,
  });
  refresh();
  go("password-reset", "success");
}

export async function deleteUserAction(formData: FormData) {
  const { currentUser, hasAccess } = await checkPermission(
    "manage_users",
    "/internal/users",
  );
  if (!hasAccess) go("permission-denied");

  const id = clean(formData.get("userId"));
  const exitReason = clean(formData.get("exitReason"));
  if (!id) go("user-not-found");
  if (id === currentUser.id) go("cannot-delete-own-account");

  const user = await prisma.user.findUnique({
    where: { id },
    include: { roleAssignments: true },
  });
  if (!user) go("user-not-found");

  const roles = [...new Set([user.role, ...user.roleAssignments.map((item) => item.role)])];
  if (
    roles.includes(UserRole.OWNER) &&
    user.status === UserStatus.ACTIVE &&
    (await ownerCount()) <= 1
  ) {
    go("last-owner-required");
  }

  const reason = exitReason || "Employment ended";
  const workDate = getIndiaWorkDate();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        status: UserStatus.FORMER_EMPLOYEE,
        archivedAt: new Date(),
        archivedById: currentUser.id,
        archivedByName: currentUser.name,
        exitReason: reason,
        mustChangePassword: false,
      },
    });

    if (isCompanyEmployee(roles)) {
      await tx.employeeProfile.upsert({
        where: { userId: id },
        create: {
          userId: id,
          joiningDate: workDate,
          lastWorkingDate: workDate,
          createdById: currentUser.id,
          createdByName: currentUser.name,
          updatedById: currentUser.id,
          updatedByName: currentUser.name,
        },
        update: {
          lastWorkingDate: workDate,
          updatedById: currentUser.id,
          updatedByName: currentUser.name,
        },
      });
      await tx.employeeLifecycleEvent.create({
        data: {
          userId: id,
          eventType: EmployeeLifecycleType.EXITED,
          effectiveDate: workDate,
          title: "Employee archived",
          details: reason,
          previousValue: user.status,
          newValue: UserStatus.FORMER_EMPLOYEE,
          createdById: currentUser.id,
          createdByName: currentUser.name,
        },
      });
    }
  });

  await deleteUserSessions(id);
  await createSecurityAuditLog({
    eventType: "USER_STATUS_CHANGED",
    user: currentUser,
    path: "/internal/users",
    description: `Archived ${user.email}; historical business data preserved. Reason: ${reason}.`,
  });
  refresh();
  go("user-archived", "success");
}
