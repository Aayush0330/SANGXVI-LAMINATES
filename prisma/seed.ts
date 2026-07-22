import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ProductStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { hashPassword, isStrongEnoughPassword } from "../src/lib/password";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the Prisma seed.");
}

if (!connectionString.startsWith("postgres://") &&
    !connectionString.startsWith("postgresql://")) {
  throw new Error(
    "DATABASE_URL must be a PostgreSQL connection string because the Prisma schema uses the postgresql provider."
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

const initialPassword =
  process.env.SEED_INITIAL_PASSWORD?.trim() ||
  process.env.DEMO_PASSWORD?.trim();

if (!initialPassword) {
  throw new Error(
    "SEED_INITIAL_PASSWORD is required. Use a unique strong password; no demo default is provided.",
  );
}

if (!isStrongEnoughPassword(initialPassword)) {
  throw new Error(
    "SEED_INITIAL_PASSWORD must contain 12+ characters with uppercase, lowercase, number and symbol.",
  );
}

const baseUsers = [
  {
    name: process.env.DEMO_OWNER_NAME || "Aayush Chandak",
    email: process.env.SEED_OWNER_EMAIL || "owner@sanghvi.com",
    role: UserRole.OWNER,
    phone: "+91 98765 43210",
  },
  {
    name: "Amit Sharma",
    email: "amit@sanghvi.com",
    role: UserRole.MANAGER,
    phone: "+91 98765 43211",
  },  {
    name: "Priya Dispatch",
    email: "priya@sanghvi.com",
    role: UserRole.DISPATCH_TEAM,
    phone: "+91 98765 43213",
  },
  {
    name: "Karan Order Team",
    email: "order@sanghvi.com",
    role: UserRole.ORDER_TEAM,
    phone: "+91 98765 43220",
  },
  {
    name: "Ramesh QC",
    email: "ramesh@sanghvi.com",
    role: UserRole.QC_TEAM,
    phone: "+91 98765 43214",
  },
  {
    name: "Mohan Driver",
    email: "mohan@sanghvi.com",
    role: UserRole.DRIVER_TRANSPORT,
    phone: "+91 98765 43215",
  },
  {
    name: "Neha Accountant",
    email: "neha@sanghvi.com",
    role: UserRole.ACCOUNTANT,
    phone: "+91 98765 43216",
  },
  {
    name: "Rohit Collection",
    email: "collection@sanghvi.com",
    role: UserRole.COLLECTION_TEAM,
    phone: "+91 98765 43217",
  },
  {
    name: "Raman Field",
    email: "field@sanghvi.com",
    role: UserRole.SALES_FIELD_TEAM,
    phone: "+91 98765 43218",
  },
  {
    name: "Sanghvi Dealer",
    email: "dealer@sanghvi.com",
    role: UserRole.DEALER,
    phone: "+91 98765 43219",
  },
];

const baseCategories = [
  "Decorative Laminates",
  "Premium Laminates",
  "Texture Laminates",
];

const baseBrands = [
  "Sanghvi Select",
  "Sanghvi Premium",
];

const baseProducts = [
  {
    code: "LAM-001",
    name: "Classic Walnut Laminate",
    categoryName: "Decorative Laminates",
    brandName: "Sanghvi Select",
    stack: "A1",
    unit: "Sheets",
    quantity: 120,
    minimumStock: 20,
    maximumStock: 180,
    status: ProductStatus.AVAILABLE,
  },
  {
    code: "LAM-002",
    name: "Premium Oak Laminate",
    categoryName: "Premium Laminates",
    brandName: "Sanghvi Premium",
    stack: "A2",
    unit: "Sheets",
    quantity: 75,
    minimumStock: 15,
    maximumStock: 120,
    status: ProductStatus.AVAILABLE,
  },
  {
    code: "LAM-003",
    name: "Matte White Laminate",
    categoryName: "Decorative Laminates",
    brandName: "Sanghvi Select",
    stack: "B1",
    unit: "Sheets",
    quantity: 40,
    minimumStock: 25,
    maximumStock: 100,
    status: ProductStatus.AVAILABLE,
  },
  {
    code: "LAM-004",
    name: "Black Stone Laminate",
    categoryName: "Texture Laminates",
    brandName: "Sanghvi Premium",
    stack: "B2",
    unit: "Sheets",
    quantity: 12,
    minimumStock: 20,
    maximumStock: 80,
    status: ProductStatus.LOW_STOCK,
  },
  {
    code: "LAM-005",
    name: "Grey Texture Laminate",
    categoryName: "Texture Laminates",
    brandName: "Sanghvi Select",
    stack: "C1",
    unit: "Sheets",
    quantity: 0,
    minimumStock: 10,
    maximumStock: 60,
    status: ProductStatus.OUT_OF_STOCK,
  },
];

async function main() {
  if (!initialPassword) {
    throw new Error("SEED_INITIAL_PASSWORD is required.");
  }
  const passwordHash = hashPassword(initialPassword);

  for (const user of baseUsers) {
    await prisma.user.upsert({
      where: { email: user.email.toLowerCase() },
      update: {
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: UserStatus.ACTIVE,
      },
      create: {
        name: user.name,
        email: user.email.toLowerCase(),
        phone: user.phone,
        role: user.role,
        status: UserStatus.ACTIVE,
        passwordHash,
        mustChangePassword: true,
      },
    });
  }

  for (const categoryName of baseCategories) {
    await prisma.productCategory.upsert({
      where: { name: categoryName },
      update: { isActive: true },
      create: { name: categoryName },
    });
  }

  for (const brandName of baseBrands) {
    await prisma.productBrand.upsert({
      where: { name: brandName },
      update: { isActive: true },
      create: { name: brandName },
    });
  }

  for (const product of baseProducts) {
    const [category, brand] = await Promise.all([
      prisma.productCategory.findUniqueOrThrow({ where: { name: product.categoryName } }),
      prisma.productBrand.findUniqueOrThrow({ where: { name: product.brandName } }),
    ]);

    await prisma.product.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        categoryId: category.id,
        brandId: brand.id,
        stack: product.stack,
        unit: product.unit,
        minimumStock: product.minimumStock,
        maximumStock: product.maximumStock,
        status: product.status,
      },
      create: {
        code: product.code,
        name: product.name,
        categoryId: category.id,
        brandId: brand.id,
        stack: product.stack,
        unit: product.unit,
        quantity: product.quantity,
        blocked: 0,
        minimumStock: product.minimumStock,
        maximumStock: product.maximumStock,
        status: product.status,
      },
    });
  }


  await prisma.$executeRawUnsafe(`
    INSERT INTO "TransportOption" ("id", "name", "description", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
      ('transport_auto', 'Auto', 'Local auto delivery.', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('transport_tempo', 'Tempo', 'Tempo / mini truck delivery.', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('transport_truck', 'Truck', 'Large truck dispatch.', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('transport_own_vehicle', 'Own Vehicle', 'Company owned vehicle.', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('transport_courier', 'Courier', 'Courier / third-party parcel service.', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('transport_other', 'Other', 'Custom transport option.', true, 99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("name") DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "WorkTeam" ("id", "name", "description", "isActive", "createdAt", "updatedAt") VALUES
      ('workteam_qc', 'QC Team', 'Quality checks before dispatch.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('workteam_collection', 'Collection Team', 'Payment and cheque collection follow-ups.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('workteam_sales', 'Sales Team', 'Dealer sales, inquiries, and follow-up tasks.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('workteam_field_visit', 'Field Visit Team', 'Shop visits, photos, and field updates.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('workteam_accounts', 'Accounts Team', 'Invoices, ledgers, and payment reconciliation.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('workteam_order', 'Order Team', 'Order review and order-flow coordination.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('workteam_design_office', 'Design / Office Team', 'Office operations and internal design/admin tasks.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "WorkTeam"
    SET
      "teamType" = 'DISPATCH',
      "parentTeamId" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'workteam_dispatch';
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "WorkTeamMember" (
      "id",
      "teamId",
      "userId",
      "role",
      "addedById",
      "createdAt",
      "updatedAt"
    )
    SELECT
      'seed_dispatch_lead_' || seed_user."id",
      physical_team."id",
      seed_user."id",
      'LEAD',
      NULL,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "User" AS seed_user
    CROSS JOIN LATERAL (
      SELECT team."id"
      FROM "WorkTeam" AS team
      WHERE team."teamType" = 'DISPATCH'
      ORDER BY team."isActive" DESC, team."createdAt" ASC, team."id" ASC
      LIMIT 1
    ) AS physical_team
    WHERE LOWER(seed_user."email") = 'priya@sanghvi.com'
      AND NOT EXISTS (
        SELECT 1
        FROM "WorkTeamMember" AS existing_lead
        WHERE existing_lead."teamId" = physical_team."id"
          AND existing_lead."role" = 'LEAD'
      )
    ON CONFLICT ("teamId", "userId") DO UPDATE
    SET
      "role" = 'LEAD',
      "updatedAt" = CURRENT_TIMESTAMP;
  `);

  console.log("Production seed data completed.");
  console.log("Seed completed. Password values are not printed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
