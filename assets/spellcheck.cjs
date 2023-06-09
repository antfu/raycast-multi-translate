/* eslint-disable no-console */
const SpellChecker = require('spellchecker')

const checker = new SpellChecker.Spellchecker()
checker.setSpellcheckerType(SpellChecker.ALWAYS_USE_SYSTEM)

async function correctSpelling(text) {
  const check = await checker.checkSpellingAsync(text)
  const slices = []
  const misspelledIndex = []

  let index = 0
  check
    .forEach(({ start, end }) => {
      if (start !== index) {
        slices.push(text.slice(index, start))
        index = start
      }
      slices.push(text.slice(start, end))
      misspelledIndex.push(slices.length - 1)
      index = end
    })

  if (index < text.length)
    slices.push(text.slice(index))

  const corrected = slices.map((word, idx) => {
    if (misspelledIndex.includes(idx))
      return checker.getCorrectionsForMisspelling(word)[0] || word
    return word
  }).join('')

  return corrected
}

correctSpelling(process.argv[2])
  .then(console.log)
