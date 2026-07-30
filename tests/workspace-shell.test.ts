import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceShellPortal } from "../src/lib/workspace-shell";

test("field-only users retain the Field shell on shared internal routes", () => {
  assert.equal(
    getWorkspaceShellPortal(
      ["sales_field_team"],
      "sales_field_team",
      "internal",
    ),
    "field",
  );
  assert.equal(
    getWorkspaceShellPortal(
      ["sales_field_team"],
      "sales_field_team",
      "shared",
    ),
    "field",
  );
});

test("internal users retain the Internal shell on account routes", () => {
  assert.equal(
    getWorkspaceShellPortal(["manager"], "manager", "internal"),
    "internal",
  );
  assert.equal(
    getWorkspaceShellPortal(["manager"], "manager", "shared"),
    "internal",
  );
});

test("real multi-role users receive the shell that matches route context", () => {
  const roles = ["sales_field_team", "manager"] as const;

  assert.equal(
    getWorkspaceShellPortal(roles, "sales_field_team", "internal"),
    "internal",
  );
  assert.equal(
    getWorkspaceShellPortal(roles, "sales_field_team", "field"),
    "field",
  );
  assert.equal(
    getWorkspaceShellPortal(roles, "sales_field_team", "shared"),
    "field",
  );
});
