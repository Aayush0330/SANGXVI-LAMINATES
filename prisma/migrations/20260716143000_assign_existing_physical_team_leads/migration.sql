-- Every physical team with existing workers needs one operational lead.
-- Promote the earliest-added worker only when the team does not already have
-- a lead. Empty teams remain unchanged and can be completed from the UI.
WITH "PhysicalTeamLeadCandidates" AS (
  SELECT
    member."id",
    ROW_NUMBER() OVER (
      PARTITION BY member."teamId"
      ORDER BY member."createdAt" ASC, member."id" ASC
    ) AS "position"
  FROM public."WorkTeamMember" AS member
  INNER JOIN public."WorkTeam" AS team
    ON team."id" = member."teamId"
  WHERE team."teamType" = 'DISPATCH'
    AND NOT EXISTS (
      SELECT 1
      FROM public."WorkTeamMember" AS existing_lead
      WHERE existing_lead."teamId" = member."teamId"
        AND existing_lead."role" = 'LEAD'
    )
)
UPDATE public."WorkTeamMember" AS member
SET "role" = 'LEAD'
FROM "PhysicalTeamLeadCandidates" AS candidate
WHERE member."id" = candidate."id"
  AND candidate."position" = 1;
