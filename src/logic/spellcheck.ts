import { chmodSync } from 'node:fs'
import { join } from 'node:path'
import { execa } from 'execa'
import { environment } from '@raycast/api'

const filepath = join(environment.assetsPath, 'spellcheck')
// Raycast will copy assets without execute permission
chmodSync(filepath, 0o755)

export async function spellcheck(text: string) {
  // We use a sub process here because Raycast
  // does not support bundling native bindings
  try {
    const result = await execa(filepath, [text])
    return result.stdout
  }
  catch (e) {
    console.error(e)
    return text
  }
}
