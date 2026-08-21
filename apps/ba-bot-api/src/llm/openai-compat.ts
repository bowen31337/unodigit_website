import type { ChatRequest, ChatResponse, LlmClient } from './types'

interface RawChoice {
  message?: { content?: string | null }
  finish_reason?: string
}
interface RawResponse {
  choices?: RawChoice[]
  model?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    // DeepSeek reports the cache hit two ways; OpenAI-compatible providers use
    // the nested form. Read both so neither provider silently reports zero.
    prompt_cache_hit_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

export function createOpenAiCompatClient(opts: { baseUrl: string; apiKey: string }): LlmClient {
  const endpoint = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`

  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 1024,
          ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          // Only sent when explicitly switched off. Omitting the field leaves
          // the provider's default (reasoning on) rather than pinning it, so a
          // caller that says nothing keeps the behaviour it has today.
          ...(req.reasoning === false ? { thinking: { type: 'disabled' } } : {}),
        }),
      })

      if (!res.ok) {
        throw new Error(`llm_http_${res.status}`)
      }

      const raw = (await res.json()) as RawResponse
      const choice = raw.choices?.[0]

      return {
        content: choice?.message?.content ?? '',
        finishReason: choice?.finish_reason ?? 'stop',
        promptTokens: raw.usage?.prompt_tokens ?? 0,
        completionTokens: raw.usage?.completion_tokens ?? 0,
        cachedTokens:
          raw.usage?.prompt_cache_hit_tokens ??
          raw.usage?.prompt_tokens_details?.cached_tokens ??
          0,
        model: raw.model ?? req.model,
      }
    },
  }
}
