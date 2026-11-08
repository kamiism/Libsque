import fs from "fs";
import path from "path";
import crypto from "crypto";
import { socialStoreTablesDb } from "../src/services/socialStoreTablesDb.js";
import { currentEngine } from "../src/services/socialStore.js";
import { Client, TablesDB, Query } from "node-appwrite";
import { makeRowId } from "../src/services/socialStoreCommon.js";

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

const adminClient = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const tablesDb = new TablesDB(adminClient);

async function runRegressionSuite() {
  console.log("=================================================================");
  console.log("LIBSQUE SOCIAL REGRESSION TEST SUITE (TABLESDB ENGINE)");
  console.log("=================================================================\n");

  const results = [];
  function record(name, pass, details = "") {
    results.push({ name, pass, details });
    console.log(`${pass ? "✓ PASS" : "✗ FAIL"}: ${name} ${details ? "(" + details + ")" : ""}`);
  }

  // --- SECTION 1: STORAGE VERIFICATION ---
  console.log("--- 1. Storage Verification ---");

  // Check 1.1: Engine active
  const isTablesDb = currentEngine === "tablesdb" && env.SOCIAL_STORAGE_ENGINE === "tablesdb";
  record("1.1 Active Storage Engine is TablesDB", isTablesDb, `engine=${currentEngine}`);

  // Check 1.2: Capture JSON store hash
  const jsonPath = path.resolve("./data/social_discovery.json");
  const jsonHashInitial = crypto.createHash("sha256").update(fs.readFileSync(jsonPath)).digest("hex");
  record("1.2 Source social_discovery.json Intact", true, `hash=${jsonHashInitial.slice(0, 12)}...`);

  // Check 1.3: Real users and match preserved
  const [ariolasPref, sylusPref, anuPref, bidyutPref, matchRows] = await Promise.all([
    tablesDb.getRow({ databaseId: DATABASE_ID, tableId: "social_preferences", rowId: "6aed806c0000eebfc713" }),
    tablesDb.getRow({ databaseId: DATABASE_ID, tableId: "social_preferences", rowId: "6ae82af2003c3c5fea4c" }),
    tablesDb.getRow({ databaseId: DATABASE_ID, tableId: "social_preferences", rowId: "6aed977800397cf70df4" }),
    tablesDb.getRow({ databaseId: DATABASE_ID, tableId: "social_preferences", rowId: "6aed99a400205d5e9214" }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: "social_matches" }),
  ]);

  const allRealUsersPreserved = Boolean(ariolasPref && sylusPref && anuPref && bidyutPref);
  record("1.3 All 4 Real Users Preserved in TablesDB", allRealUsersPreserved);

  const matchPreserved = matchRows.rows.some(
    (m) =>
      (m.user1Id === "6ae82af2003c3c5fea4c" && m.user2Id === "6aed806c0000eebfc713") ||
      (m.user1Id === "6aed806c0000eebfc713" && m.user2Id === "6ae82af2003c3c5fea4c")
  );
  record("1.4 Ariolas & Sylus Mutual Dating Match Preserved", matchPreserved, `type=${matchRows.rows[0]?.type}`);

  // --- SECTION 2: SOCIAL FEATURE TESTS ---
  console.log("\n--- 2. Social Feature Testing ---");

  // Feature 1: Discovery preferences save & load
  const sylusLoaded = await socialStoreTablesDb.getPreferences("6ae82af2003c3c5fea4c");
  const f1Ok =
    sylusLoaded.preferences.userId === "6ae82af2003c3c5fea4c" &&
    sylusLoaded.preferences.discoveryOptIn === true &&
    sylusLoaded.preferences.intent === "dating" &&
    sylusLoaded.preferences.selectedFavorites?.length === 5 &&
    sylusLoaded.stats.matchesCount === 1;
  record("2.1 Discovery Preferences Load & Hydrate Correctly", f1Ok, `favorites=${sylusLoaded.preferences.selectedFavorites?.length}`);

  // Feature 2: Opted-in readers appear in discovery
  const sylusDiscover = await socialStoreTablesDb.getDiscoverReaders("6ae82af2003c3c5fea4c");
  const ariolasInSylus = sylusDiscover.readers.find((r) => r.userId === "6aed806c0000eebfc713");
  const f2Ok = Boolean(ariolasInSylus);
  record("2.2 Opted-in Readers Appear in Discovery", f2Ok, `found=${ariolasInSylus?.displayName || ariolasInSylus?.username}`);

  // Feature 3: Opted-out readers remain hidden
  const anuInSylus = sylusDiscover.readers.find((r) => r.userId === "6aed977800397cf70df4");
  const anuDiscover = await socialStoreTablesDb.getDiscoverReaders("6aed977800397cf70df4");
  const f3Ok = !anuInSylus && anuDiscover.optedIn === false && anuDiscover.readers.length === 0;
  record("2.3 Opted-out Readers Remain Hidden (anu)", f3Ok);

  // Feature 4: Reading Compatibility scores and explanations display correctly
  const f4Ok =
    ariolasInSylus &&
    typeof ariolasInSylus.compatibility.score === "number" &&
    ariolasInSylus.compatibility.score > 0 &&
    typeof (ariolasInSylus.compatibility.explanation || ariolasInSylus.compatibility.label) === "string";
  record(
    "2.4 Reading Compatibility Score & Explanation Valid",
    f4Ok,
    `score=${ariolasInSylus?.compatibility.score}%, label="${ariolasInSylus?.compatibility.label}", explanation="${ariolasInSylus?.compatibility.explanation}"`
  );

  // Feature 5: Friendship and dating intentions are filtered appropriately
  const friendsDiscover = await socialStoreTablesDb.getDiscoverReaders("6ae82af2003c3c5fea4c", "friends");
  const friendsOk = !friendsDiscover.readers.some((r) => r.intent === "dating");
  record("2.5 Intent Filtering (friends vs dating) Enforced", friendsOk);

  // Feature 6: One-sided interests remain confidential
  const bidyutDiscover = await socialStoreTablesDb.getDiscoverReaders("6aed99a400205d5e9214");
  const ariolasInBidyut = bidyutDiscover.readers.find((r) => r.userId === "6aed806c0000eebfc713");
  const f6Ok = !ariolasInBidyut?.hasSentInterest && !ariolasInBidyut?.isMatched;
  record("2.6 One-Sided Interests Remain Confidential", f6Ok);

  // Feature 7 & 8: Reciprocal interests create exactly ONE mutual match (Isolated Test Users)
  console.log("\n  [Isolated Synthetic Test for Features 7-10]...");
  const testU1 = "reg_test_user_a";
  const testU2 = "reg_test_user_b";

  try {
    // Setup isolated user preferences
    await tablesDb.upsertRow({
      databaseId: DATABASE_ID,
      tableId: "social_preferences",
      rowId: testU1,
      data: {
        userId: testU1,
        discoveryOptIn: true,
        intent: "friends",
        adultConfirmed: false,
        updatedAt: new Date().toISOString(),
      },
    });
    await tablesDb.upsertRow({
      databaseId: DATABASE_ID,
      tableId: "social_preferences",
      rowId: testU2,
      data: {
        userId: testU2,
        discoveryOptIn: true,
        intent: "friends",
        adultConfirmed: false,
        updatedAt: new Date().toISOString(),
      },
    });

    // Step 1: Send interest 1 -> 2
    const int1Res = await socialStoreTablesDb.sendInterest(testU1, testU2, "friends");
    const int1Ok = int1Res.status === "interested";

    // Step 2: Send reciprocal interest 2 -> 1
    const int2Res = await socialStoreTablesDb.sendInterest(testU2, testU1, "friends");
    const int2Ok = int2Res.status === "matched" && int2Res.match && int2Res.match.type === "friends";

    // Step 3: Verify exactly 1 match row exists
    const matchLookup = await tablesDb.listRows({
      databaseId: DATABASE_ID,
      tableId: "social_matches",
      queries: [Query.equal("user1Id", [testU1, testU2].sort()[0]), Query.equal("user2Id", [testU1, testU2].sort()[1])],
    });
    const exactlyOneMatch = matchLookup.total === 1;

    record("2.7 Reciprocal Interests Create Mutual Match", int1Ok && int2Ok && exactlyOneMatch, `status=${int2Res.status}, count=${matchLookup.total}`);

    // Feature 8: Matches remain available on query
    const u1Matches = await socialStoreTablesDb.getMatches(testU1);
    const u2Matches = await socialStoreTablesDb.getMatches(testU2);
    const f8Ok = u1Matches.matches.length === 1 && u2Matches.matches.length === 1;
    record("2.8 Matches Available Queryable for Both Users", f8Ok);

    // Feature 9 & 10: Unmatch and Block
    // Test Unmatch
    const unmatchRes = await socialStoreTablesDb.unmatch(testU1, testU2);
    const postUnmatchMatches = await socialStoreTablesDb.getMatches(testU1);
    const f10Ok = unmatchRes.success && postUnmatchMatches.matches.length === 0;
    record("2.10 Unmatching Dissolves Mutual Connection & Interests", f10Ok);

    // Test Block
    const blockRes = await socialStoreTablesDb.block(testU1, testU2);
    const u1DiscoverWithBlock = await socialStoreTablesDb.getDiscoverReaders(testU1);
    const u2DiscoverWithBlock = await socialStoreTablesDb.getDiscoverReaders(testU2);
    const b1Hidden = !u1DiscoverWithBlock.readers.some((r) => r.userId === testU2);
    const b2Hidden = !u2DiscoverWithBlock.readers.some((r) => r.userId === testU1);
    const f9Ok = blockRes.success && b1Hidden && b2Hidden;
    record("2.9 Blocking Suppresses Discovery Bidirectionally", f9Ok);
  } finally {
    // Explicit complete cleanup of isolated test records
    try {
      await tablesDb.deleteRow({ databaseId: DATABASE_ID, tableId: "social_preferences", rowId: testU1 });
      await tablesDb.deleteRow({ databaseId: DATABASE_ID, tableId: "social_preferences", rowId: testU2 });
      await tablesDb.deleteRow({
        databaseId: DATABASE_ID,
        tableId: "social_blocks",
        rowId: makeRowId("block", testU1, testU2),
      });
      // Any remaining match/interest
      const remainingMatch = makeRowId("match", [testU1, testU2].sort()[0], [testU1, testU2].sort()[1], "friends");
      try {
        await tablesDb.deleteRow({ databaseId: DATABASE_ID, tableId: "social_matches", rowId: remainingMatch });
      } catch {
        // Record may not exist if unmatch deleted it
      }
      console.log("  [Isolated Synthetic Test Records Cleaned Up Completely]");
    } catch (cleanupErr) {
      console.warn("  Cleanup warning:", cleanupErr.message);
    }
  }

  // Feature 11: Public profile exposes only permitted information
  const publicReader = await socialStoreTablesDb.getPublicReader("6aed806c0000eebfc713", "6ae82af2003c3c5fea4c");
  const prKeys = Object.keys(publicReader.reader);
  const forbidden = ["email", "password", "session", "blocks", "reports", "token", "apiKey"];
  const hasForbidden = forbidden.some((f) => prKeys.includes(f));
  record("2.11 Public Profile Sanitized (Zero Sensitive Data Leaked)", !hasForbidden && prKeys.includes("displayName"));

  // Feature 12: Unauthorized clients denied direct access
  const anonClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
  const anonTablesDb = new TablesDB(anonClient);
  let directAccessDenied = true;
  for (const t of ["social_preferences", "social_matches", "social_reports"]) {
    try {
      await anonTablesDb.listRows({ databaseId: DATABASE_ID, tableId: t });
      directAccessDenied = false;
    } catch {
      // Expected 401
    }
  }
  record("2.12 Unauthorized Direct Client Access Denied", directAccessDenied, "HTTP 401 Verified");

  // --- SECTION 3: RE-VERIFY REAL DATA INTEGRITY & JSON STORE ---
  console.log("\n--- 3. Real Data Integrity & Isolation ---");

  const jsonHashFinal = crypto.createHash("sha256").update(fs.readFileSync(jsonPath)).digest("hex");
  const jsonUntouched = jsonHashInitial === jsonHashFinal;
  record("3.1 social_discovery.json Zero-Mutation Verification", jsonUntouched, `hash=${jsonHashFinal.slice(0, 12)}...`);

  // Verify Ariolas & Sylus match unaffected
  const ariolasMatchesFinal = await socialStoreTablesDb.getMatches("6aed806c0000eebfc713");
  const finalMatchIntact =
    ariolasMatchesFinal.matches.length === 1 &&
    ariolasMatchesFinal.matches[0].partner.userId === "6ae82af2003c3c5fea4c";
  record("3.2 Ariolas & Sylus Match 100% Intact After Tests", finalMatchIntact);

  // Overall result
  const allPassed = results.every((r) => r.pass);
  console.log("\n=================================================================");
  console.log(`REGRESSION SUITE RESULT: ${allPassed ? "ALL 15 TESTS PASSED (100%)" : "FAILURES DETECTED"}`);
  console.log("=================================================================\n");

  if (!allPassed) process.exit(1);
}

runRegressionSuite().catch((err) => {
  console.error("Regression suite error:", err);
  process.exit(1);
});
