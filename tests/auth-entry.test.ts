import assert from "node:assert/strict";
import test from "node:test";
import { getAuthenticatedEntryPath } from "../src/lib/auth-entry";

test("authenticated cold launches return each primary role to its portal", () => {
  assert.equal(
    getAuthenticatedEntryPath({ role: "OWNER", mustChangePassword: false }),
    "/internal/dashboard",
  );
  assert.equal(
    getAuthenticatedEntryPath({
      role: "DRIVER_TRANSPORT",
      mustChangePassword: false,
    }),
    "/field/deliveries",
  );
  assert.equal(
    getAuthenticatedEntryPath({ role: "DEALER", mustChangePassword: false }),
    "/dealer/dashboard",
  );
});

test("cold launch preserves mandatory password-change enforcement", () => {
  assert.equal(
    getAuthenticatedEntryPath({ role: "OWNER", mustChangePassword: true }),
    "/account/change-password?reason=required",
  );
});
