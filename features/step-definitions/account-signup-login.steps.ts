import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { CustomWorld } from '../support/world'

Given('I have a new account with a random email and password {string}', function (this: CustomWorld, password: string) {
  // A unique email per scenario run: the accounts table has a UNIQUE
  // constraint on email (see 001_init_schema.sql) and this suite writes to
  // a real, non-rolled-back Postgres database, so a fixed fixture email
  // would only work on the first run.
  this.context.email = `cucumber-${randomUUID()}@example.com`
  this.context.password = password
})

When('I sign up with those credentials', async function (this: CustomWorld) {
  await signUp.call(this)
})

When('I log in with those credentials', async function (this: CustomWorld) {
  await logIn.call(this, this.context.password)
})

When('I log in with the wrong password {string}', async function (this: CustomWorld, wrongPassword: string) {
  await logIn.call(this, wrongPassword)
})

Then('the signup response status is {int}', function (this: CustomWorld, expected: number) {
  assert.equal(this.response!.status, expected, JSON.stringify(this.responseBody))
})

Then('the signup response contains the account email', function (this: CustomWorld) {
  assert.equal(this.responseBody.email, this.context.email)
})

Then('the login response status is {int}', function (this: CustomWorld, expected: number) {
  assert.equal(this.response!.status, expected, JSON.stringify(this.responseBody))
})

Then('the login response contains a token', function (this: CustomWorld) {
  assert.ok(this.responseBody.token, 'expected a token in the login response')
})

// CreateAccountController/LoginController both return { statusCode, result }
// from handle(), and the routers do res.status(result.statusCode).json(result)
// — so the JSON body the client actually receives is that whole
// { statusCode, result } envelope, not just `result`.
async function signUp(this: CustomWorld): Promise<void> {
  this.response = await fetch(`${this.baseUrl}/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: this.context.email, password: this.context.password })
  })
  const payload = await this.response.json() as { result: unknown }
  this.responseBody = payload.result
}

async function logIn(this: CustomWorld, password: string): Promise<void> {
  this.response = await fetch(`${this.baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: this.context.email, password })
  })
  const payload = await this.response.json() as { result: unknown }
  this.responseBody = payload.result
}
