import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { toDeepLSource, toDeepLTarget, translateWithDeepL } from '../src/logic/deepl'
import { translate, translateAll, TranslateError } from '../src/logic/translator'

describe('DeepL Language Mapping', () => {
  it('correctly maps source languages', () => {
    assert.equal(toDeepLSource('auto' as any), undefined)
    assert.equal(toDeepLSource('en' as any), 'EN')
    assert.equal(toDeepLSource('zh' as any), 'ZH')
    assert.equal(toDeepLSource('de' as any), 'DE')
    assert.equal(toDeepLSource('fr' as any), 'FR')
    assert.equal(toDeepLSource('ja' as any), 'JA')
    assert.equal(toDeepLSource('unknown_code' as any), undefined)
  })

  it('correctly maps target languages with regional codes', () => {
    assert.equal(toDeepLTarget('en' as any), 'EN-US')
    assert.equal(toDeepLTarget('en-gb' as any), 'EN-GB')
    assert.equal(toDeepLTarget('pt' as any), 'PT-BR')
    assert.equal(toDeepLTarget('pt-pt' as any), 'PT-PT')
    assert.equal(toDeepLTarget('zh' as any), 'ZH')
    assert.equal(toDeepLTarget('ja' as any), 'JA')
    assert.equal(toDeepLTarget('de' as any), 'DE')
    assert.equal(toDeepLTarget('unknown_lang' as any), undefined)
  })
})

describe('translateWithDeepL Client', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  it('throws error when API key is missing', async () => {
    await assert.rejects(
      async () => {
        await translateWithDeepL('Hello', 'en' as any, 'zh' as any, { apiKey: '' })
      },
      (err: any) => {
        assert.ok(err instanceof TranslateError)
        assert.equal(err.name, 'Missing API Key')
        return true
      }
    )
  })

  it('throws error when target language is unsupported by DeepL', async () => {
    await assert.rejects(
      async () => {
        await translateWithDeepL('Hello', 'en' as any, 'unsupported_xyz' as any, { apiKey: 'dummy-key:fx' })
      },
      (err: any) => {
        assert.ok(err instanceof TranslateError)
        assert.equal(err.name, 'Unsupported Language')
        return true
      }
    )
  })

  it('uses api-free.deepl.com endpoint when key ends with :fx', async () => {
    let capturedUrl = ''
    let capturedAuth = ''
    let capturedBody = ''

    globalThis.fetch = (async (url: string, init: any) => {
      capturedUrl = url
      capturedAuth = init?.headers?.Authorization
      capturedBody = init?.body
      return {
        ok: true,
        status: 200,
        json: async () => ({
          translations: [
            {
              detected_source_language: 'EN',
              text: '你好世界',
            },
          ],
        }),
      } as Response
    }) as any

    const res = await translateWithDeepL('Hello world', 'en' as any, 'zh' as any, {
      apiKey: 'test-key-123:fx',
    })

    assert.equal(capturedUrl, 'https://api-free.deepl.com/v2/translate')
    assert.equal(capturedAuth, 'DeepL-Auth-Key test-key-123:fx')
    assert.ok(capturedBody.includes('"target_lang":"ZH"'))
    assert.ok(capturedBody.includes('"source_lang":"EN"'))
    assert.equal(res.original, 'Hello world')
    assert.equal(res.translated, '你好世界')
    assert.equal(res.from, 'en')
    assert.equal(res.to, 'zh')
  })

  it('uses api.deepl.com for pro plans without :fx suffix', async () => {
    let capturedUrl = ''

    globalThis.fetch = (async (url: string) => {
      capturedUrl = url
      return {
        ok: true,
        status: 200,
        json: async () => ({
          translations: [{ text: 'Hallo Welt' }],
        }),
      } as Response
    }) as any

    await translateWithDeepL('Hello world', 'en' as any, 'de' as any, {
      apiKey: 'pro-paid-key-xyz',
      endpoint: 'pro',
    })

    assert.equal(capturedUrl, 'https://api.deepl.com/v2/translate')
  })

  it('omits source_lang when from is auto and uses detected language', async () => {
    let capturedBody: any = null

    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init?.body || '{}')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          translations: [
            {
              detected_source_language: 'FR',
              text: 'Bonjour le monde',
            },
          ],
        }),
      } as Response
    }) as any

    const res = await translateWithDeepL('Hello world', 'auto' as any, 'fr' as any, {
      apiKey: 'test:fx',
    })

    assert.equal(capturedBody.source_lang, undefined)
    assert.equal(capturedBody.target_lang, 'FR')
    assert.equal(res.from, 'fr')
  })

  it('handles HTTP 403 Invalid API Key gracefully', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Invalid auth key',
    })) as any

    await assert.rejects(
      async () => {
        await translateWithDeepL('Test', 'en' as any, 'es' as any, { apiKey: 'bad-key:fx' })
      },
      (err: any) => {
        assert.ok(err instanceof TranslateError)
        assert.equal(err.name, 'Authentication Failed')
        return true
      }
    )
  })

  it('handles HTTP 456 Quota Exceeded gracefully', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 456,
      statusText: 'Quota Exceeded',
      text: async () => 'Quota limit reached',
    })) as any

    await assert.rejects(
      async () => {
        await translateWithDeepL('Test', 'en' as any, 'es' as any, { apiKey: 'key:fx' })
      },
      (err: any) => {
        assert.ok(err instanceof TranslateError)
        assert.equal(err.name, 'Quota Exceeded')
        return true
      }
    )
  })

  it('handles HTTP 429 Rate Limit gracefully', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded',
    })) as any

    await assert.rejects(
      async () => {
        await translateWithDeepL('Test', 'en' as any, 'es' as any, { apiKey: 'key:fx' })
      },
      (err: any) => {
        assert.ok(err instanceof TranslateError)
        assert.equal(err.name, 'Too Many Requests')
        return true
      }
    )
  })
})

describe('translateAll Resiliency', () => {
  it('returns empty array when text is empty', async () => {
    const res = await translateAll('', 'en' as any, ['zh' as any, 'de' as any])
    assert.deepEqual(res, [])
  })
})
