import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

const migrations = await readD1Migrations('./migrations')

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
    poolOptions: {
      workers: {
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
          },
        },
      },
    },
  },
})
