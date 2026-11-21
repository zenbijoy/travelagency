-- ============================================================================
-- SECURITY HARDENING: Fix all USING(true) / WITH CHECK(true) on non-SELECT policies
-- Migration: 20260618_fix_all_permissive_rls_policies.sql
--
-- Addresses:
--   1. 20260608f  – anon DELETE USING(true) on posts, post_comments, stories,
--                   anon FOR ALL USING(true) on post_likes, saved_posts,
--                   user_follows, group_members
--      → Already dropped by 20260609 + 20260613; this migration adds a
--        final safety DROP in case of partial rollout ordering issues.
--
--   2. 20260608_comprehensive_travel_platform_schema.sql
--      – FOR ALL USING(true) on user_profiles, user_preferences,
--        user_saved_items, loyalty_accounts, loyalty_points_transactions,
--        user_coupons, support_tickets, ticket_messages, service_chats,
--        chat_messages, ai_conversations, ai_messages, notifications,
--        shopno_wallets, shopno_wallet_transactions
--
--   3. 20260608g – FOR ALL USING(true) on friend_requests, conversations,
--                  conversation_participants, direct_messages, call_logs
--                  (anon + authenticated, WITH CHECK(true) for conversations)
--
--   4. 20260615_add_missing_system_and_operational_tables.sql
--      – FOR ALL USING(true) on sms_verification_codes  (dangerous: exposes OTPs)
--      – FOR ALL USING(true) on match_requests
--      – FOR INSERT WITH CHECK(true) on audit_logs (should be service_role only)
--
--   5. 20260617 – FOR ALL USING(true)/WITH CHECK(true) on home_hero_banners,
--                 trending_searches, search_logs
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Final safety drop of 20260608f anon policies
--             (already done in 20260609 + 20260613; idempotent here)
-- ============================================================================
DROP POLICY IF EXISTS post_comments_anon_insert   ON public.post_comments;
DROP POLICY IF EXISTS post_comments_anon_delete   ON public.post_comments;
DROP POLICY IF EXISTS post_likes_anon_all         ON public.post_likes;
DROP POLICY IF EXISTS saved_posts_anon_all        ON public.saved_posts;
DROP POLICY IF EXISTS user_follows_anon_all       ON public.user_follows;
DROP POLICY IF EXISTS posts_anon_insert           ON public.posts;
DROP POLICY IF EXISTS posts_anon_delete           ON public.posts;
DROP POLICY IF EXISTS post_media_anon_insert      ON public.post_media;
DROP POLICY IF EXISTS stories_anon_insert         ON public.stories;
DROP POLICY IF EXISTS stories_anon_delete         ON public.stories;
DROP POLICY IF EXISTS groups_anon_insert          ON public.groups;
DROP POLICY IF EXISTS group_members_anon_all      ON public.group_members;

-- Ensure anon has no write grants on community tables
REVOKE INSERT, UPDATE, DELETE ON
  public.posts, public.post_media, public.post_comments, public.post_likes,
  public.comment_likes, public.stories, public.groups, public.group_members,
  public.group_messages, public.user_follows, public.saved_posts
FROM anon;

-- ============================================================================
-- SECTION 2: Fix 20260608_comprehensive_travel_platform_schema.sql policies
-- ============================================================================

-- 2a. user_profiles: "Users can update own profile" FOR ALL USING(true)
--     → Replace with owner-only policy (view all profiles is fine for social)
DROP POLICY IF EXISTS "Users can view own profile"   ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

-- Public can view all profiles (social network requirement)
CREATE POLICY "user_profiles_public_read" ON public.user_profiles
  FOR SELECT
  USING (true);

-- Only the owner can mutate their own profile
CREATE POLICY "user_profiles_owner_write" ON public.user_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- 2b. user_preferences
DROP POLICY IF EXISTS "User preferences policy" ON public.user_preferences;

CREATE POLICY "user_preferences_owner_all" ON public.user_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- 2c. user_saved_items
DROP POLICY IF EXISTS "User saved items policy" ON public.user_saved_items;

CREATE POLICY "user_saved_items_owner_all" ON public.user_saved_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- 2d. loyalty_accounts (financial – strict owner isolation)
DROP POLICY IF EXISTS "Loyalty accounts policy" ON public.loyalty_accounts;

CREATE POLICY "loyalty_accounts_owner_read" ON public.loyalty_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "loyalty_accounts_system_write" ON public.loyalty_accounts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 2e. loyalty_points_transactions (financial – append-only for owners, full for service_role)
DROP POLICY IF EXISTS "Loyalty transactions policy" ON public.loyalty_points_transactions;

