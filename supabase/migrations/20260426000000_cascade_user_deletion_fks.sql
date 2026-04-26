-- Wave 3 of the auth-hardening sprint — make account deletion clean.
--
-- Eight tables had FKs to auth.users with ON DELETE NO ACTION (the SQL
-- default), which means a DELETE on auth.users would fail with a
-- foreign-key-violation. This migration walks each one and switches to
-- CASCADE (full wipe — owned by the user) or SET NULL (preserve as
-- cross-cutting record where the user_id was a reference but not ownership).
--
-- Audit before:
--   affiliates.user_id                         NO ACTION → CASCADE  (account = affiliate)
--   personal_brand_reports.user_id             NO ACTION → CASCADE  (user content)
--   referral_events.referred_user_id           NO ACTION → SET NULL (preserve referrer's payout history)
--   thank_you_note_reports.user_id             NO ACTION → CASCADE  (user content)
--   user_feature_overrides.user_id             NO ACTION → CASCADE  (user-specific feature flags)
--   user_positioning_profiles.user_id          NO ACTION → CASCADE  (user content)
--   user_subscriptions.user_id                 NO ACTION → CASCADE  (no users yet; Stripe holds reconciliation source)
--   user_usage.user_id                         NO ACTION → CASCADE  (usage tracking is useless without the user)
--
-- b2b_seats.user_id is already SET NULL (org owns the seat record), so
-- account deletion leaves the seat as "vacant" rather than removing it. ✓

ALTER TABLE public.affiliates
  DROP CONSTRAINT IF EXISTS affiliates_user_id_fkey,
  ADD CONSTRAINT affiliates_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.personal_brand_reports
  DROP CONSTRAINT IF EXISTS personal_brand_reports_user_id_fkey,
  ADD CONSTRAINT personal_brand_reports_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.referral_events
  DROP CONSTRAINT IF EXISTS referral_events_referred_user_id_fkey,
  ADD CONSTRAINT referral_events_referred_user_id_fkey
    FOREIGN KEY (referred_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.thank_you_note_reports
  DROP CONSTRAINT IF EXISTS thank_you_note_reports_user_id_fkey,
  ADD CONSTRAINT thank_you_note_reports_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_feature_overrides
  DROP CONSTRAINT IF EXISTS user_feature_overrides_user_id_fkey,
  ADD CONSTRAINT user_feature_overrides_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_positioning_profiles
  DROP CONSTRAINT IF EXISTS user_positioning_profiles_user_id_fkey,
  ADD CONSTRAINT user_positioning_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey,
  ADD CONSTRAINT user_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_usage
  DROP CONSTRAINT IF EXISTS user_usage_user_id_fkey,
  ADD CONSTRAINT user_usage_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
