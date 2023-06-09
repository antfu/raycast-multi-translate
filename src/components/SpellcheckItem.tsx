import type { ReactElement } from 'react'
import { useEffect } from 'react'
import { Action, ActionPanel, Icon, List } from '@raycast/api'
import { usePromise } from '@raycast/utils'
import { spellcheck } from '../logic/spellcheck'
import { getDiffSvg } from '../logic/diff'

export function SpellcheckItem({ text, onMismatch }: { text: string; onMismatch?: Function }): ReactElement | null {
  const { data: result } = usePromise(
    async (text: string) => {
      const corrected = await spellcheck(text)
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
    [text, result],
  )

  useEffect(() => {
    if (result)
      onMismatch?.(result)
  }, [result])

  let markdown = ''
  const padding = ''
  if (result) {
    markdown = `###### ${padding}Did you mean:\n\n${padding}${result}`
    if (diffSvg)
      markdown += `\n\n###### ${padding}Diff ![](${diffSvg})`
  }

  if (!result)
    return null

  return (
    <List.Item
      key="spellcheck"
      id="spellcheck"
      icon={{
        value: Icon.TextInput,
        tooltip: 'Spellcheck',
      }}
      title={result}
      // accessories={[{ tag: { value: 'spell', color: Color.Yellow } }]}
      detail={<List.Item.Detail markdown={markdown} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy" content={result} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  )
}
