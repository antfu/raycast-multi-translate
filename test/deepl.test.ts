import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  DEEPL_FREE_ENDPOINT,
  DEEPL_PRO_ENDPOINT,
  fromDeepLDetectedLang,
  getDeepLEndpoint,
  toDeepLSourceLang,
  toDeepLTargetLang,
} from '../src/logic/deepl'
import {
  TranslateError,
  clearTranslateCache,
  translate,
  translateAll,
} from '../src/logic/translator'

describe('DeepL API provider (#7)', () => {
  beforeEach(() => {
    clearTranslateCache()
  })

  it('selects Free vs Pro DeepL endpoint based on :fx key suffix', () => {
    assert.equal(getDeepLEndpoint('abc123-key:fx'), DEEPL_FREE_ENDPOINT)
    assert.equal(getDeepLEndpoint('  abc123-key:fx  '), DEEPL_FREE_ENDPOINT)
    assert.equal(getDeepLEndpoint('pro-key-999'), DEEPL_PRO_ENDPOINT)
  })

  it('maps Raycast LanguageCode values to DeepL source and target codes', () => {
    assert.equal(toDeepLSourceLang('auto'), undefined)
    assert.equal(toDeepLSourceLang('zh-CN'), 'ZH')
    assert.equal(toDeepLSourceLang('zh-TW'), 'ZH')
    assert.equal(toDeepLSourceLang('no'), 'NB')
    assert.equal(toDeepLSourceLang('de'), 'DE')

    assert.equal(toDeepLTargetLang('en'), 'EN-US')
    assert.equal(toDeepLTargetLang('pt'), 'PT-PT')
    assert.equal(toDeepLTargetLang('zh-CN'), 'ZH-HANS')
    assert.equal(toDeepLTargetLang('zh-TW'), 'ZH-HANT')
    assert.equal(toDeepLTargetLang('no'), 'NB')
    assert.equal(toDeepLTargetLang('ja'), 'JA')
  })

  it('normalizes DeepL detected_source_language back to Raycast LanguageCode', () => {
    assert.equal(fromDeepLDetectedLang('EN', 'auto'), 'en')
    assert.equal(fromDeepLDetectedLang('NB', 'auto'), 'no')
    assert.equal(fromDeepLDetectedLang('ZH', 'auto'), 'zh-CN')
    assert.equal(fromDeepLDetectedLang('ZH', 'zh-TW'), 'zh-TW')
    assert.equal(fromDeepLDetectedLang('DE', 'auto'), 'de')
  })

  it('sends authenticated POST to DeepL Free API and parses auto-detected language', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return new Response(
        JSON.stringify({
          translations: [{ detected_source_language: 'DE', text: 'Hello world' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const res = await translate('Hallo Welt', 'auto', 'en', {
      provider: 'deepl',
      deeplApiKey: 'test-free-key:fx',
      fetchImpl: mockFetch,
    })

    assert.equal(capturedUrl, DEEPL_FREE_ENDPOINT)
    const headers = capturedInit?.headers as Record<string, string>
    assert.equal(headers.Authorization, 'DeepL-Auth-Key test-free-key:fx')
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      text: ['Hallo Welt'],
      target_lang: 'EN-US',
    })
    assert.deepEqual(res, {
      original: 'Hallo Welt',
      translated: 'Hello world',
      from: 'de',
      to: 'en',
    })
  })

  it('filters identical source language in translateAll and caches per provider', async () => {
    let callCount = 0
    const mockFetch: typeof fetch = async (_input, init) => {
      callCount += 1
      const body = JSON.parse(String(init?.body)) as { target_lang: string }
      const map: Record<string, string> = {
        'EN-US': 'Hello',
        'FR': 'Bonjour',
        'ES': 'Hola',
      }
      return new Response(
        JSON.stringify({
          translations: [{ detected_source_language: 'EN', text: map[body.target_lang] }],
        }),
        { status: 200 },
      )
    }

    const opts = {
      provider: 'deepl' as const,
      deeplApiKey: 'pro-secret-key',
      fetchImpl: mockFetch,
    }

    const batch = await translateAll('Hello', 'auto', ['en', 'fr', 'es'], opts)
    assert.equal(callCount, 3)
    assert.deepEqual(batch.map(i => i.to), ['fr', 'es'])

    // Cached repeat call makes zero network requests
    const cachedBatch = await translateAll('Hello', 'auto', ['en', 'fr', 'es'], opts)
    assert.equal(callCount, 3)
    assert.equal(cachedBatch.length, 2)
  })

  it('surfaces clear TranslateError on missing key, 403 invalid key, 429 rate limit, and 456 quota', async () => {
    await assert.rejects(
      () => translate('Bonjour', 'fr', 'en', { provider: 'deepl', deeplApiKey: '   ' }),
      (err: unknown) => err instanceof TranslateError && err.name === 'Missing DeepL API key',
    )

    const statusMock = (status: number): typeof fetch => async () =>
      new Response(JSON.stringify({ message: 'error' }), { status })

    await assert.rejects(
      () => translate('Bonjour', 'fr', 'en', { provider: 'deepl', deeplApiKey: 'bad:fx', fetchImpl: statusMock(403) }),
      (err: unknown) => err instanceof TranslateError && err.name === 'Invalid DeepL API key',
    )

    await assert.rejects(
      () => translate('Bonjour', 'fr', 'en', { provider: 'deepl', deeplApiKey: 'lim:fx', fetchImpl: statusMock(429) }),
      (err: unknown) => err instanceof TranslateError && err.name === 'Too many requests' && err.message === 'please try again later',
    )

    await assert.rejects(
      () => translate('Bonjour', 'fr', 'en', { provider: 'deepl', deeplApiKey: 'quo:fx', fetchImpl: statusMock(456) }),
      (err: unknown) => err instanceof TranslateError && err.name === 'Quota exceeded',
    )
  })
})
