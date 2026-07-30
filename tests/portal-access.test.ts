import assert from "node:assert/strict";
import test from "node:test";
import {
  getPortalAccessItems,
  getPortalRole,
} from "../src/lib/portal-access";

test("dedicated field roles receive only their native Field Portal", () => {
  assert.deepEqual(
    getPortalAccessItems(["sales_field_team"]).map((item) => item.portal),
    ["field"],
  );
  assert.deepEqual(
    getPortalAccessItems(["collection_team"]).map((item) => item.portal),
    ["field"],
  );
  assert.equal(getPortalRole(["sales_field_team"], "internal"), null);
  assert.equal(getPortalRole(["collection_team"], "internal"), null);
});

test("genuine multi-role users retain portal switching", () => {
  const access = getPortalAccessItems(["sales_field_team", "manager"]);

  assert.deepEqual(
    access.map((item) => item.portal),
    ["internal", "field"],
  );
  assert.equal(getPortalRole(["sales_field_team", "manager"], "internal"), "manager");
  assert.equal(
    getPortalRole(["sales_field_team", "manager"], "field"),
    "sales_field_team",
  );
});
