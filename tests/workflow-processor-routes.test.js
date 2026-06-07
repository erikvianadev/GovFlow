const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workflowProcessorRoutesPath = path.join(
  __dirname,
  "../src/modules/workflow-processing/workflowProcessor.routes.js"
);
const routesIndexPath = path.join(__dirname, "../src/routes/index.js");

test("workflow processor route is registered for ADMIN and MANAGER", () => {
  const workflowProcessorRoutes = fs.readFileSync(
    workflowProcessorRoutesPath,
    "utf8"
  );
  const routesIndex = fs.readFileSync(routesIndexPath, "utf8");

  assert.match(
    workflowProcessorRoutes,
    /router\.post\(\s*"\/workflow-executions\/:id\/process"/
  );
  assert.match(
    workflowProcessorRoutes,
    /roleMiddleware\(\["ADMIN", "MANAGER"\]\)/
  );
  assert.match(
    routesIndex,
    /router\.use\("\/", workflowProcessorRoutes\);/
  );
});
