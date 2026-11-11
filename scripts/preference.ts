import fs from 'node:fs/promises'

(async () => {
  const pkg = JSON.parse(await fs.readFile('./package.json', 'utf-8'))
  const languages = JSON.parse(await fs.readFile('./src/data/languages.json', 'utf-8'))

  const LANGUAGES = 7

  const languageOptions = Object.values(languages).map((lang: any) => {
    return {
      title: lang.name,
      value: lang.code,
    }
  }).slice(1)

  const langs = Array.from({ length: LANGUAGES }, (_, i) => {
    return {
      name: `lang${i + 1}`,
      type: 'dropdown',
      title: `Language ${i + 1}`,
      description: `Language ${i + 1}`,
      data: i === 0
        ? languageOptions
        : [
            {
              title: '-',
              value: 'none',
            },
            ...languageOptions,
          ],
      ...(i === 0
        ? {
            required: true,
            default: 'en',
          }
        : {
            required: false,
            default: 'none',
          }),
    }
  })

  pkg.preferences = [
    {
      name: 'getSystemSelection',
      type: 'checkbox',
      default: true,
      required: true,
      label: 'Read system text selection',
      description: 'Automatically get current text selection and translate',
    },
    {
      name: 'useDeepl',
      type: 'checkbox',
      required: false,
      title: 'Use DeepL API',
      label: 'Enable DeepL API when supported',
      description: 'Use DeepL API for translation when API key is configured',
      default: false,
    },
    {
      name: 'deeplApiKey',
      type: 'password',
      required: false,
      title: 'DeepL API Key',
      description: 'DeepL API Auth Key',
    },
    {
      name: 'deeplPro',
      type: 'checkbox',
      required: false,
      title: 'DeepL Pro Account',
      label: 'Use DeepL Pro endpoint (api.deepl.com)',
      description: 'Enable if using a DeepL Pro API key instead of DeepL Free',
      default: false,
    },
    ...langs,
  ]

  await fs.writeFile('./package.json', `${JSON.stringify(pkg, null, 2)}\n`)
})()
