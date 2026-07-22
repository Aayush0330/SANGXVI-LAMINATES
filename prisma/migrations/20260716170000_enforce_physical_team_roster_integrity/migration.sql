-- Physical teams are independent lead-based groups:
-- one physical team per worker and at most one lead per physical team.
-- Advisory transaction locks make these checks safe under concurrent writes.
CREATE OR REPLACE FUNCTION public."enforcePhysicalTeamRosterIntegrity"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  target_team_type public."WorkTeamType";
BEGIN
  SELECT team."teamType"
  INTO target_team_type
  FROM public."WorkTeam" AS team
  WHERE team."id" = NEW."teamId";

  IF target_team_type = 'DISPATCH'::public."WorkTeamType" THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('physical-team-worker:' || NEW."userId")
    );

    IF EXISTS (
      SELECT 1
      FROM public."WorkTeamMember" AS existing_member
      INNER JOIN public."WorkTeam" AS existing_team
        ON existing_team."id" = existing_member."teamId"
      WHERE existing_member."userId" = NEW."userId"
        AND existing_member."id" <> NEW."id"
        AND existing_team."teamType" = 'DISPATCH'::public."WorkTeamType"
    ) THEN
      RAISE EXCEPTION
        'A worker can belong to only one physical team.'
        USING ERRCODE = '23505';
    END IF;

    IF NEW."role" = 'LEAD'::public."WorkTeamMemberRole" THEN
      PERFORM pg_advisory_xact_lock(
        hashtext('physical-team-lead:' || NEW."teamId")
      );

      IF EXISTS (
        SELECT 1
        FROM public."WorkTeamMember" AS existing_lead
        WHERE existing_lead."teamId" = NEW."teamId"
          AND existing_lead."id" <> NEW."id"
          AND existing_lead."role" = 'LEAD'::public."WorkTeamMemberRole"
      ) THEN
        RAISE EXCEPTION
          'A physical team can have only one team lead.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS "WorkTeamMember_physical_roster_integrity"
ON public."WorkTeamMember";

CREATE TRIGGER "WorkTeamMember_physical_roster_integrity"
BEFORE INSERT OR UPDATE OF "teamId", "userId", "role"
ON public."WorkTeamMember"
FOR EACH ROW
EXECUTE FUNCTION public."enforcePhysicalTeamRosterIntegrity"();
