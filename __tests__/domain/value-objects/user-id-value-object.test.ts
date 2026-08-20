import { UserId } from '../../../src/domain/user/value-objects/user-id-value-object'

describe('UserIdValue', ()=>{

  test('create a user ID', ()=> {
    const id = UserId.generate()

    expect(id.getValue()).toBeDefined()
    expect(typeof id.getValue()).toBe('string')
  })

  test('create user from a valid UUID', ()=> {
    const uuid  = crypto.randomUUID()
    const id = UserId.from(uuid)

    expect(id.getValue()).toBe(uuid)
  })

})
