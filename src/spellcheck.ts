import { join } from 'node:path'
import { execaNode } from 'execa'
import { environment } from '@raycast/api'

export async function correctSpelling(text: string) {
  // We use a sub process here because Raycast
  // does not support bundling native bindings
  const filepath = join(environment.assetsPath, 'spellcheck.cjs')
  try {
    const result = await execaNode(filepath, [text])
    return result.stdout
  }
  catch (e) {
    console.error(e)
    return text
  }
}
