/**
 * 002_optimize_execution_indexes.js
 *
 * Explicit database migration for Execution and ExecutionAttempt indexes.
 *
 * 1. Executions collection:
 *    - Creates compound index { userId: 1, createdAt: -1 } (name: "idx_execution_user_created")
 *      to optimize default reverse-chronological inbox queries and eliminate in-memory sorting.
 *    - Verifies key order and existence.
 *
 * 2. ExecutionAttempts collection:
 *    - Verifies the compound index { executionId: 1, attemptNumber: 1 } exists as the replacement prefix.
 *    - Safely drops the redundant standalone single-key index { executionId: 1 } ("executionId_1").
 *
 * Safe to rerun idempotently without destructive data changes.
 * Preserves all unrelated indexes, unique constraints, and documents.
 */

const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/runnel";

async function runMigration(existingConnection = null) {
  const isExternalConn = Boolean(existingConnection);
  const conn = isExternalConn ? existingConnection : mongoose.connection;

  if (!isExternalConn) {
    console.log(`[Migration 002] Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log("[Migration 002] Connected successfully.");
  }

  try {
    // ── 1. Executions Collection ─────────────────────────────────────
    console.log("[Migration 002] Checking 'executions' collection...");
    const executionsColl = conn.collection("executions");
    const execIndexes = await executionsColl.indexes().catch(() => []);
    const execIndexNames = execIndexes.map((i) => i.name);
    console.log("[Migration 002] Existing 'executions' indexes:", execIndexNames);

    // Look for existing { userId: 1, createdAt: -1 } index
    const hasUserCreatedIndex = execIndexes.some(
      (idx) =>
        idx.key &&
        idx.key.userId === 1 &&
        idx.key.createdAt === -1 &&
        Object.keys(idx.key).length === 2
    );

    if (!hasUserCreatedIndex) {
      console.log("[Migration 002] Creating compound index 'idx_execution_user_created' { userId: 1, createdAt: -1 }...");
      await executionsColl.createIndex(
        { userId: 1, createdAt: -1 },
        { name: "idx_execution_user_created", background: true }
      );
      console.log("[Migration 002] Successfully created 'idx_execution_user_created'.");
    } else {
      console.log("[Migration 002] 'idx_execution_user_created' already exists (no change needed).");
    }

    // Verify the new index exists with correct key order
    const updatedExecIndexes = await executionsColl.indexes();
    const verifiedExecIndex = updatedExecIndexes.find(
      (idx) =>
        idx.key &&
        idx.key.userId === 1 &&
        idx.key.createdAt === -1 &&
        Object.keys(idx.key).length === 2
    );
    if (!verifiedExecIndex) {
      throw new Error("Verification failed: idx_execution_user_created not found after creation");
    }
    console.log(`[Migration 002] Verified 'executions' index '${verifiedExecIndex.name}':`, JSON.stringify(verifiedExecIndex.key));

    // ── 2. ExecutionAttempts Collection ──────────────────────────────
    console.log("[Migration 002] Checking 'executionattempts' collection...");
    const attemptsColl = conn.collection("executionattempts");
    const attemptIndexes = await attemptsColl.indexes().catch(() => []);
    const attemptIndexNames = attemptIndexes.map((i) => i.name);
    console.log("[Migration 002] Existing 'executionattempts' indexes:", attemptIndexNames);

    // Verify the compound replacement index { executionId: 1, attemptNumber: 1 } exists
    const hasCompoundAttemptIndex = attemptIndexes.some(
      (idx) =>
        idx.key &&
        idx.key.executionId === 1 &&
        idx.key.attemptNumber === 1 &&
        Object.keys(idx.key).length === 2
    );

    if (!hasCompoundAttemptIndex) {
      console.log("[Migration 002] Compound index { executionId: 1, attemptNumber: 1 } not yet present. Ensuring it exists first...");
      await attemptsColl.createIndex(
        { executionId: 1, attemptNumber: 1 },
        { name: "idx_attempt_exec_number", background: true }
      );
      console.log("[Migration 002] Created 'idx_attempt_exec_number'.");
    } else {
      console.log("[Migration 002] Verified compound index 'idx_attempt_exec_number' exists.");
    }

    // Identify standalone redundant executionId index
    const redundantExecIdIndex = attemptIndexes.find(
      (idx) =>
        idx.key &&
        idx.key.executionId === 1 &&
        Object.keys(idx.key).length === 1 &&
        !idx.unique &&
        !idx.partialFilterExpression
    );

    if (redundantExecIdIndex) {
      console.log(`[Migration 002] Found redundant standalone index '${redundantExecIdIndex.name}'. Dropping safely...`);
      await attemptsColl.dropIndex(redundantExecIdIndex.name);
      console.log(`[Migration 002] Successfully dropped redundant index '${redundantExecIdIndex.name}'.`);
    } else {
      console.log("[Migration 002] No redundant standalone executionId index found (already clean).");
    }

    // Verify the final state of executionattempts indexes
    const updatedAttemptIndexes = await attemptsColl.indexes();
    console.log("[Migration 002] Final 'executionattempts' indexes:", updatedAttemptIndexes.map((i) => i.name));

    console.log("[Migration 002] Migration 002_optimize_execution_indexes completed successfully.");
    return { success: true };
  } finally {
    if (!isExternalConn) {
      await mongoose.disconnect();
      console.log("[Migration 002] MongoDB connection closed.");
    }
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Migration 002] Migration failed:", err);
      process.exit(1);
    });
}

module.exports = runMigration;
