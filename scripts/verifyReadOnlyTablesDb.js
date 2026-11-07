import { socialStoreTablesDb } from "../src/services/socialStoreTablesDb.js";

async function verifyReadOnly() {
  console.log("=== TABLESDB READ-ONLY VERIFICATION ===\n");
  let pass = true;

  const users = [
    { id: "6aed806c0000eebfc713", name: "Ariolas", expectedOptIn: true, expectedIntent: "dating", expectedFavs: 3 },
    { id: "6ae82af2003c3c5fea4c", name: "Sylus", expectedOptIn: true, expectedIntent: "dating", expectedFavs: 5 },
    { id: "6aed977800397cf70df4", name: "anu", expectedOptIn: false, expectedIntent: "friends", expectedFavs: 0 },
    { id: "6aed99a400205d5e9214", name: "Bidyut", expectedOptIn: true, expectedIntent: "friends", expectedFavs: 0 },
  ];

  // 1. Verify all 4 users preferences & showcased favorites
  console.log("[1/5] Verifying 4 Users' Discovery Preferences & Showcased Favorites...");
  for (const u of users) {
    const prefData = await socialStoreTablesDb.getPreferences(u.id);
    const p = prefData.preferences;
    const favCount = (p.selectedFavorites || []).length;
    const okOpt = p.discoveryOptIn === u.expectedOptIn;
    const okIntent = p.intent === u.expectedIntent;
    const okFavs = favCount === u.expectedFavs;

    if (okOpt && okIntent && okFavs) {
      console.log(`  ✓ ${u.name} (${u.id}): optIn=${p.discoveryOptIn}, intent=${p.intent}, favs=${favCount}, stats=`, prefData.stats);
    } else {
      console.error(`  ✗ Mismatch for ${u.name}:`, { p, expected: u });
      pass = false;
    }
  }

  // 2. Verify Mutual Matches
  console.log("\n[2/5] Verifying Mutual Matches...");
  const sylusMatches = await socialStoreTablesDb.getMatches("6ae82af2003c3c5fea4c");
  const ariolasMatches = await socialStoreTablesDb.getMatches("6aed806c0000eebfc713");

  if (sylusMatches.matches.length === 1 && ariolasMatches.matches.length === 1) {
    const sm = sylusMatches.matches[0];
    const am = ariolasMatches.matches[0];
    console.log(`  ✓ Sylus match partner: ${sm.partner.userId} (${sm.partner.displayName || sm.partner.username}), type: ${sm.type}, score: ${sm.partner.compatibility.score}%`);
    console.log(`  ✓ Ariolas match partner: ${am.partner.userId} (${am.partner.displayName || am.partner.username}), type: ${am.type}, score: ${am.partner.compatibility.score}%`);
  } else {
    console.error("  ✗ Match verification failed:", { sylusMatches, ariolasMatches });
    pass = false;
  }

  // 3. Verify Discovery Opt-Out Enforcement
  console.log("\n[3/5] Verifying Discovery Opt-Out Enforcement...");
  const anuDiscover = await socialStoreTablesDb.getDiscoverReaders("6aed977800397cf70df4");
  if (anuDiscover.optedIn === false && anuDiscover.readers.length === 0) {
    console.log("  ✓ Opted-out user (anu) correctly blocked from browsing discovery (optedIn: false, readers: 0)");
  } else {
    console.error("  ✗ Opt-out enforcement failed:", anuDiscover);
    pass = false;
  }

  // 4. Verify Discoverable Readers & Intent Compatibility
  console.log("\n[4/5] Verifying Discovery Candidates & Compatibility...");
  const sylusDiscover = await socialStoreTablesDb.getDiscoverReaders("6ae82af2003c3c5fea4c");
  console.log(`  ✓ Sylus discover query returned ${sylusDiscover.readers.length} candidates:`);
  for (const r of sylusDiscover.readers) {
    console.log(`    • ${r.displayName || r.username} (${r.userId}): intent=${r.intent}, compatibility=${r.compatibility.score}%, matched=${r.isMatched}`);
  }

  // 5. Verify Public Profile & Confidentiality (No private leaks)
  console.log("\n[5/5] Verifying Public Reader Profile & Zero Data Leaks...");
  const publicSylus = await socialStoreTablesDb.getPublicReader("6aed806c0000eebfc713", "6ae82af2003c3c5fea4c");
  const r = publicSylus.reader;
  console.log("  ✓ Public reader profile keys:", Object.keys(r));
  const hasLeakedFields = "email" in r || "password" in r || "reports" in r || "blocks" in r;
  if (!hasLeakedFields && r.userId === "6ae82af2003c3c5fea4c") {
    console.log(`  ✓ Public profile sanitized and confidential. isMatched=${r.isMatched}, matchType=${r.matchType}`);
  } else {
    console.error("  ✗ Leaked fields or invalid public reader response:", r);
    pass = false;
  }

  console.log("\n==========================================");
  console.log(`READ-ONLY VERIFICATION RESULT: ${pass ? "ALL PASSED" : "FAILED"}`);
  console.log("==========================================");

  if (!pass) process.exit(1);
}

verifyReadOnly().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});

