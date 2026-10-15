import { MongoDatabase } from './mongodb/mongo-database';

export class MongoDatabaseSingleton {
  private static instance: MongoDatabase | null = null;

  private constructor() {}

  public static async getInstance(): Promise<MongoDatabase> {
    if (!this.instance) {
      const mongoDatabase = new MongoDatabase();
      await mongoDatabase.connect();
      this.instance = mongoDatabase;
    }
    return this.instance;
  }

  // Closes the client only if getInstance() connected one, so a caller
  // tearing down (e.g. the Cucumber suite) never opens a connection just to
  // close it.
  public static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.disconnect();
      this.instance = null;
    }
  }
}
