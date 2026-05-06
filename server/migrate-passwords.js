/* server/migrate-passwords.js */
const fs = require("fs").promises;
const path = require("path");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const DB_PATH = path.join(__dirname, "data.json");
const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "dsm";
const BCRYPT_SALT_ROUNDS = 10;

async function migrate() {
  console.log("Starting password migration...");

  // 1. Migrate file database if it exists
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const db = JSON.parse(raw);
    if (db && Array.isArray(db.users)) {
      let count = 0;
      for (const user of db.users) {
        if (user.password && !user.password.startsWith("$2a$")) {
          user.password = await bcrypt.hash(String(user.password), BCRYPT_SALT_ROUNDS);
          count++;
        }
      }
      if (count > 0) {
        await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
        console.log(`File DB: Hashed ${count} passwords.`);
      } else {
        console.log("File DB: No passwords needed hashing.");
      }
    }
  } catch (err) {
    console.log("File DB migration skipped (file not found or error).");
  }

  // 2. Migrate MongoDB if configured
  if (MONGODB_URI) {
    try {
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      const db = client.db(MONGODB_DB);
      const col = db.collection("users");
      const users = await col.find({}).toArray();
      
      let count = 0;
      for (const user of users) {
        if (user.password && !user.password.startsWith("$2a$")) {
          const hashed = await bcrypt.hash(String(user.password), BCRYPT_SALT_ROUNDS);
          await col.updateOne({ id: user.id }, { $set: { password: hashed } });
          count++;
        }
      }
      console.log(`MongoDB: Hashed ${count} passwords.`);
      await client.close();
    } catch (err) {
      console.error("MongoDB migration failed:", err.message);
    }
  }

  console.log("Migration complete.");
}

migrate().catch(console.error);
