import { MongoClient, Db } from "mongodb";
import dotenv from "dotenv";
import { DatabaseStrategy } from "../DatabaseStrategy";
import { logger } from "../../../observability/logger";

// Self-contained on purpose, same rationale as pg.ts/redisClient.ts/
// rabbitmq-connection.ts/kafka-connection.ts.
dotenv.config();

// MONGO_HOST/PORT/USER/PASSWORD/DATABASE, matching the HOST/PORT/USER/
// PASSWORD convention every other service in .env(.example) uses. This
// used to read MONGO_HOST directly as if it were a full connection string
// (`new MongoClient(process.env.MONGO_HOST)`) and MONGO_DB for the database
// name — neither var existed anywhere: .env.example defined MONGO_URI
// instead, and the actual .env this project runs against defines
// MONGO_HOST as a bare hostname (e.g. "localhost") plus MONGO_DATABASE, not
// MONGO_DB. Non-fatal at boot (see server.ts), so this was silently broken
// rather than loudly — same class of bug already fixed for Redis/RabbitMQ.
function buildConnectionUrl(): string {
  const host = process.env.MONGO_HOST || "localhost"
  const port = process.env.MONGO_PORT || "27017"
  const user = process.env.MONGO_USER
  const password = process.env.MONGO_PASSWORD
  const credentials = user && password ? `${user}:${password}@` : ""
  // authSource=admin: MongoDB's own root user (MONGO_INITDB_ROOT_USERNAME)
  // is created in the admin database — omitting this makes auth fail when
  // connecting straight to a different target database, which is exactly
  // what MONGO_DATABASE below points at.
  const authSource = user && password ? "/?authSource=admin" : ""
  return `mongodb://${credentials}${host}:${port}${authSource}`
}

export class MongoDatabase implements DatabaseStrategy<Db>{
  #client: MongoClient | null = null
   #db: Db | null = null;

  async connect(): Promise<Db> {
    if (!this.#client) {
      this.#client = new MongoClient(buildConnectionUrl());
      await this.#client.connect(); // You forgot this call 😉
      this.#db = this.#client.db(process.env.MONGO_DATABASE);
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
