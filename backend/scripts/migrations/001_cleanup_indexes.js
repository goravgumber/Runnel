/**
 * 001_cleanup_indexes.js
 *
 * Explicit database migration for User indexes.
 * Safely drops obsolete email_1 unique index if present,
 * ensuring unique username_1 index exists.
 *
 * Safe to rerun idempotently without destructive data changes.
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/runnel";

async function runMigration() {
  console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI);
  console.log("Connected successfully.");

  try {
    const collection = mongoose.connection.collection("users");
    const indexes = await collection.indexes();
    console.log("Current user collection indexes:", indexes.map((i) => i.name));

    const emailIndex = indexes.find((i) => i.name === "email_1");
    if (emailIndex) {
      console.log("Found legacy email_1 index. Dropping safely...");
      await collection.dropIndex("email_1");
      console.log("Successfully dropped legacy email_1 index.");
    } else {
      console.log("No legacy email_1 index found (already clean).");
    }

    const usernameIndex = indexes.find((i) => i.name === "username_1");
    if (!usernameIndex) {
      console.log("Creating unique username_1 index...");
      await collection.createIndex({ username: 1 }, { unique: true, background: true });
      console.log("Created username_1 unique index.");
    } else {
      console.log("Verified username_1 index exists.");
    }

    console.log("Migration 001_cleanup_indexes completed successfully.");
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed.");
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

module.exports = runMigration;
