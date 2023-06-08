import type { ReactElement } from 'react'
import React, { useState } from 'react'
import { Action, ActionPanel, Icon, List, Toast, showToast } from '@raycast/api'
import { usePromise } from '@raycast/utils'
import { useDebouncedValue, useLanguages, useTextState } from './hooks'
import type { LanguageCode } from './languages'
import { supportedLanguagesByCode } from './languages'

// import { LanguageManagerListDropdown } from "./LanguagesManager";
import { multipleWayTranslate } from './simple-translate'

const langReg = new RegExp(`>(${Object.keys(supportedLanguagesByCode).join('|')})$`, 'i')

export default function Translate(): ReactElement {
  const langs = useLanguages()
  const [isShowingDetail, setIsShowingDetail] = useState(false)
  const [rawText, setText] = useTextState()

  let langFrom: LanguageCode = 'auto'
  const text = rawText.replace(langReg, (_, lang) => {
    langFrom = lang.toLowerCase()
    return ''
  }).trim()

  const debouncedValue = useDebouncedValue(text, 500)

  const { data: results, isLoading } = usePromise(
    multipleWayTranslate,
    [debouncedValue, langFrom, langs],
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
      searchBarPlaceholder="Enter text to translate"
      searchText={rawText}
      onSearchTextChange={setText}
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
    >
      {results?.map((r, index) => {
        const langFrom = supportedLanguagesByCode[r.langFrom]
        const langTo = supportedLanguagesByCode[r.langTo]
        const languages = `${langFrom.code} -> ${langTo.code}`

        return (
          <List.Item
            key={index}
            title={r.translatedText}
            accessories={[{ text: languages }]}
            detail={<List.Item.Detail markdown={r.translatedText} />}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy" content={r.translatedText} />
                  <Action
                    title="Toggle Full Text"
                    icon={Icon.Text}
                    onAction={() => setIsShowingDetail(!isShowingDetail)}
                  />
                  <Action.OpenInBrowser
                    title="Open in Google Translate"
                    shortcut={{ modifiers: ['opt'], key: 'enter' }}
                    url={
                      `https://translate.google.com/?sl=${
                      r.langFrom
                       }&tl=${
                       r.langTo
                       }&text=${
                       encodeURIComponent(debouncedValue)
                       }&op=translate`
                    }
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
