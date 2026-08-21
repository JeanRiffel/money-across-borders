import { MongoClient, Db } from "mongodb";
import { DatabaseStrategy } from "../DatabaseStrategy";
import { logger } from "../../../observability/logger";

export class MongoDatabase implements DatabaseStrategy<Db>{
  #client: MongoClient | null = null
   #db: Db | null = null;

  async connect(): Promise<Db> {
    if (!this.#client) {
      this.#client = new MongoClient(String(process.env.MONGO_HOST));
      await this.#client.connect(); // You forgot this call 😉
      this.#db = this.#client.db(process.env.MONGO_DB);
      logger.info("✅ Connected to MongoDB");
    }
    //db is the gateway to the database

    return this.#db!;
  }

  async disconnect(): Promise<void> {
    logger.info("✅ Disconnected to MongoDB")
    return this.#client ? await this.#client.close() : undefined;
  }

  async getDb(): Promise<Db> {
    if (!this.#db) {      
      //throw new Error("Database not connected. Call connect() first.");
      this.#db = await this.connect()
    }
    return this.#db;
  }

}
