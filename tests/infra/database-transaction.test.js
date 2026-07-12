const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const pgPath = require.resolve("pg");
const databasePath = path.join(__dirname, "../../src/config/database.js");

function loadDatabaseWithClient(client) {
  delete require.cache[databasePath];
  delete require.cache[pgPath];

  require.cache[pgPath] = {
    id: pgPath,
    filename: pgPath,
    loaded: true,
    exports: {
      Pool: function Pool() {
        return {
          connect: async () => client,
          query: async () => ({ rows: [] }),
        };
      },
    },
  };

  return require(databasePath);
}

test("database.transaction commits successful callbacks", async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [] };
    },
    release: () => calls.push("release"),
  };
  const database = loadDatabaseWithClient(client);

  const result = await database.transaction(async (trx) => {
    await trx.query("INSERT test");
    return "ok";
  });

  assert.strictEqual(result, "ok");
  assert.deepStrictEqual(calls, ["BEGIN", "INSERT test", "COMMIT", "release"]);
});

test("database.transaction rolls back failed callbacks", async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      return { rows: [] };
    },
    release: () => calls.push("release"),
  };
  const database = loadDatabaseWithClient(client);

  await assert.rejects(
    database.transaction(async () => {
      throw new Error("boom");
    }),
    /boom/
  );

  assert.deepStrictEqual(calls, ["BEGIN", "ROLLBACK", "release"]);
});
