const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const bullmqConfigPath = path.join(__dirname, "../src/config/bullmq.js");
const queuePath = path.join(
  __dirname,
  "../src/queues/workflowProcessing.queue.js"
);

test("BullMQ connection uses Redis environment configuration", () => {
  const bullmqConfig = fs.readFileSync(bullmqConfigPath, "utf8");

  assert.match(bullmqConfig, /host:\s*env\.redis\.host/);
  assert.match(bullmqConfig, /port:\s*env\.redis\.port/);
  assert.match(bullmqConfig, /bullMQConnection\.password\s*=\s*env\.redis\.password/);
});

test("workflow processing queue defines name and default job options", () => {
  const queue = fs.readFileSync(queuePath, "utf8");

  assert.match(
    queue,
    /WORKFLOW_PROCESSING_QUEUE_NAME\s*=\s*"workflow-processing"/
  );
  assert.match(queue, /new Queue\(WORKFLOW_PROCESSING_QUEUE_NAME/);
  assert.match(queue, /connection:\s*bullMQConnection/);
  assert.match(queue, /removeOnComplete:\s*true/);
  assert.match(queue, /removeOnFail:\s*false/);
});
