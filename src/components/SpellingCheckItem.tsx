import type { ReactElement } from 'react'
import { Action, ActionPanel, List } from '@raycast/api'
import { usePromise } from '@raycast/utils'
import { correctSpelling } from '../logic/spellcheck'
import { getDiffSvg } from '../logic/diff'

export function SpellingCheckItem({ text }: { text: string }): ReactElement | null {
  const { data: spellingCheck } = usePromise(
    async (text: string) => {
      const corrected = await correctSpelling(text)
      if (!corrected || corrected === text)
        return
      return corrected
    },
    [text],
  )

  const { data: diffSvg } = usePromise(
    async (from: string, to?: string) => {
      if (!to)
        return
      return await getDiffSvg(from, to)
    },
    [text, spellingCheck],
  )

  let markdown = ''
  const padding = ''
  if (spellingCheck) {
    markdown = `###### ${padding}Did you mean:\n\n${padding}${spellingCheck}`
    if (diffSvg)
      markdown += `\n\n###### ${padding}Diff ![](${diffSvg})`
  }

  if (!spellingCheck)
    return null

  return (
    <List.Item
      key="spelling"
      title={spellingCheck}
      accessories={[{ tag: 'spellcheck' }]}
      detail={<List.Item.Detail markdown={markdown} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy" content={spellingCheck} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  )
}
