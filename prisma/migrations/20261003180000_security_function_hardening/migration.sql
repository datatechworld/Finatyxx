-- Finatyx security-definer function hardening
-- Restrict function name resolution and fully qualify referenced objects.

CREATE OR REPLACE FUNCTION public.current_finatyx_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT u.id
  FROM public.users AS u
  WHERE u."clerkId" = (SELECT auth.jwt()->>'sub')
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_active_tenant_member(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS tm
    WHERE tm."tenantId" = target_tenant_id
      AND tm."userId" = public.current_finatyx_user_id()
      AND tm.status = 'ACTIVE'::public."MembershipStatus"
  );
$function$;