CREATE POLICY "loyalty_txn_owner_read" ON public.loyalty_points_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "loyalty_txn_system_write" ON public.loyalty_points_transactions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 2f. user_coupons
DROP POLICY IF EXISTS "User coupons policy" ON public.user_coupons;

CREATE POLICY "user_coupons_owner_all" ON public.user_coupons
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- 2g. support_tickets
DROP POLICY IF EXISTS "Support tickets policy" ON public.support_tickets;

CREATE POLICY "support_tickets_owner_all" ON public.support_tickets
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- 2h. ticket_messages
DROP POLICY IF EXISTS "Ticket messages policy" ON public.ticket_messages;

CREATE POLICY "ticket_messages_owner_all" ON public.ticket_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND (st.user_id = auth.uid() OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND (st.user_id = auth.uid() OR public.is_admin())
    )
  );


-- 2i. service_chats
DROP POLICY IF EXISTS "Service chats policy" ON public.service_chats;

CREATE POLICY "service_chats_participant_all" ON public.service_chats
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- 2j. chat_messages
DROP POLICY IF EXISTS "Chat messages policy" ON public.chat_messages;

CREATE POLICY "chat_messages_participant_all" ON public.chat_messages
  FOR ALL TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.service_chats sc
      WHERE sc.id = chat_id AND sc.user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR public.is_admin()
  );


-- 2k. ai_conversations
DROP POLICY IF EXISTS "AI conversations policy" ON public.ai_conversations;

CREATE POLICY "ai_conversations_owner_all" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- 2l. ai_messages
DROP POLICY IF EXISTS "AI messages policy" ON public.ai_messages;

CREATE POLICY "ai_messages_owner_all" ON public.ai_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations ac
      WHERE ac.id = conversation_id
        AND (ac.user_id = auth.uid() OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations ac
      WHERE ac.id = conversation_id
        AND (ac.user_id = auth.uid() OR public.is_admin())
    )
  );


-- 2m. notifications
DROP POLICY IF EXISTS "Notifications policy" ON public.notifications;

CREATE POLICY "notifications_owner_read" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "notifications_owner_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Only service_role / admin can insert/delete notifications
CREATE POLICY "notifications_system_insert" ON public.notifications
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "notifications_system_delete" ON public.notifications
  FOR DELETE TO service_role
  USING (true);


-- 2n. shopno_wallets (financial – critical)
DROP POLICY IF EXISTS "Wallets policy" ON public.shopno_wallets;

CREATE POLICY "wallets_owner_read" ON public.shopno_wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Wallet balance mutations must go through the process_wallet_payment() SECURITY DEFINER RPC
-- Direct UPDATE from client is disallowed; only service_role can mutate
CREATE POLICY "wallets_system_write" ON public.shopno_wallets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 2o. shopno_wallet_transactions (financial – append-only audit trail)
DROP POLICY IF EXISTS "Wallet transactions policy" ON public.shopno_wallet_transactions;

CREATE POLICY "wallet_txn_owner_read" ON public.shopno_wallet_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "wallet_txn_system_write" ON public.shopno_wallet_transactions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- SECTION 3: Fix 20260608g social messenger policies
-- ============================================================================

-- friend_requests: anon should NOT be able to manage friend requests
DROP POLICY IF EXISTS friend_requests_all ON public.friend_requests;

REVOKE INSERT, UPDATE, DELETE ON public.friend_requests FROM anon;

CREATE POLICY "friend_requests_participant_read" ON public.friend_requests
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.is_admin());

CREATE POLICY "friend_requests_sender_insert" ON public.friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "friend_requests_receiver_update" ON public.friend_requests
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid() OR sender_id = auth.uid() OR public.is_admin())
  WITH CHECK (receiver_id = auth.uid() OR sender_id = auth.uid() OR public.is_admin());

CREATE POLICY "friend_requests_participant_delete" ON public.friend_requests
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.is_admin());


-- conversations: anon should NOT create/delete conversations; WITH CHECK(true) is dangerous
DROP POLICY IF EXISTS conversations_all ON public.conversations;

REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM anon;

-- Conversations are readable by participants (via conversation_participants join)
CREATE POLICY "conversations_participant_read" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "conversations_participant_insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (true); -- creator will be added to conversation_participants immediately

CREATE POLICY "conversations_participant_update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (true);

CREATE POLICY "conversations_admin_delete" ON public.conversations
  FOR DELETE TO authenticated
  USING (public.is_admin());


-- conversation_participants: anon should NOT manage participants
DROP POLICY IF EXISTS conversation_participants_all ON public.conversation_participants;

