-- Physical dispatch teams are independent ground-work units.
-- Remove any legacy parent/subteam relationship from operational teams while
-- retaining general teams for historical task records.
UPDATE public."WorkTeam"
SET
  "parentTeamId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "teamType" = 'DISPATCH'
  AND "parentTeamId" IS NOT NULL;
