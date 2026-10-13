const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { setupTestDb, teardownTestDb, clearTestDb } = require("../helpers/testSetup");
const Execution = require("../../models/Execution");
const ExecutionAttempt = require("../../models/ExecutionAttempt");
const runMigration002 = require("../../scripts/migrations/002_optimize_execution_indexes");

test.describe("Migration 002: Index Optimization", () => {
  test.before(async () => {
    await setupTestDb();
  });

  test.after(async () => {
    await teardownTestDb();
  });

  test.beforeEach(async () => {
    await clearTestDb();
  });

  test("should create idx_execution_user_created and drop redundant executionId_1 index", async () => {
    const execColl = mongoose.connection.collection("executions");
    const attemptsColl = mongoose.connection.collection("executionattempts");

    // Simulate pre-migration state:
    // Standalone executionId_1 on executionattempts
    await attemptsColl.createIndex({ executionId: 1 }, { name: "executionId_1" });
    await attemptsColl.createIndex({ executionId: 1, attemptNumber: 1 }, { name: "idx_attempt_exec_number" });

    // Verify pre-migration state
    let attemptIndexes = await attemptsColl.indexes();
    assert.equal(attemptIndexes.some((i) => i.name === "executionId_1"), true);
    assert.equal(attemptIndexes.some((i) => i.name === "idx_attempt_exec_number"), true);

    // Run migration
    const result = await runMigration002(mongoose.connection);
    assert.equal(result.success, true);

    // Verify executions index
    const execIndexes = await execColl.indexes();
    const userCreatedIndex = execIndexes.find(
      (idx) => idx.key && idx.key.userId === 1 && idx.key.createdAt === -1
    );
    assert.ok(userCreatedIndex, "Expected idx_execution_user_created to exist");

    // Verify executionattempts index
    attemptIndexes = await attemptsColl.indexes();
    assert.equal(attemptIndexes.some((i) => i.name === "executionId_1"), false, "executionId_1 should be dropped");
    assert.equal(attemptIndexes.some((i) => i.name === "idx_attempt_exec_number"), true, "idx_attempt_exec_number should remain");
  });

  test("should be safe to rerun idempotently without error", async () => {
    // First run
    const result1 = await runMigration002(mongoose.connection);
    assert.equal(result1.success, true);

    // Second run
    const result2 = await runMigration002(mongoose.connection);
    assert.equal(result2.success, true);

    // Third run
    const result3 = await runMigration002(mongoose.connection);
    assert.equal(result3.success, true);
  });

  test("should support query patterns on Execution and ExecutionAttempt using the new index layout", async () => {
    await runMigration002(mongoose.connection);

    const userId = new mongoose.Types.ObjectId();
    const exec = await Execution.create({
      userId,
      name: "Index query test",
      type: "echo",
      status: "completed",
    });

    const attempt = await ExecutionAttempt.create({
      executionId: exec._id,
      userId,
      attemptNumber: 1,
      status: "completed",
      durationMs: 42,
    });

    // Verify execution query
    const foundExecs = await Execution.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    assert.equal(foundExecs.length, 1);
    assert.equal(foundExecs[0]._id.toString(), exec._id.toString());

    // Verify attempt query with sort
    const foundAttempts = await ExecutionAttempt.find({ executionId: exec._id })
      .sort({ attemptNumber: 1 })
      .lean();
    assert.equal(foundAttempts.length, 1);
    assert.equal(foundAttempts[0]._id.toString(), attempt._id.toString());

    // Verify attempt query count
    const attemptCount = await ExecutionAttempt.countDocuments({ executionId: exec._id });
    assert.equal(attemptCount, 1);
  });
});
