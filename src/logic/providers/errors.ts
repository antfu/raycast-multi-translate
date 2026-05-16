export class TranslateError extends Error {
  readonly code?: string

  constructor(
    message?: string | Error,
    name?: string,
    code?: string,
  ) {
    const normalizedMessage = message instanceof Error ? message.message : message
    const normalizedName = message instanceof Error ? message.name : undefined

    super(normalizedMessage)

    this.name = name || normalizedName || this.name
    this.code = code
  }
}

export class UnsupportedTargetLanguageError extends TranslateError {
  constructor(readonly language: string) {
    super(
      `DeepL does not support target language: ${language}`,
      'Unsupported language',
      'unsupported-target-language',
    )
  }
}
