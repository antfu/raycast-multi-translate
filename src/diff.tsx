import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import satori from 'satori'
import { diffChars } from 'diff'
import { environment } from '@raycast/api'

const diffCache = new Map<string, Promise<string>>()

export async function getDiffSvg(from: string, to: string): Promise<string> {
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
              data: fs.readFileSync(join(environment.assetsPath, 'RobotoMono-Regular.ttf')),
              weight: 400,
              style: 'normal',
            },
          ],
        },
      )

      const name = Math.random().toString(36).substring(7)
      const dir = os.tmpdir()
      const path = `${dir}/${name}.svg`

      fs.writeFileSync(path, svg, 'utf-8')
      return path
    })())
  }

  return diffCache.get(cacheKey)!
}
