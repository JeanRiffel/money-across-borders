import { setWorldConstructor, World } from '@cucumber/cucumber'

// Per-scenario state shared between step definitions: the last HTTP
// response (steps assert against it) and whatever request-scoped values
// steps stash along the way (e.g. the email/password used to sign up, so a
// later step can log in with the same credentials).
export class CustomWorld extends World {
  baseUrl!: string
  response?: Response
  responseBody?: any
  context: Record<string, any> = {}
}

setWorldConstructor(CustomWorld)
