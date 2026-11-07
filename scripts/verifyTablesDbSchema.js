import fs from "fs";
import { Client, TablesDB, Query } from "node-appwrite";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = env.VITE_APPWRITE_PROJECT_ID || "6ae4933f0012901d41e7";
const DATABASE_ID = env.VITE_APPWRITE_DATABASE_ID || "6ae4cac1000d6937c4d7";
const API_KEY = env.APPWRITE_API_KEY || "";

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const tablesDb = new TablesDB(client);

async function runVerification() {
  console.log("=== LIBSQUE TABLESDB SCHEMA & INDEX VERIFICATION ===\n");
  let passCount = 0;
  let failCount = 0;

  // 1. Verify 6 Tables & Columns
  console.log("[1/4] Verifying 6 Social Tables & Columns...");
  const tableColumnChecks = [
    {
      table: "social_preferences",
      cols: ["userId", "discoveryOptIn", "intent", "adultConfirmed", "adultConfirmedAt", "updatedAt"],
    },
    {
      table: "social_showcased_favorites",
      cols: ["userId", "bookId", "title", "author", "coverId", "order"],
    },
    {
      table: "social_interests",
      cols: ["senderId", "targetUserId", "intent", "createdAt"],
    },
    {
      table: "social_matches",
      cols: ["user1Id", "user2Id", "type", "matchedAt"],
    },
    {
      table: "social_blocks",
      cols: ["blockerId", "blockedId", "createdAt"],
    },
    {
      table: "social_reports",
      cols: ["reporterId", "reportedUserId", "reason", "details", "status", "createdAt"],
    },
  ];

  for (const t of tableColumnChecks) {
    try {
      await tablesDb.listRows({
        databaseId: DATABASE_ID,
        tableId: t.table,
        queries: [Query.select(t.cols), Query.limit(1)],
      });
      console.log(`  ✓ Table '${t.table}' valid (columns: ${t.cols.join(", ")})`);
      passCount++;
    } catch (err) {
      console.error(`  ✗ Table '${t.table}' validation failed:`, err.message);
      failCount++;
    }
  }

  // 2. Verify 9 Indexes
  console.log("\n[2/4] Verifying 9 Indexes via Filtered Queries...");
  const indexChecks = [
    {
      table: "social_preferences",
      name: "idx_pref_discovery",
      queries: [
        Query.equal("discoveryOptIn", true),
        Query.equal("intent", "friends"),
        Query.equal("adultConfirmed", false),
      ],
    },
    {
      table: "social_showcased_favorites",
      name: "idx_showcase_user",
      queries: [Query.equal("userId", "verify_chk_id"), Query.orderAsc("order")],
    },
    {
      table: "social_interests",
      name: "idx_int_target",
      queries: [Query.equal("targetUserId", "verify_chk_id"), Query.equal("intent", "friends")],
    },
    {
      table: "social_interests",
      name: "idx_int_sender",
      queries: [Query.equal("senderId", "verify_chk_id")],
    },
    {
      table: "social_matches",
      name: "idx_match_u1",
      queries: [Query.equal("user1Id", "verify_chk_id")],
    },
    {
      table: "social_matches",
      name: "idx_match_u2",
      queries: [Query.equal("user2Id", "verify_chk_id")],
    },
    {
      table: "social_blocks",
      name: "idx_block_lookup",
      queries: [
        Query.equal("blockerId", "verify_chk_id"),
        Query.equal("blockedId", "verify_chk_id2"),
      ],
    },
    {
      table: "social_blocks",
      name: "idx_block_rev",
      queries: [Query.equal("blockedId", "verify_chk_id")],
    },
    {
      table: "social_reports",
      name: "idx_rep_status",
      queries: [Query.equal("status", "pending"), Query.orderDesc("createdAt")],
    },
  ];

  for (const idx of indexChecks) {
    try {
      await tablesDb.listRows({
        databaseId: DATABASE_ID,
        tableId: idx.table,
        queries: idx.queries,
      });
      console.log(`  ✓ Index '${idx.name}' on '${idx.table}' verified`);
      passCount++;
    } catch (err) {
      console.error(`  ✗ Index '${idx.name}' on '${idx.table}' failed:`, err.message);
      failCount++;
    }
  }

  // 3. Verify Untouched Existing Tables (profiles & library_entries)
  console.log("\n[3/4] Verifying Read Access to Preserved Tables...");
  const preserved = [
    { name: "profiles", id: env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "6ae5c1a80030674e1738" },
    { name: "library_entries", id: env.VITE_APPWRITE_LIBRARY_COLLECTION_ID || "6ae4caeb002c08c44803" },
  ];

  for (const p of preserved) {
    try {
      const res = await tablesDb.listRows({
        databaseId: DATABASE_ID,
        tableId: p.id,
        queries: [Query.limit(1)],
      });
      console.log(`  ✓ Preserved table '${p.name}' (${p.id}) accessible (total rows: ${res.total})`);
      passCount++;
    } catch (err) {
      console.error(`  ✗ Preserved table '${p.name}' check failed:`, err.message);
      failCount++;
    }
  }

  // 4. Verify Transaction Lifecycle (create, test-op, rollback)
  console.log("\n[4/4] Verifying SDK Transaction Support & Rollback...");
  try {
    const tx = await tablesDb.createTransaction({ databaseId: DATABASE_ID, ttl: 60 });
    console.log(`  ✓ Transaction created (ID: ${tx.$id}, status: ${tx.status || "pending"})`);
    await tablesDb.deleteTransaction({ databaseId: DATABASE_ID, transactionId: tx.$id });
    console.log(`  ✓ Transaction successfully rolled back`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ Transaction lifecycle failed:`, err.message);
    failCount++;
  }

  console.log(`\n========================================`);
  console.log(`Total Checks: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runVerification();
