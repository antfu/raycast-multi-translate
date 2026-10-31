import test from 'node:test'
import assert from 'node:assert/strict'
import { translateWithDeepL, formatDeepLLanguage } from '../src/logic/translator'

test('DeepL Language Formatting', () => {
  assert.equal(formatDeepLLanguage('en', true), 'EN-US')
  assert.equal(formatDeepLLanguage('pt', true), 'PT-PT')
  assert.equal(formatDeepLLanguage('zh-CN', true), 'ZH')
  assert.equal(formatDeepLLanguage('zh-TW', true), 'ZH')
  assert.equal(formatDeepLLanguage('de', true), 'DE')
  assert.equal(formatDeepLLanguage('ru', true), 'RU')
  assert.equal(formatDeepLLanguage('auto', false), undefined)
  assert.equal(formatDeepLLanguage('', false), undefined)
})

test('DeepL Endpoint Determination (Free vs Pro)', async () => {
  let requestedUrl = ''
  let requestedHeaders: Record<string, string> = {}
  let requestedBody: any = null

  const mockFetch = async (url: any, init: any) => {
    requestedUrl = String(url)
    requestedHeaders = init.headers
    requestedBody = JSON.parse(init.body)
    return {
      ok: true,
      json: async () => ({
        translations: [
          {
            detected_source_language: 'EN',
            text: 'Hallo Welt',
          },
        ],
      }),
    } as any
  }

  // 1. Free API Key ending in :fx
  const resFree = await translateWithDeepL(
    'Hello world',
    'en',
    'de',
    'test-key-123:fx',
    mockFetch
  )

  assert.equal(requestedUrl, 'https://api-free.deepl.com/v2/translate')
  assert.equal(requestedHeaders.Authorization, 'DeepL-Auth-Key test-key-123:fx')
  assert.equal(requestedBody.text[0], 'Hello world')
  assert.equal(requestedBody.target_lang, 'DE')
  assert.equal(resFree.translated, 'Hallo Welt')
  assert.equal(resFree.from, 'en')
  assert.equal(resFree.to, 'de')

  // 2. Pro API Key
  const resPro = await translateWithDeepL(
    'Hello world',
    'auto',
    'en',
    'test-pro-key',
    mockFetch
  )
  assert.equal(requestedUrl, 'https://api.deepl.com/v2/translate')
  assert.equal(requestedHeaders.Authorization, 'DeepL-Auth-Key test-pro-key')
  assert.equal(requestedBody.target_lang, 'EN-US')
  assert.equal(requestedBody.source_lang, undefined)
})

test('DeepL Error Handling on Non-200 Response', async () => {
  const failingFetch = async () => ({
    ok: false,
    status: 456,
    text: async () => 'Quota exceeded',
  } as any)

  await assert.rejects(
    async () => {
      await translateWithDeepL('Hello', 'en', 'de', 'key:fx', failingFetch)
    },
    /DeepL API error \(456\): Quota exceeded/
  )
})
