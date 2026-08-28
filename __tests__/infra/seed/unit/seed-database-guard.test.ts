import { Pool } from 'pg';
import { resetDatabase } from '../../../../src/infra/seed/persistence/seed-database';

describe('resetDatabase production guard', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('refuses to run when NODE_ENV=production, without ever querying the database', async () => {
    process.env.NODE_ENV = 'production';
    const query = jest.fn();
    const fakePool = { query } as unknown as Pool;

    await expect(resetDatabase(fakePool)).rejects.toThrow(/production/i);
    expect(query).not.toHaveBeenCalled();
  });
});
