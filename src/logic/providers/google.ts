import googleTranslate from '@iamtraction/google-translate'
import type { LanguageCode } from '../../data/languages'
import type { TranslateResult } from '../../types'
import { TranslateError } from './errors'

export async function translateWithGoogle(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
): Promise<TranslateResult> {
  try {
    const translated = await googleTranslate(text, {
      from,
      to,
    })

    return {
      original: text,
      translated: translated.text,
      from: translated?.from?.language?.didYouMean
        ? from
        : translated?.from?.language?.iso as LanguageCode,
      to,
    }
  }
  catch (err) {
    if (err instanceof Error) {
      switch (err.name) {
        case 'TooManyRequestsError':
          throw new TranslateError('please try again later', 'Too many requests')
        default:
          throw new TranslateError(err)
      }
    }

    throw err
  }
}