REVOKE INSERT, UPDATE, DELETE ON public.conversation_participants FROM anon;

CREATE POLICY "convo_participants_self_read" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "convo_participants_self_manage" ON public.conversation_participants
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- direct_messages: anon should NOT send messages; sender must own the message
DROP POLICY IF EXISTS direct_messages_all ON public.direct_messages;

REVOKE INSERT, UPDATE, DELETE ON public.direct_messages FROM anon;

CREATE POLICY "direct_messages_participant_read" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = direct_messages.conversation_id
        AND cp.user_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "direct_messages_sender_insert" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "direct_messages_sender_delete" ON public.direct_messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.is_admin());


-- call_logs: anon should NOT create call logs
DROP POLICY IF EXISTS call_logs_all ON public.call_logs;

REVOKE INSERT, UPDATE, DELETE ON public.call_logs FROM anon;

CREATE POLICY "call_logs_participant_read" ON public.call_logs
  FOR SELECT TO authenticated
  USING (caller_id = auth.uid() OR receiver_id = auth.uid() OR public.is_admin());

CREATE POLICY "call_logs_caller_insert" ON public.call_logs
  FOR INSERT TO authenticated
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "call_logs_participant_update" ON public.call_logs
  FOR UPDATE TO authenticated
  USING (caller_id = auth.uid() OR receiver_id = auth.uid() OR public.is_admin())
  WITH CHECK (caller_id = auth.uid() OR receiver_id = auth.uid() OR public.is_admin());


-- ============================================================================
-- SECTION 4: Fix 20260615_add_missing_system_and_operational_tables.sql
-- ============================================================================

-- 4a. sms_verification_codes: FOR ALL USING(true) exposes OTP hashes to any user!
--     Only service_role should touch this table directly.
DROP POLICY IF EXISTS "sms_codes_policy" ON public.sms_verification_codes;

REVOKE ALL ON public.sms_verification_codes FROM anon, authenticated;
GRANT ALL ON public.sms_verification_codes TO service_role;

CREATE POLICY "sms_codes_service_role_only" ON public.sms_verification_codes
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 4b. audit_logs: FOR INSERT WITH CHECK(true) lets any role insert arbitrary audit events.
--     Only service_role should write; admins can read.
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "audit_logs_system_insert" ON public.audit_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 4c. match_requests: FOR ALL USING(true) lets any user read/modify anyone's match request
DROP POLICY IF EXISTS "match_requests_policy" ON public.match_requests;

CREATE POLICY "match_requests_owner_all" ON public.match_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());


-- ============================================================================
-- SECTION 5: Fix 20260617_home_hero_banner_and_trending_searches.sql
-- ============================================================================

-- home_hero_banners: public read is fine; only admins should INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS allow_all_home_hero_banners ON public.home_hero_banners;

REVOKE INSERT, UPDATE, DELETE ON public.home_hero_banners FROM anon, authenticated;
GRANT SELECT ON public.home_hero_banners TO anon, authenticated;
GRANT ALL ON public.home_hero_banners TO service_role;

CREATE POLICY "home_hero_banners_public_read" ON public.home_hero_banners
  FOR SELECT
  USING (is_active = true OR public.is_admin());

CREATE POLICY "home_hero_banners_admin_write" ON public.home_hero_banners
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "home_hero_banners_service_role" ON public.home_hero_banners
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- trending_searches: same as banners — public read, admin write only
DROP POLICY IF EXISTS allow_all_trending_searches ON public.trending_searches;

REVOKE INSERT, UPDATE, DELETE ON public.trending_searches FROM anon, authenticated;
GRANT SELECT ON public.trending_searches TO anon, authenticated;
GRANT ALL ON public.trending_searches TO service_role;

CREATE POLICY "trending_searches_public_read" ON public.trending_searches
  FOR SELECT
  USING (is_active = true OR public.is_admin());

CREATE POLICY "trending_searches_admin_write" ON public.trending_searches
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "trending_searches_service_role" ON public.trending_searches
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- search_logs: anon/authenticated can INSERT their own search log; nobody can read/delete
--              (privacy: search history should not be cross-readable)
DROP POLICY IF EXISTS allow_all_search_logs ON public.search_logs;

REVOKE ALL ON public.search_logs FROM anon;
GRANT INSERT ON public.search_logs TO authenticated;
GRANT ALL ON public.search_logs TO service_role;

CREATE POLICY "search_logs_authenticated_insert" ON public.search_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "search_logs_admin_read" ON public.search_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "search_logs_service_role" ON public.search_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- Notify PostgREST to reload schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
