import type { ReactElement } from 'react'
import { useState } from 'react'
import { Action, ActionPanel, Icon, List, Toast, showToast } from '@raycast/api'
import { usePromise } from '@raycast/utils'
import type { LanguageCode } from '../data/languages'
import { languagesByCode } from '../data/languages'
import { translateAll } from '../logic/translator'
import { useDebouncedValue, useSystemSelection, useTargetLanguages } from '../logic/hooks'
import { SpellingCheckItem } from './SpellingCheckItem'
import { TranslateDetail } from './TranslateDetail'

const langReg = new RegExp(`[>:/](${Object.keys(languagesByCode).join('|')})$`, 'i')

export default function Main(): ReactElement {
  const langs = useTargetLanguages()
  const [isShowingDetail, setIsShowingDetail] = useState(true)
  const [input, setInput] = useState('')
  const [systemSelection] = useSystemSelection()

  let langFrom: LanguageCode = 'auto'
  const sourceText = (input.trim() || systemSelection)
    .replace(langReg, (_, lang) => {
      langFrom = lang.toLowerCase()
      return ''
    })
    .trim()

  const debouncedText = useDebouncedValue(sourceText, 500)

  const { data: results, isLoading } = usePromise(translateAll, [debouncedText, langFrom, langs], {
    onError(error) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Could not translate',
        message: error.toString(),
      })
    },
  })

  const fromLangs = new Set(results?.map(i => i.from))
  const singleSource = fromLangs.size === 1

  return (
    <List
      searchBarPlaceholder={systemSelection || 'Enter text to translate'}
      searchText={input}
      onSearchTextChange={setInput}
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      throttle
    >
      <SpellingCheckItem text={sourceText} />
      {results?.map((item, index) => {
        if (singleSource && item.from === item.to && item.translated.trim().toLowerCase() === item.original.trim().toLowerCase())
          return null

        return (
          <List.Item
            key={index}
            title={item.translated}
            accessories={[{ text: singleSource ? item.to : `${item.from} -> ${item.to}` }]}
            detail={<TranslateDetail item={item} />}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.CopyToClipboard
                    title="Copy"
                    content={item.translated}
                  />
                  <Action title="Toggle Full Text" icon={Icon.Text} onAction={() => setIsShowingDetail(!isShowingDetail)} />
                  <Action.OpenInBrowser
                    title="Open in Google Translate"
                    shortcut={{ modifiers: ['opt'], key: 'enter' }}
                    url={`https://translate.google.com/?sl=${item.from}&tl=${item.to}&text=${encodeURIComponent(item.original)}&op=translate`}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        )
      })}
    </List>
  )
}
