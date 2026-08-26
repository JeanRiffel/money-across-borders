import { When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { CustomWorld } from '../support/world'

// Regression check for the /docs wiring in server.ts (see
// src/interfaces/http/docs/swagger.ts) — not a validation of the OpenAPI
// spec's content, just that mounting it didn't break.
When('I request the API docs page', async function (this: CustomWorld) {
  this.response = await fetch(`${this.baseUrl}/docs/`)
})

Then('the API docs response status is {int}', function (this: CustomWorld, expected: number) {
  assert.equal(this.response!.status, expected)
})

Then('the API docs response is an HTML page', async function (this: CustomWorld) {
  const contentType = this.response!.headers.get('content-type')
  assert.ok(contentType?.includes('text/html'), `expected an HTML content-type, got ${contentType}`)
})
