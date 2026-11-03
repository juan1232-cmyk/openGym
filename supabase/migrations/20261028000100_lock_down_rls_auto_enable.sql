-- Supabase's own event trigger (turns RLS on for every new public table) was callable by anyone
-- through /rest/v1/rpc/rls_auto_enable. It only needs to run as a trigger, not as an endpoint.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
