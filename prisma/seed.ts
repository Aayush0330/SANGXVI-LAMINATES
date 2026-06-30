import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ProductStatus,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

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

const defaultPassword = process.env.DEMO_PASSWORD || "Sangxvi@123";

const demoUsers = [
  {
    name: process.env.DEMO_OWNER_NAME || "Aayush Chandak",
    email: process.env.DEMO_OWNER_EMAIL || "owner@sangxvi.com",
    role: UserRole.OWNER,
    phone: "+91 98765 43210",
  },
  {
    name: "Amit Sharma",
    email: "amit@sangxvi.com",
    role: UserRole.MANAGER,
    phone: "+91 98765 43211",
  },
  {
    name: "Rohit Inventory",
    email: "rohit@sangxvi.com",
    role: UserRole.INVENTORY_TEAM,
    phone: "+91 98765 43212",
  },
  {
    name: "Priya Dispatch",
    email: "priya@sangxvi.com",
    role: UserRole.DISPATCH_TEAM,
    phone: "+91 98765 43213",
  },
  {
    name: "Ramesh QC",
    email: "ramesh@sangxvi.com",
    role: UserRole.QC_TEAM,
    phone: "+91 98765 43214",
  },
  {
    name: "Mohan Driver",
    email: "mohan@sangxvi.com",
    role: UserRole.DRIVER_TRANSPORT,
    phone: "+91 98765 43215",
  },
  {
    name: "Sangxvi Dealer",
    email: "dealer@sangxvi.com",
    role: UserRole.DEALER,
    phone: "+91 98765 43216",
  },
];

const demoProducts = [
  {
    code: "LAM-001",
    name: "Classic Walnut Laminate",
    stack: "A1",
    quantity: 120,
    minimumStock: 20,
    status: ProductStatus.AVAILABLE,
  },
  {
    code: "LAM-002",
    name: "Premium Oak Laminate",
    stack: "A2",
    quantity: 75,
    minimumStock: 15,
    status: ProductStatus.AVAILABLE,
  },
  {
    code: "LAM-003",
    name: "Matte White Laminate",
    stack: "B1",
    quantity: 40,
    minimumStock: 25,
    status: ProductStatus.AVAILABLE,
  },
  {
    code: "LAM-004",
    name: "Black Stone Laminate",
    stack: "B2",
    quantity: 12,
    minimumStock: 20,
    status: ProductStatus.LOW_STOCK,
  },
  {
    code: "LAM-005",
    name: "Grey Texture Laminate",
    stack: "C1",
    quantity: 0,
    minimumStock: 10,
    status: ProductStatus.OUT_OF_STOCK,
  },
];

async function main() {
  const passwordHash = hashPassword(defaultPassword);

  for (const user of demoUsers) {
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
        mustChangePassword: false,
      },
    });
  }

  for (const product of demoProducts) {
    await prisma.product.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        stack: product.stack,
        quantity: product.quantity,
        minimumStock: product.minimumStock,
        status: product.status,
      },
      create: product,
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

  console.log("Demo seed completed.");
  console.log(`Default demo password: ${defaultPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
