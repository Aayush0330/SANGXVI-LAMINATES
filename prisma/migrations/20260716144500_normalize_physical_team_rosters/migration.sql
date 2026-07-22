-- A dispatch-qualified worker belongs to one physical team. Preserve a lead
-- assignment first, then the oldest membership when legacy data contains
-- duplicates across physical teams.
WITH "RankedPhysicalMemberships" AS (
  SELECT
    member."id",
    ROW_NUMBER() OVER (
      PARTITION BY member."userId"
      ORDER BY
        (member."role" = 'LEAD') DESC,
        team."isActive" DESC,
        member."createdAt" ASC,
        member."id" ASC
    ) AS "position"
  FROM public."WorkTeamMember" AS member
  INNER JOIN public."WorkTeam" AS team
    ON team."id" = member."teamId"
  WHERE team."teamType" = 'DISPATCH'
)
DELETE FROM public."WorkTeamMember" AS member
USING "RankedPhysicalMemberships" AS ranked
WHERE member."id" = ranked."id"
  AND ranked."position" > 1;

-- Keep exactly one lead when legacy data contains multiple leads in the same
-- physical team.
WITH "RankedPhysicalLeads" AS (
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
    AND member."role" = 'LEAD'
)
UPDATE public."WorkTeamMember" AS member
SET "role" = 'MEMBER'
FROM "RankedPhysicalLeads" AS ranked
WHERE member."id" = ranked."id"
  AND ranked."position" > 1;

-- Promote the earliest remaining worker when roster normalization leaves a
-- populated physical team without a lead.
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
