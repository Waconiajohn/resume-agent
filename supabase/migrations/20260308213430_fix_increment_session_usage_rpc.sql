-- Fix increment_session_usage:
-- 1) Preserve NULL max_sessions_per_month as unlimited
-- 2) Harden SECURITY DEFINER function with explicit search_path
CREATE OR REPLACE FUNCTION increment_session_usage(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_max_sessions int;
  v_current_count int;
BEGIN
  v_period_start := date_trunc('month', now());
  v_period_end := v_period_start + interval '1 month';

  -- Free tier default when no subscription row exists.
  v_max_sessions := 3;

  -- Pull plan limit if a subscription exists.
  -- NOTE: NULL max_sessions_per_month means unlimited.
  SELECT pp.max_sessions_per_month
  INTO v_max_sessions
  FROM user_subscriptions us
  JOIN pricing_plans pp ON pp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  -- Upsert usage and check limit atomically
  INSERT INTO user_usage (user_id, period_start, period_end, sessions_count)
  VALUES (p_user_id, v_period_start, v_period_end, 1)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET sessions_count = user_usage.sessions_count + 1
  RETURNING sessions_count INTO v_current_count;

  IF v_max_sessions IS NOT NULL AND v_current_count > v_max_sessions THEN
    -- Roll back the increment
    UPDATE user_usage
    SET sessions_count = sessions_count - 1
    WHERE user_id = p_user_id AND period_start = v_period_start;

    RETURN jsonb_build_object(
      'allowed', false,
      'current_count', v_current_count - 1,
      'max_count', v_max_sessions
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count,
    'max_count', v_max_sessions
  );
END;
$$;
