import fs from 'fs-extra'

(async () => {
  await fs.rm('assets/node_modules', { force: true, recursive: true })

  // Copy node modules to assets directory
  // so the extension can resolve the packages at runtime
  ;[
    'spellchecker',
    'any-promise',
    'nan',
  ].map(async (name) => {
    await fs.copy(
      `node_modules/${name}/`,
      `assets/node_modules/${name}/`,
      { dereference: true },
    )
  })
})()
