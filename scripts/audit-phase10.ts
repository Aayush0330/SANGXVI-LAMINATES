import "dotenv/config";
import { prisma } from "../src/lib/db";
import { verifyPassword } from "../src/lib/password";

function safeUrl(name: string) {
  const raw = process.env[name];
  if (!raw) return { configured: false };
  try {
    const url = new URL(raw);
    return {
      configured: true,
      protocol: url.protocol,
      host: url.hostname,
      local: ["localhost", "127.0.0.1", "::1"].includes(url.hostname),
    };
  } catch {
    return { configured: true, valid: false };
  }
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      passwordHash: true,
      mustChangePassword: true,
      status: true,
      role: true,
    },
  });
  const knownPasswords = [
    "Sanghvi@123",
    "Sangxvi@123",
    "Password123",
    "StrongPass123",
  ];
  const knownPasswordAccounts = users.filter((user) =>
    knownPasswords.some((password) => verifyPassword(password, user.passwordHash)),
  ).length;

  const [duplicateEmails, duplicateCodes, stockProblems, orphanRows, pendingTestUsers, expiredSessions] =
    await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM (
          SELECT LOWER("email") FROM public."User"
          GROUP BY LOWER("email") HAVING COUNT(*) > 1
        ) duplicates
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM (
          SELECT LOWER("code") FROM public."Product"
          GROUP BY LOWER("code") HAVING COUNT(*) > 1
        ) duplicates
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM public."Product"
        WHERE "quantity" < 0 OR "blocked" < 0 OR "blocked" > "quantity"
      `,
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT SUM("count")::bigint AS "count" FROM (
          SELECT COUNT(*)::bigint AS "count" FROM public."Order" child LEFT JOIN public."User" parent ON parent."id"=child."dealerId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."OrderItem" child LEFT JOIN public."Order" parent ON parent."id"=child."orderId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."OrderItem" child LEFT JOIN public."Product" parent ON parent."id"=child."productId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."DeliveryProof" child LEFT JOIN public."Order" parent ON parent."id"=child."orderId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."PurchaseRequest" child LEFT JOIN public."Supplier" parent ON parent."id"=child."supplierId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."PurchaseRequestItem" child LEFT JOIN public."PurchaseRequest" parent ON parent."id"=child."purchaseRequestId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."PurchaseReceipt" child LEFT JOIN public."PurchaseRequest" parent ON parent."id"=child."purchaseRequestId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."PurchaseReceiptItem" child LEFT JOIN public."PurchaseReceipt" parent ON parent."id"=child."purchaseReceiptId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."PayrollRunItem" child LEFT JOIN public."PayrollRun" parent ON parent."id"=child."payrollRunId" WHERE parent."id" IS NULL
          UNION ALL SELECT COUNT(*)::bigint FROM public."NotificationRecipient" child LEFT JOIN public."Notification" parent ON parent."id"=child."notificationId" WHERE parent."id" IS NULL
        ) checks
      `,
      prisma.user.count({
        where: {
          OR: [
            { email: { endsWith: "@example.test" } },
            { email: { contains: "e2e" } },
            { email: { contains: "test" } },
          ],
        },
      }),
      prisma.authSession.count({ where: { expiresAt: { lte: new Date() } } }),
    ]);

  const demoEmails = new Set([
    "owner@sanghvi.com",
    "amit@sanghvi.com",
    "priya@sanghvi.com",
    "order@sanghvi.com",
    "ramesh@sanghvi.com",
    "mohan@sanghvi.com",
    "neha@sanghvi.com",
    "collection@sanghvi.com",
    "field@sanghvi.com",
    "dealer@sanghvi.com",
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    branding: "Sanghvi ERP",
    database: safeUrl("DATABASE_URL"),
    backupDatabase: safeUrl("BACKUP_DATABASE_URL"),
    appUrl: safeUrl("APP_URL"),
    publicAppUrl: safeUrl("NEXT_PUBLIC_APP_URL"),
    cronSecret: {
      configured: Boolean(process.env.CRON_SECRET),
      strongLength: (process.env.CRON_SECRET?.length ?? 0) >= 32,
      placeholder: /change|secret/i.test(process.env.CRON_SECRET ?? ""),
    },
    counts: {
      users: users.length,
      activeUsers: users.filter((user) => user.status === "ACTIVE").length,
      activeOwners: users.filter(
        (user) => user.status === "ACTIVE" && user.role === "OWNER",
      ).length,
      demoNamedAccounts: users.filter((user) => demoEmails.has(user.email.toLowerCase())).length,
      knownPasswordAccounts,
      mustChangePasswordAccounts: users.filter((user) => user.mustChangePassword).length,
      temporaryTestUsers: pendingTestUsers,
      expiredSessions,
      duplicateCaseInsensitiveEmails: Number(duplicateEmails[0]?.count ?? 0),
      duplicateCaseInsensitiveProductCodes: Number(duplicateCodes[0]?.count ?? 0),
      invalidStockRows: Number(stockProblems[0]?.count ?? 0),
      orphanRows: Number(orphanRows[0]?.count ?? 0),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
