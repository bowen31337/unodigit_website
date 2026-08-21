export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  jsonMode?: boolean
  maxTokens?: number
  /**
   * Let the model reason before answering. Undefined means "do not send the
   * field", i.e. the provider's own default (on). This is the transport layer;
   * the bot's own default lives in llm/turn, which passes false.
   *
   * `false` sends `thinking: { type: 'disabled' }`. These are elicitation
   * turns, so reasoning buys nothing: a full 7-turn interview measured 9.2s
   * and 600 completion tokens with it off, against 78.1s and 9012 with it on.
   *
   * It is only safe to disable because llm/history replays assistant turns as
   * JSON envelopes. Against a PROSE history, `thinking: disabled` makes the
   * model answer with whitespace — read that file before changing either.
   */
  reasoning?: boolean
  /** Sampling temperature. Omitted means the provider default, which for an
   *  analytical task is too high: the estimator measured a ±25% spread on
   *  identical input, so the same brief could price at 78 or 128 tasks. */
  temperature?: number
}

export interface ChatResponse {
  content: string
  finishReason: string
  promptTokens: number
  completionTokens: number
  /** Portion of `promptTokens` the provider served from its prefix cache — a
   *  SUBSET of it, not an addition. 0 when the provider does not report one. */
  cachedTokens: number
  /** Echoed back by the provider. Recorded rather than assumed from config, so
   *  a silent substitution upstream is visible instead of invisible. */
  model: string
}

export interface LlmClient {
  chat(req: ChatRequest): Promise<ChatResponse>
}
