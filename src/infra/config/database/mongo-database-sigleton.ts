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
}
