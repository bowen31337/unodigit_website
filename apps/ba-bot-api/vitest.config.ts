import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

const migrations = await readD1Migrations('./migrations')

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          LLM_BASE_URL: 'https://llm.test',
          LLM_MODEL: 'test-model',
          LLM_MODEL_HEAVY: 'test-model-heavy',
          LLM_API_KEY: 'test-key',
          TURNSTILE_SECRET: 'test-turnstile',
          IP_HASH_SALT: 'test-salt',
          QUOTE_LINK_SIGNING_KEY: 'test-quote-signing-key-0123456789abcdef0123456789abcdef',
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
