-- Normalize legacy draft-readiness artifacts after removing evidence count as a readiness gate.
-- This backfills persisted workflow artifacts so old sessions do not deserialize as "not ready"
-- with no visible blockers after evidence_target is filtered out.

BEGIN;

WITH candidate_artifacts AS (
  SELECT
    swa.id,
    swa.artifact_type,
    swa.payload,
    CASE
      WHEN jsonb_typeof(swa.payload->'remaining_coverage_needed') = 'number' THEN
        GREATEST(0, CEIL((swa.payload->>'remaining_coverage_needed')::numeric))::integer
      WHEN jsonb_typeof(swa.payload->'coverage_score') = 'number'
        AND jsonb_typeof(swa.payload->'coverage_threshold') = 'number' THEN
        GREATEST(
          0,
          CEIL(((swa.payload->>'coverage_threshold')::numeric - (swa.payload->>'coverage_score')::numeric))
        )::integer
      ELSE NULL
    END AS normalized_remaining_coverage_needed
  FROM session_workflow_artifacts swa
  WHERE swa.artifact_type IN ('draft_readiness', 'draft_path_decision')
    AND (
      COALESCE(swa.payload->'blocking_reasons', '[]'::jsonb) @> '["evidence_target"]'::jsonb
      OR COALESCE(swa.payload->>'message', '') ILIKE '%evidence%'
    )
),
normalized_stage1 AS (
  SELECT
    c.id,
    c.artifact_type,
    CASE
      WHEN c.normalized_remaining_coverage_needed IS NULL THEN
        jsonb_set(
          c.payload,
          '{blocking_reasons}',
          COALESCE(
            (
              SELECT jsonb_agg(reason)
              FROM jsonb_array_elements_text(COALESCE(c.payload->'blocking_reasons', '[]'::jsonb)) AS r(reason)
              WHERE reason = 'coverage_threshold'
            ),
            '[]'::jsonb
          ),
          true
        )
      ELSE
        jsonb_set(
          jsonb_set(
            jsonb_set(
              c.payload,
              '{ready}',
              to_jsonb(c.normalized_remaining_coverage_needed = 0),
              true
            ),
            '{remaining_coverage_needed}',
            to_jsonb(c.normalized_remaining_coverage_needed),
            true
          ),
          '{blocking_reasons}',
          CASE
            WHEN c.normalized_remaining_coverage_needed > 0 THEN '["coverage_threshold"]'::jsonb
            ELSE '[]'::jsonb
          END,
          true
        )
    END AS normalized_payload
  FROM candidate_artifacts c
),
normalized_stage2 AS (
  SELECT
    n.id,
    CASE
      WHEN n.artifact_type = 'draft_path_decision'
        AND COALESCE(n.normalized_payload->>'message', '') ILIKE '%evidence%'
        AND COALESCE(n.normalized_payload->>'ready', 'false') = 'true'
      THEN jsonb_set(n.normalized_payload, '{proceeding_reason}', '"readiness_met"'::jsonb, true)
      ELSE n.normalized_payload
    END AS normalized_payload
  FROM normalized_stage1 n
)
UPDATE session_workflow_artifacts swa
SET payload = n.normalized_payload
FROM normalized_stage2 n
WHERE swa.id = n.id
  AND swa.payload IS DISTINCT FROM n.normalized_payload;

COMMIT;
