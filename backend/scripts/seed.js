/**
 * seed.js — Development User Seed Fixture
 *
 * NOTE: This is a local development fixture script, NOT a database migration.
 * Migrations are maintained under `backend/scripts/migrations/`.
 *
 * Seeds baseline 'admin' and 'testuser' accounts for local development.
 * Never run this script against a production database.
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const User = require("../models/User");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/runnel";

async function seed() {
  if (process.env.NODE_ENV === "production") {
    console.error("ERROR: Seeding default development users is strictly prohibited in production.");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log(`Connected to development database at ${MONGO_URI}`);

  await User.deleteMany({ username: { $in: ["admin", "testuser"] } });

  const bcrypt = require("bcryptjs");
  const hashedAdmin = await bcrypt.hash("Admin123!", 12);
  const hashedUser = await bcrypt.hash("User123!", 12);

  await User.create([
    { username: "admin", password: hashedAdmin, role: "admin" },
    { username: "testuser", password: hashedUser, role: "user" },
  ]);

  console.log("Seeded development users:");
  console.log("  admin / Admin123! (role: admin)");
  console.log("  testuser / User123! (role: user)");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});