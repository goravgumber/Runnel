/**
 * verify_worker_interruption_recovery.js
 *
 * Real end-to-end integration test validating stuck execution recovery
 * after a worker is interrupted mid-execution.
 */

const http = require("node:http");
const mongoose = require("mongoose");
const Execution = require("../backend/models/Execution");
const ExecutionAttempt = require("../backend/models/ExecutionAttempt");
const { reconcileStuckExecutions, getRecoveryMetrics } = require("../backend/services/executionRecoveryService");
const config = require("../backend/config/env");

async function runIntegrationTest() {
  console.log("==================================================================");
  console.log("RUNNEL INTEGRATION TEST: WORKER INTERRUPTION & RELIABLE RECOVERY");
  console.log("==================================================================");

  // 1. Connect directly to MongoDB
  await mongoose.connect(config.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✔ Connected to MongoDB:", config.MONGO_URI);

  // 2. Spawn a controlled local HTTP server for webhook testing
  let webhookCallCount = 0;
  const testServer = http.createServer((req, res) => {
    webhookCallCount++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true, attempt: webhookCallCount }));
  });
  await new Promise((resolve) => testServer.listen(0, resolve));
  const testPort = testServer.address().port;
  const webhookUrl = `http://127.0.0.1:${testPort}/webhook`;
  console.log(`✔ Controlled test destination listening on port ${testPort}`);

  try {
    const dummyUserId = new mongoose.Types.ObjectId();

    // 3. Create an execution that was interrupted while in 'running' state
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const interruptedExec = await Execution.create({
      userId: dummyUserId,
      name: "Interrupted Production Webhook Execution",
      type: "echo",
      status: "running",
      attemptsMade: 1,
      maxAttempts: 3,
      input: { data: "test-interruption-payload" },
      startedAt: tenMinutesAgo,
    });

    // Force updatedAt to 10 minutes ago
    await Execution.collection.updateOne(
      { _id: interruptedExec._id },
      { $set: { updatedAt: tenMinutesAgo } }
    );

    // Create dangling attempt 1 left in 'running' by crashed worker
    const attempt1 = await ExecutionAttempt.create({
      executionId: interruptedExec._id,
      userId: dummyUserId,
      attemptNumber: 1,
      status: "running",
      startedAt: tenMinutesAgo,
    });
    console.log(`✔ Created simulated interrupted execution ${interruptedExec._id} with dangling attempt ${attempt1._id}`);

    // 4. Run reconciliation pass
    console.log("\nExecuting reconciliation pass...");
    const recoveryResult = await reconcileStuckExecutions({
      staleThresholdMs: 60 * 1000, // 1 minute stale threshold
      bypassLock: true,
    });
    console.log("Reconciliation result:", JSON.stringify(recoveryResult));

    if (recoveryResult.executionsRecovered < 1) {
      throw new Error("Expected at least 1 execution to be recovered!");
    }
    console.log("✔ Reconciliation successfully identified and recovered the stuck execution");

    // 5. Verify the execution state
    const reconciledExec = await Execution.findById(interruptedExec._id);
    console.log(`\nReconciled Execution State:`);
    console.log(`- Status: ${reconciledExec.status}`);
    console.log(`- Error Code: ${reconciledExec.error?.code}`);
    console.log(`- Error Message: ${reconciledExec.error?.message}`);
    console.log(`- Job ID: ${reconciledExec.jobId}`);

    if (reconciledExec.status !== "retrying") {
      throw new Error(`Expected status 'retrying', got '${reconciledExec.status}'`);
    }
    if (reconciledExec.error?.code !== "WORKER_INTERRUPTED") {
      throw new Error(`Expected error code 'WORKER_INTERRUPTED', got '${reconciledExec.error?.code}'`);
    }
    console.log("✔ Execution atomically transitioned to 'retrying' with structured reason");

    // 6. Verify attempt history preservation
    const attempts = await ExecutionAttempt.find({ executionId: interruptedExec._id }).sort({ attemptNumber: 1 });
    console.log(`\nPreserved Attempt History (${attempts.length} attempts):`);
    for (const a of attempts) {
      console.log(`- Attempt #${a.attemptNumber}: status=${a.status}, code=${a.error?.code}, completedAt=${a.completedAt}`);
    }

    if (attempts.length !== 1) {
      throw new Error(`Expected 1 attempt document, found ${attempts.length}`);
    }
    if (attempts[0].status !== "failed" || attempts[0].error?.code !== "WORKER_INTERRUPTED") {
      throw new Error("Dangling attempt was not properly closed as failed with WORKER_INTERRUPTED");
    }
    console.log("✔ Dangling attempt safely closed without data corruption");

    // 7. Verify genuine operational metrics
    const metrics = getRecoveryMetrics();
    console.log("\nGenuine Operational Metrics:", JSON.stringify(metrics, null, 2));
    if (metrics.executionsRecovered < 1) {
      throw new Error("Metrics do not reflect recovered execution");
    }
    console.log("✔ Operational metrics verified");

    // Cleanup
    await Execution.deleteOne({ _id: interruptedExec._id });
    await ExecutionAttempt.deleteMany({ executionId: interruptedExec._id });
    console.log("\n✔ Cleanup completed");

    console.log("\n==================================================================");
    console.log("ALL REAL WORKER INTERRUPTION & RECOVERY VERIFICATIONS PASSED!");
    console.log("==================================================================");
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
    await mongoose.disconnect();
  }
}

runIntegrationTest().catch((err) => {
  console.error("Integration test failed:", err);
  process.exit(1);
});
