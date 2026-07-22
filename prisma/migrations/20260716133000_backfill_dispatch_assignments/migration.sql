INSERT INTO public."WorkTeam" (
  "id",
  "name",
  "description",
  "parentTeamId",
  "isActive",
  "teamType",
  "createdAt",
  "updatedAt"
)
SELECT
  'work_team_dispatch_default',
  'Dispatch Team',
  'Default operational dispatch team created during workflow upgrade.',
  NULL,
  true,
  'DISPATCH',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM public."WorkTeam"
  WHERE "teamType" = 'DISPATCH'
);

INSERT INTO public."WorkTeamMember" (
  "id",
  "teamId",
  "userId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  'dispatch_member_' || app_user."id",
  dispatch_team."id",
  app_user."id",
  'MEMBER',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."User" app_user
CROSS JOIN LATERAL (
  SELECT team."id"
  FROM public."WorkTeam" team
  WHERE team."teamType" = 'DISPATCH'
    AND team."isActive" = true
  ORDER BY team."createdAt" ASC
  LIMIT 1
) dispatch_team
WHERE
  app_user."status" = 'ACTIVE'
  AND (
    app_user."role" = 'DISPATCH_TEAM'
    OR EXISTS (
      SELECT 1
      FROM public."UserRoleAssignment" role_assignment
      WHERE role_assignment."userId" = app_user."id"
        AND role_assignment."role" = 'DISPATCH_TEAM'
    )
  )
ON CONFLICT ("teamId", "userId") DO NOTHING;

INSERT INTO public."DispatchAssignment" (
  "id",
  "orderId",
  "teamId",
  "status",
  "priority",
  "instructions",
  "readyAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'dispatch_assignment_' || orders."id",
  orders."id",
  dispatch_team."id",
  CASE
    WHEN orders."status" IN ('PENDING_QC', 'READY_FOR_DISPATCH')
      THEN 'READY_FOR_QC'::public."DispatchAssignmentStatus"
    ELSE 'ASSIGNED'::public."DispatchAssignmentStatus"
  END,
  COALESCE(orders."priority", 'NORMAL'),
  COALESCE(
    orders."receivingNotes",
    'Legacy order migrated into the dispatch-team workflow.'
  ),
  CASE
    WHEN orders."status" IN ('PENDING_QC', 'READY_FOR_DISPATCH')
      THEN orders."updatedAt"
    ELSE NULL
  END,
  COALESCE(orders."receivedAt", orders."createdAt"),
  CURRENT_TIMESTAMP
FROM public."Order" orders
CROSS JOIN LATERAL (
  SELECT team."id"
  FROM public."WorkTeam" team
  WHERE team."teamType" = 'DISPATCH'
    AND team."isActive" = true
  ORDER BY team."createdAt" ASC
  LIMIT 1
) dispatch_team
WHERE orders."status" IN (
  'PENDING_STOCK_CHECK',
  'STOCK_CHECKED',
  'STOCK_BLOCKED',
  'PARTIALLY_BLOCKED',
  'BACKORDERED',
  'PENDING_QC',
  'READY_FOR_DISPATCH'
)
ON CONFLICT ("orderId", "teamId") DO NOTHING;

INSERT INTO public."DispatchAssignmentItem" (
  "id",
  "assignmentId",
  "orderItemId",
  "assignedQuantity",
  "verifiedQuantity",
  "issueQuantity",
  "createdAt",
  "updatedAt"
)
SELECT
  'dispatch_assignment_item_' || order_item."id",
  assignment."id",
  order_item."id",
  GREATEST(order_item."quantity", 1),
  CASE
    WHEN assignment."status" = 'READY_FOR_QC'
      THEN GREATEST(order_item."quantity", 1)
    ELSE 0
  END,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM public."OrderItem" order_item
INNER JOIN public."DispatchAssignment" assignment
  ON assignment."orderId" = order_item."orderId"
ON CONFLICT ("assignmentId", "orderItemId") DO NOTHING;
