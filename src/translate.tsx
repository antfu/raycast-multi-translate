import type { ReactElement } from 'react'
import React, { useState } from 'react'
import { Action, ActionPanel, Icon, List, Toast, showToast } from '@raycast/api'
import { usePromise } from '@raycast/utils'
import { useDebouncedValue, useSystemSelection, useTargetLanguages } from './hooks'
import type { LanguageCode } from './languages'
import { languagesByCode } from './languages'
import type { TranslateResult } from './translator'
import { translate, translateAll } from './translator'

const langReg = new RegExp(`>(${Object.keys(languagesByCode).join('|')})$`, 'i')

export default function Translate(): ReactElement {
  const langs = useTargetLanguages()
  const [isShowingDetail, setIsShowingDetail] = useState(true)
  const [input, setInput] = useState('')
  const [systemSelection] = useSystemSelection()

  let langFrom: LanguageCode = 'auto'
  const sourceText = (input.trim() || systemSelection).replace(langReg, (_, lang) => {
    langFrom = lang.toLowerCase()
    return ''
  }).trim()

  const debouncedText = useDebouncedValue(sourceText, 500)

  const { data: results, isLoading } = usePromise(
    translateAll,
    [debouncedText, langFrom, langs],
    {
      onError(error) {
        showToast({
          style: Toast.Style.Failure,
          title: 'Could not translate',
          message: error.toString(),
        })
      },
    },
  )

  return (
    <List
      searchBarPlaceholder={systemSelection || 'Enter text to translate'}
      searchText={input}
      onSearchTextChange={setInput}
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
    >
      {results?.map((item, index) => {
        if (item.from === item.to && item.translated === item.original)
          return null
        return (
          <List.Item
            key={index}
            title={item.translated}
            accessories={[{ text: `${item.from} -> ${item.to}` }]}
            detail={<TranslateDetail item={item} />}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy" content={item.translated} />
                  <Action
                    title="Toggle Full Text"
                    icon={Icon.Text}
                    onAction={() => setIsShowingDetail(!isShowingDetail)}
                  />
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

function TranslateDetail({ item }: { item: TranslateResult }): ReactElement {
  const { data: translatedBack, isLoading } = usePromise(
    translate,
    [item.translated, item.to, item.from],
  )

  let markdown = `${item.translated}\n\n----\n`

  if (isLoading)
    markdown += '*Loading...*'
  else if (translatedBack)
    markdown += translatedBack.translated

  return (<List.Item.Detail markdown={markdown} />)
}
