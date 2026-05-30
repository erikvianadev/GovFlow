const fs = require("fs");
const path = require("path");

const database = require("../src/config/database");

const seedsDir = path.join(__dirname, "../src/database/seeds");

async function runSeed(filename) {
  const seedPath = path.join(seedsDir, filename);
  const sql = fs.readFileSync(seedPath, "utf8");

  console.log(`Running seed: ${filename}`);

  await database.query("BEGIN");

  try {
    await database.query(sql);
    await database.query("COMMIT");

    console.log(`Seed completed: ${filename}`);
  } catch (error) {
    await database.query("ROLLBACK");
    console.error(`Seed failed: ${filename}`);
    throw error;
  }
}

async function runSeeds() {
  try {
    const seedFiles = fs
      .readdirSync(seedsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (seedFiles.length === 0) {
      console.log("No seed files found.");
      process.exit(0);
    }

    for (const seed of seedFiles) {
      await runSeed(seed);
    }

    console.log("All seeds completed.");
    process.exit(0);
  } catch (error) {
    console.error("Error running seeds:", error);
    process.exit(1);
  }
}

runSeeds();