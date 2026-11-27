-- SQL Function to check if user exists by email (Hardened against enumeration)
-- Strict security: Revoke from anon to block Kali Linux/scraper email harvesting.

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS check_user_exists(text);

-- Create function to check if user exists
CREATE OR REPLACE FUNCTION check_user_exists(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, pg_temp
AS $$
BEGIN
  -- Require authentic admin privileges or internal service call
  IF NOT (public.is_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access Denied: User enumeration is prohibited.';
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE email = LOWER(TRIM(user_email))
  );
END;
$$;

-- Revoke all permissions from anon
REVOKE ALL ON FUNCTION check_user_exists(text) FROM PUBLIC, anon;
-- Grant execute permission only to authenticated users (evaluated inside function)
GRANT EXECUTE ON FUNCTION check_user_exists(text) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION check_user_exists IS 'Check if a user exists by email address (Protected against enumeration)';
