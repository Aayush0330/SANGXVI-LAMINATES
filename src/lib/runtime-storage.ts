import os from "node:os";
import path from "node:path";

function runtimeDirectory(
  environmentVariable: "BACKUP_DIR" | "DAILY_ARCHIVE_DIR",
  developmentSubdirectory: string,
) {
  const configured = process.env[environmentVariable]?.trim();

  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error(`${environmentVariable} must be an absolute path.`);
    }
    const resolved = path.resolve(
      /* turbopackIgnore: true */ configured,
    );
    if (resolved === path.parse(resolved).root) {
      throw new Error(`${environmentVariable} cannot be a filesystem root.`);
    }
    if (
      process.env.NODE_ENV === "production" &&
      isTemporaryStorage(resolved)
    ) {
      throw new Error(
        `${environmentVariable} cannot use temporary storage in production; configure a durable private mount.`,
      );
    }
    return resolved;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${environmentVariable} is required in production and must point to durable, private storage.`,
    );
  }

  return path.join(os.tmpdir(), "sanghvi-erp", developmentSubdirectory);
}

export function getBackupDirectory() {
  return runtimeDirectory("BACKUP_DIR", "database-backups");
}

export function getDailyArchiveDirectory() {
  return runtimeDirectory("DAILY_ARCHIVE_DIR", "daily-archives");
}

export function isPathInside(root: string, candidate: string) {
  const relative = path.relative(
    path.resolve(/* turbopackIgnore: true */ root),
    path.resolve(/* turbopackIgnore: true */ candidate),
  );
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isTemporaryStorage(candidate: string) {
  const temporaryRoots = [
    os.tmpdir(),
    "/tmp",
    "/private/tmp",
  ].map((temporaryRoot) => path.resolve(/* turbopackIgnore: true */ temporaryRoot));

  return temporaryRoots.some((temporaryRoot) => isPathInside(temporaryRoot, candidate));
}

export function resolveStoredFile(root: string, storedPath: string) {
  const resolved = path.isAbsolute(storedPath)
    ? path.resolve(/* turbopackIgnore: true */ storedPath)
    : path.resolve(
        /* turbopackIgnore: true */ root,
        /* turbopackIgnore: true */ storedPath,
      );

  if (!isPathInside(root, resolved)) {
    throw new Error("Stored file path is outside the configured private storage directory.");
  }

  return resolved;
}
