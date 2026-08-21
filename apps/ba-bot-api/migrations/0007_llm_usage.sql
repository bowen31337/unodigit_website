-- Per-call LLM usage, so spend can be attributed to a model and a cache hit
-- rate can be seen at all.
--
-- A separate table rather than more columns on `conversations`, because two
-- different models are called per conversation — LLM_MODEL for chat turns and
-- LLM_MODEL_HEAVY for the estimator — and summing them into one pair of
-- counters, which is what conversations.tokens_in/out does, cannot answer
-- "what is the estimator costing us" or "is the prefix cache working".
--
-- `cached_tokens` is the portion of prompt_tokens the provider served from its
-- prefix cache. It is a SUBSET of prompt_tokens, not an addition to it: billed
-- input is (prompt_tokens - cached_tokens) at full rate plus cached_tokens at
-- the cache-hit rate.
CREATE TABLE IF NOT EXISTS llm_usage (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT REFERENCES conversations(id),
  model             TEXT NOT NULL,
  -- 'chat' or 'estimate' — the same model could serve both, and the question
  -- "what does an estimate cost" is asked more often than "what does v4-pro
  -- cost".
  purpose           TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  cached_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage (created_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_conv    ON llm_usage (conversation_id);
