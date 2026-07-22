-- Normalize rows created by the legacy dispatch workflow so the stored enum
-- values match the current Prisma WorkTeamType definition.
UPDATE public."WorkTeam"
SET
  "teamType" = 'PHYSICAL_DISPATCH'::public."WorkTeamType",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "teamType"::text = 'DISPATCH';
