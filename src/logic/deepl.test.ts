import assert from 'node:assert/strict'
import { test } from 'node:test'
import { translateDeepL } from './deepl'

test('DeepL requests and language conversion', async (t) => {
  let url = ''
  let options: RequestInit | undefined
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    url = input
    options = init
    return {
      ok: true,
      json: async () => ({ translations: [{ text: 'Hello', detected_source_language: 'ZH' }] }),
    }
  })

  const result = await translateDeepL('你好', 'auto', 'en', ' test:fx ')
  assert.equal(url, 'https://api-free.deepl.com/v2/translate')
  assert.equal(options?.method, 'POST')
  assert.deepEqual(options?.headers, {
    'Authorization': 'DeepL-Auth-Key test:fx',
    'Content-Type': 'application/json',
  })
  assert.deepEqual(JSON.parse(options?.body as string), { text: ['你好'], target_lang: 'EN' })
  assert.deepEqual(result, { original: '你好', translated: 'Hello', from: 'zh-CN', to: 'en' })

  await translateDeepL('Hello', 'en', 'zh-TW', 'test-pro')
  assert.equal(url, 'https://api.deepl.com/v2/translate')
  assert.deepEqual(JSON.parse(options?.body as string), { text: ['Hello'], target_lang: 'ZH-HANT', source_lang: 'EN' })

  const explicit = await translateDeepL('你好', 'zh-TW', 'no', 'test-pro')
  assert.equal(explicit.from, 'zh-TW')
  assert.deepEqual(JSON.parse(options?.body as string), { text: ['你好'], target_lang: 'NB', source_lang: 'ZH' })

  await translateDeepL('Hello', 'no', 'zh-CN', 'test-pro')
  assert.deepEqual(JSON.parse(options?.body as string), { text: ['Hello'], target_lang: 'ZH-HANS', source_lang: 'NB' })
})

test('DeepL rejects missing keys without a request', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request') })
  await assert.rejects(translateDeepL('Hello', 'auto', 'fr', '  '), /API key/)
  assert.equal(request.mock.callCount(), 0)
})

test('DeepL handles API errors without exposing the response body', async (t) => {
  let status = 400
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status }))
  for (const [code, message] of [
    [400, /language pair/],
    [403, /API key/],
    [429, /Too many/],
    [456, /quota/],
    [500, /failed \(500\)/],
  ] as const) {
    status = code
    await assert.rejects(translateDeepL('Hello', 'auto', 'fr', 'test'), message)
  }
})

test('DeepL rejects malformed responses', async (t) => {
  let response: unknown
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => response }))
  for (const body of [
    null,
    {},
    { translations: [] },
    { translations: [null] },
    { translations: [{ text: 'Bonjour' }] },
    { translations: [{ text: 123, detected_source_language: 'EN' }] },
    { translations: { 0: { text: 'Bonjour', detected_source_language: 'EN' } } },
  ]) {
    response = body
    await assert.rejects(translateDeepL('Hello', 'auto', 'fr', 'test'), /invalid translation response/)
  }
})
