export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  jsonMode?: boolean
  maxTokens?: number
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
