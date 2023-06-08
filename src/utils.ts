import { languagesByCode } from './languages'
import type { LanguageCodeSet } from './types'

export function isSameLanguageSet(langSet1: LanguageCodeSet, langSet2: LanguageCodeSet) {
  return langSet1.langFrom === langSet2.langFrom && langSet1.langTo === langSet2.langTo
}

export function getLanguageSetObjects(languageSet: LanguageCodeSet) {
  return {
    langFrom: languagesByCode[languageSet.langFrom],
    langTo: languagesByCode[languageSet.langTo],
  }
}

export function formatLanguageSet(languageSet: LanguageCodeSet) {
  const { langFrom, langTo } = getLanguageSetObjects(languageSet)
  return `${langFrom.name} ${langFrom?.flag ?? '🏳'} -> ${langTo?.flag ?? '🏳'} ${langTo.name}`
}
