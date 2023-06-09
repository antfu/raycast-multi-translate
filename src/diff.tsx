import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import satori from 'satori'
import { diffChars } from 'diff'
import { environment } from '@raycast/api'

const dir = join(os.tmpdir(), 'raycast-multi-translate')
const diffCache = new Map<string, Promise<string>>()
const font = fs.readFile(join(environment.assetsPath, 'RobotoMono-Regular.ttf'))

let init = false

export async function getDiffSvg(from: string, to: string): Promise<string> {
  if (init === false) {
    init = true
    try {
      await fs.rm(dir, { recursive: true, force: true })
    }
    catch (e) {}
  }

  const cacheKey = `${from}=>${to}`

  if (!diffCache.has(cacheKey)) {
    diffCache.set(cacheKey, (async () => {
      const diffs = diffChars(from, to)
      const forgroundColor = 'white' // TODO: based on color mode

      const svg = await satori(
        <div style={{
          color: forgroundColor,
          display: 'flex',
          padding: 0,
          paddingTop: 10,
          margin: 0,
          fontSize: to.length > 15
            ? to.length > 24
              ? 18
              : 35
            : 50,
        }}>
          {diffs
            .filter(diff => diff.value)
            .map((diff, idx) => {
              const color = diff.added
                ? '#7AA874'
                : diff.removed
                  ? '#F96666'
                  : forgroundColor
              const background = diff.added
                ? '#7AA87430'
                : diff.removed
                  ? '#F9666620'
                  : 'transparent'
              return (
              <span
                key={idx}
                style={{
                  color,
                  backgroundColor: background,
                  whiteSpace: 'pre',
                }}
               >{diff.value}</span>
              )
            })}
        </div>,
        {
          width: 520,
          height: 200,
          fonts: [
            {
              name: 'Roboto',
              // TODO:
              data: await font,
              weight: 400,
              style: 'normal',
            },
          ],
        },
      )

      const name = Math.random().toString(36).substring(7)
      await fs.mkdir(dir, { recursive: true })
      const path = `${dir}/${name}.svg`

      await fs.writeFile(path, svg, 'utf-8')
      return path
    })())
  }

  return diffCache.get(cacheKey)!
}
