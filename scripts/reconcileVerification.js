import fs from "fs";
import path from "path";
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

async function reconcile() {
  console.log("=== COMPREHENSIVE POST-MIGRATION RECONCILIATION ===\n");

  const frozenJsonPath = path.resolve("./data/social_discovery.json");
  const source = JSON.parse(fs.readFileSync(frozenJsonPath, "utf8"));

  let errors = 0;

  // 1. Reconcile Preferences
  console.log("[1/6] Reconciling Preferences (4 records)...");
  for (const [userId, expected] of Object.entries(source.preferences)) {
    try {
      const row = await tablesDb.getRow({
        databaseId: DATABASE_ID,
        tableId: "social_preferences",
        rowId: userId,
      });

      const optInMatch = Boolean(row.discoveryOptIn) === Boolean(expected.discoveryOptIn);
      const intentMatch = row.intent === expected.intent;
      const adultMatch = Boolean(row.adultConfirmed) === Boolean(expected.adultConfirmed);

      if (optInMatch && intentMatch && adultMatch) {
        console.log(`  ✓ User ${userId}: optIn=${row.discoveryOptIn}, intent=${row.intent}, adult=${row.adultConfirmed} (matches JSON)`);
      } else {
        console.error(`  ✗ Mismatch for user ${userId}:`, { row, expected });
        errors++;
      }
    } catch (err) {
      console.error(`  ✗ Failed to fetch preference row for ${userId}:`, err.message);
      errors++;
    }
  }

  // 2. Reconcile Showcased Favorites
  console.log("\n[2/6] Reconciling Showcased Favorites (8 records)...");
  for (const [userId, p] of Object.entries(source.preferences)) {
    const expectedFavs = p.selectedFavorites || [];
    const res = await tablesDb.listRows({
      databaseId: DATABASE_ID,
      tableId: "social_showcased_favorites",
      queries: [Query.equal("userId", userId), Query.orderAsc("order")],
    });

    if (res.rows.length !== expectedFavs.length) {
      console.error(`  ✗ Favorites count mismatch for user ${userId}: expected ${expectedFavs.length}, got ${res.rows.length}`);
      errors++;
      continue;
    }

    for (let idx = 0; idx < expectedFavs.length; idx++) {
      const ef = expectedFavs[idx];
      const actual = res.rows[idx];
      const matchBook = actual.bookId === (ef.id || ef.bookId);
      const matchTitle = actual.title === ef.title;
      const matchAuthor = actual.author === ef.author;
      const matchCover = Number(actual.coverId) === Number(ef.coverId);

      if (matchBook && matchTitle && matchAuthor && matchCover) {
        console.log(`  ✓ Fav [order ${actual.order}] User ${userId}: "${actual.title}" (matches JSON)`);
      } else {
        console.error(`  ✗ Fav mismatch for user ${userId} at index ${idx}:`, { actual, expected: ef });
        errors++;
      }
    }
  }

  // 3. Reconcile Interests
  console.log("\n[3/6] Reconciling Interests (2 records)...");
  for (const [k, expected] of Object.entries(source.interests)) {
    const res = await tablesDb.listRows({
      databaseId: DATABASE_ID,
      tableId: "social_interests",
      queries: [
        Query.equal("senderId", expected.senderId),
        Query.equal("targetUserId", expected.targetUserId),
        Query.equal("intent", expected.intent),
      ],
    });

    if (res.rows.length === 1) {
      console.log(`  ✓ Interest ${expected.senderId} -> ${expected.targetUserId} (${expected.intent}) verified`);
    } else {
      console.error(`  ✗ Interest not found or duplicate for ${k}`);
      errors++;
    }
  }

  // 4. Reconcile Matches
  console.log("\n[4/6] Reconciling Matches (1 record)...");
  for (const [k, expected] of Object.entries(source.matches)) {
    const sorted = [expected.user1Id, expected.user2Id].sort();
    const res = await tablesDb.listRows({
      databaseId: DATABASE_ID,
      tableId: "social_matches",
      queries: [
        Query.equal("user1Id", sorted[0]),
        Query.equal("user2Id", sorted[1]),
        Query.equal("type", expected.type),
      ],
    });

    if (res.rows.length === 1) {
      console.log(`  ✓ Match ${sorted[0]} <-> ${sorted[1]} (${expected.type}) verified`);
    } else {
      console.error(`  ✗ Match not found for ${k}`);
      errors++;
    }
  }

  // 5. Reconcile Blocks & Reports (both expected 0)
  console.log("\n[5/6] Reconciling Blocks & Reports...");
  const [bRes, rRes] = await Promise.all([
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: "social_blocks" }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: "social_reports" }),
  ]);
  console.log(`  ✓ social_blocks count:  ${bRes.total} (expected 0)`);
  console.log(`  ✓ social_reports count: ${rRes.total} (expected 0)`);
  if (bRes.total !== 0 || rRes.total !== 0) errors++;

  // 6. Verify Preserved Tables are Untouched
  console.log("\n[6/6] Verifying Preserved Tables (profiles & library_entries)...");
  const [profRes, libRes] = await Promise.all([
    tablesDb.listRows({
      databaseId: DATABASE_ID,
      tableId: env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "6ae5c1a80030674e1738",
    }),
    tablesDb.listRows({
      databaseId: DATABASE_ID,
      tableId: env.VITE_APPWRITE_LIBRARY_COLLECTION_ID || "6ae4caeb002c08c44803",
    }),
  ]);
  console.log(`  ✓ profiles total rows:        ${profRes.total} (expected 9, UNTOUCHED)`);
  console.log(`  ✓ library_entries total rows: ${libRes.total} (expected 23, UNTOUCHED)`);

  if (profRes.total !== 9 || libRes.total !== 23) {
    console.error("  ✗ Preserved table row counts changed!");
    errors++;
  }

  console.log("\n=================================================");
  console.log(`RECONCILIATION RESULT: ${errors === 0 ? "100% PARITY CONFIRMED (0 errors)" : "FAILED with " + errors + " errors"}`);
  console.log("=================================================");

  if (errors > 0) process.exit(1);
}

reconcile().catch((err) => {
  console.error("Reconciliation error:", err);
  process.exit(1);
});

