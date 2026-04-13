-- Add structured JSONB columns for performance scores and sentiment items
-- Previously serialized as text annotations in what_went_well/what_went_poorly fields
ALTER TABLE interview_debriefs
  ADD COLUMN IF NOT EXISTS performance_scores JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sentiment_items JSONB DEFAULT NULL;

COMMENT ON COLUMN interview_debriefs.performance_scores IS 'Structured performance dimension scores: {communication, technical_depth, cultural_fit, enthusiasm} each 1-5';
COMMENT ON COLUMN interview_debriefs.sentiment_items IS 'Array of {signal, type: positive|negative|neutral} interviewer sentiment observations';
