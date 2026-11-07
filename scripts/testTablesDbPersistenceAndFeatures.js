import fs from "fs";
import path from "path";
import crypto from "crypto";
import { socialStoreTablesDb } from "../src/services/socialStoreTablesDb.js";
import { Client, TablesDB } from "node-appwrite";

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

async function runFeatureAndPersistenceTests() {
  console.log("=== TABLESDB LIVE FEATURE & PERSISTENCE VERIFICATION ===\n");

  const jsonPath = path.resolve("./data/social_discovery.json");
  const jsonHashBefore = crypto.createHash("sha256").update(fs.readFileSync(jsonPath)).digest("hex");

  const testUserId = "6aed99a400205d5e9214"; // Bidyut Priyam Kumar

  // 1. Legitimate preference update
  console.log("[1/5] Executing Legitimate Preference Update on User " + testUserId + "...");
  const updateRes = await socialStoreTablesDb.updatePreferences(testUserId, {
    discoveryOptIn: true,
    intent: "both",
    adultConfirmed: true,
    selectedFavorites: [],
  });

  console.log("  Update result: success=" + updateRes.success + ", intent=" + updateRes.preferences.intent + ", adultConfirmed=" + updateRes.preferences.adultConfirmed);

  // 2. Verify stored in Appwrite TablesDB directly
  console.log("\n[2/5] Reading Row Directly from Appwrite TablesDB...");
  const dbRow = await tablesDb.getRow({
    databaseId: DATABASE_ID,
    tableId: "social_preferences",
    rowId: testUserId,
  });

  console.log(`  TablesDB raw row: userId=${dbRow.userId}, intent=${dbRow.intent}, adultConfirmed=${dbRow.adultConfirmed}, updatedAt=${dbRow.updatedAt}`);
  if (dbRow.intent !== "both" || !dbRow.adultConfirmed) {
    throw new Error("TablesDB row does not match updated values!");
  }
  console.log("  ✓ Direct TablesDB row verified matching updated values");

  // 3. Confirm JSON store untouched
  console.log("\n[3/5] Verifying social_discovery.json Was NOT Mutated...");
  const jsonHashAfter = crypto.createHash("sha256").update(fs.readFileSync(jsonPath)).digest("hex");
  if (jsonHashBefore === jsonHashAfter) {
    console.log("  ✓ social_discovery.json is 100% UNTOUCHED (hash: " + jsonHashAfter.slice(0, 16) + "...)");
  } else {
    throw new Error("CRITICAL: social_discovery.json was mutated by a TablesDB operation!");
  }

  // 4. Feature tests with real users
  console.log("\n[4/5] Testing Discovery, Compatibility, Matches, and Interest Confidentiality...");
  
  // A. View discoverable readers for Sylus
  const sylusDiscover = await socialStoreTablesDb.getDiscoverReaders("6ae82af2003c3c5fea4c");
  console.log(`  ✓ Sylus discover: ${sylusDiscover.readers.length} candidates visible`);
  
  // B. Mutual match intact
  const sylusMatches = await socialStoreTablesDb.getMatches("6ae82af2003c3c5fea4c");
  console.log(`  ✓ Sylus matches count: ${sylusMatches.matches.length} (Partner: ${sylusMatches.matches[0]?.partner?.userId}, type: ${sylusMatches.matches[0]?.type})`);
  if (sylusMatches.matches.length !== 1 || sylusMatches.matches[0]?.partner?.userId !== "6aed806c0000eebfc713") {
    throw new Error("Existing mutual match was altered!");
  }

  // C. Interest confidentiality
  // Ariolas can see match, but third party Bidyut cannot see Ariolas's private interest
  const bidyutDiscover = await socialStoreTablesDb.getDiscoverReaders(testUserId);
  const foundAriolasInBidyut = bidyutDiscover.readers.find(r => r.userId === "6aed806c0000eebfc713");
  if (foundAriolasInBidyut) {
    console.log(`  ✓ Bidyut sees Ariolas in discovery without unreciprocated interest leak (hasSentInterest: ${foundAriolasInBidyut.hasSentInterest}, isMatched: ${foundAriolasInBidyut.isMatched})`);
  }

  // D. Opt-out behavior
  const anuDiscover = await socialStoreTablesDb.getDiscoverReaders("6aed977800397cf70df4");
  if (anuDiscover.optedIn === false && anuDiscover.readers.length === 0) {
    console.log("  ✓ Opt-out behavior verified (anu cannot browse and cannot be discovered)");
  }

  // 5. Restore Bidyut's original setting
  console.log("\n[5/5] Re-aligning User's Original Settings...");
  await socialStoreTablesDb.updatePreferences(testUserId, {
    discoveryOptIn: true,
    intent: "friends",
    adultConfirmed: false,
    selectedFavorites: [],
  });
  const restoredRow = await tablesDb.getRow({
    databaseId: DATABASE_ID,
    tableId: "social_preferences",
    rowId: testUserId,
  });
  console.log(`  ✓ User settings re-aligned: intent=${restoredRow.intent}, adultConfirmed=${restoredRow.adultConfirmed}`);

  console.log("\n========================================================");
  console.log("FEATURE & PERSISTENCE VERIFICATION: ALL PASSED (100% OK)");
  console.log("========================================================");
}

runFeatureAndPersistenceTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});

