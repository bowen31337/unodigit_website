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
   * Let the model reason before answering. Defaults to true — the provider's
   * own default, and what every existing caller expects.
   *
   * `false` sends `thinking: { type: 'disabled' }`, which on deepseek-v4-flash
   * cuts a turn from ~1200 completion tokens and 12–20s to ~33 tokens and
   * under a second. That is the right trade only where the turn is an
   * acknowledge-and-ask, not an analysis — see REASONING_BY_STATE.
   */
  reasoning?: boolean
}

export interface ChatResponse {
  content: string
  finishReason: string
  promptTokens: number
  completionTokens: number
}

export interface LlmClient {
  chat(req: ChatRequest): Promise<ChatResponse>
}
