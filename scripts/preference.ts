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
      name: 'provider',
      type: 'dropdown',
      title: 'Translation Provider',
      description: 'Service used to translate text',
      required: false,
      default: 'google',
      data: [
        { title: 'Google Translate', value: 'google' },
        { title: 'DeepL', value: 'deepl' },
      ],
    },
    {
      name: 'deeplApiKey',
      type: 'password',
      title: 'DeepL API Key',
      description: 'Required when the provider is DeepL. Free keys (ending in :fx) and Pro keys are both supported.',
      required: false,
    },
    ...langs,
  ]

  await fs.writeFile('./package.json', JSON.stringify(pkg, null, 2))
})()
