import fs from "fs";
import path from "path";
import { Client, TablesDB } from "node-appwrite";
import { makeRowId, getCanonicalPair } from "../src/services/socialStoreCommon.js";

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

const TABLES = {
  PREFERENCES: "social_preferences",
  FAVORITES: "social_showcased_favorites",
  INTERESTS: "social_interests",
  MATCHES: "social_matches",
  BLOCKS: "social_blocks",
  REPORTS: "social_reports",
};

const SOCIAL_STORE_PATH = path.resolve("./data/social_discovery.json");
const BACKUP_DIR = path.resolve("./data/backups");

const isApply = process.argv.includes("--apply");
const isDryRun = process.argv.includes("--dry-run") || !isApply;

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const tablesDb = new TablesDB(client);

async function runMigration() {
  console.log("=================================================");
  console.log(`LIBSQUE SOCIAL -> TABLESDB MIGRATION (${isDryRun ? "DRY-RUN MODE (READ-ONLY)" : "LIVE APPLY MODE"})`);
  console.log("=================================================\n");

  if (!fs.existsSync(SOCIAL_STORE_PATH)) {
    console.error(`Error: Source JSON file not found at ${SOCIAL_STORE_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(SOCIAL_STORE_PATH, "utf8");
  const data = JSON.parse(raw);

  const preferences = data.preferences || {};
  const interests = data.interests || {};
  const matches = data.matches || {};
  const blocks = data.blocks || {};
  const reports = Array.isArray(data.reports) ? data.reports : [];

  // 1. Validate & Plan Preferences and Showcased Favorites
  const prefRows = [];
  const favRows = [];
  for (const [userId, p] of Object.entries(preferences)) {
    if (!userId || typeof userId !== "string") {
      throw new Error(`Invalid userId in preferences: ${userId}`);
    }
    const validIntent = ["friends", "dating", "both"].includes(p.intent) ? p.intent : "friends";
    const updatedAt = p.updatedAt || new Date().toISOString();
    const adultConfirmed = Boolean(p.adultConfirmed);
    const adultConfirmedAt = p.adultConfirmedAt || (adultConfirmed ? updatedAt : null);

    prefRows.push({
      rowId: userId,
      data: {
        userId,
        discoveryOptIn: Boolean(p.discoveryOptIn),
        intent: validIntent,
        adultConfirmed,
        adultConfirmedAt,
        updatedAt,
      },
      displayName: p.displayName || "",
      username: p.username || "",
    });

    const favs = Array.isArray(p.selectedFavorites) ? p.selectedFavorites.slice(0, 5) : [];
    for (let idx = 0; idx < favs.length; idx++) {
      const f = favs[idx];
      const bookId = String(f.id || f.bookId || "").slice(0, 100);
      if (!bookId) continue;
      favRows.push({
        rowId: makeRowId("fav", userId, bookId),
        data: {
          userId,
          bookId,
          title: String(f.title || "").slice(0, 200),
          author: String(f.author || "").slice(0, 100),
          coverId: f.coverId ? Number(f.coverId) : null,
          order: idx,
        },
      });
    }
  }

  // 2. Validate & Plan Interests
  const intRows = [];
  for (const [k, i] of Object.entries(interests)) {
    const senderId = i.senderId;
    const targetUserId = i.targetUserId;
    if (!senderId || !targetUserId) {
      console.warn(`Skipping invalid interest entry: ${k}`);
      continue;
    }
    const intent = i.intent === "dating" ? "dating" : "friends";
    const createdAt = i.createdAt || new Date().toISOString();
    intRows.push({
      rowId: makeRowId("int", senderId, targetUserId, intent),
      data: {
        senderId,
        targetUserId,
        intent,
        createdAt,
      },
    });
  }

  // 3. Validate & Plan Matches
  const matchRows = [];
  for (const [k, m] of Object.entries(matches)) {
    const { u1, u2 } = getCanonicalPair(m.user1Id, m.user2Id);
    if (!u1 || !u2) {
      console.warn(`Skipping invalid match entry: ${k}`);
      continue;
    }
    const type = m.type === "dating" ? "dating" : "friends";
    const matchedAt = m.matchedAt || new Date().toISOString();
    matchRows.push({
      rowId: makeRowId("match", u1, u2, type),
      data: {
        user1Id: u1,
        user2Id: u2,
        type,
        matchedAt,
      },
    });
  }

  // 4. Validate & Plan Blocks
  const blockRows = [];
  for (const [k, b] of Object.entries(blocks)) {
    if (!b.blockerId || !b.blockedId) {
      console.warn(`Skipping invalid block entry: ${k}`);
      continue;
    }
    blockRows.push({
      rowId: makeRowId("block", b.blockerId, b.blockedId),
      data: {
        blockerId: b.blockerId,
        blockedId: b.blockedId,
        createdAt: b.createdAt || new Date().toISOString(),
      },
    });
  }

  // 5. Validate & Plan Reports
  const reportRows = [];
  for (const r of reports) {
    if (!r.reporterId || !r.reportedUserId) {
      console.warn(`Skipping invalid report: ${r.id}`);
      continue;
    }
    const createdAt = r.createdAt || new Date().toISOString();
    reportRows.push({
      rowId: makeRowId("rep", r.reporterId, r.reportedUserId, String(r.id || createdAt)),
      data: {
        reporterId: r.reporterId,
        reportedUserId: r.reportedUserId,
        reason: r.reason || "other",
        details: String(r.details || "").slice(0, 1000),
        status: r.status || "pending",
        createdAt,
      },
    });
  }

  // Reconciliation summary
  console.log("SOURCE RECORD RECONCILIATION SUMMARY:");
  console.log(`- Preferences to migrate:        ${prefRows.length}`);
  for (const p of prefRows) {
    console.log(`    • User [${p.rowId}] (${p.displayName || p.username || "Anonymous"}): optIn=${p.data.discoveryOptIn}, intent=${p.data.intent}, adult=${p.data.adultConfirmed}`);
  }
  console.log(`- Showcased Favorites to migrate: ${favRows.length}`);
  for (const f of favRows) {
    console.log(`    • Fav [${f.rowId}] User ${f.data.userId}: "${f.data.title}" by ${f.data.author} (order: ${f.data.order})`);
  }
  console.log(`- Interests to migrate:          ${intRows.length}`);
  for (const i of intRows) {
    console.log(`    • Int [${i.rowId}]: ${i.data.senderId} -> ${i.data.targetUserId} (${i.data.intent})`);
  }
  console.log(`- Matches to migrate:            ${matchRows.length}`);
  for (const m of matchRows) {
    console.log(`    • Match [${m.rowId}]: ${m.data.user1Id} <-> ${m.data.user2Id} (${m.data.type})`);
  }
  console.log(`- Blocks to migrate:             ${blockRows.length}`);
  console.log(`- Reports to migrate:            ${reportRows.length}`);
  console.log(`-------------------------------------------------`);
  console.log(`TOTAL ROWS TO MIGRATE:           ${prefRows.length + favRows.length + intRows.length + matchRows.length + blockRows.length + reportRows.length}`);
  console.log("-------------------------------------------------\n");

  // Check existing rows in TablesDB
  const currentDbStats = await Promise.all([
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.PREFERENCES }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.FAVORITES }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.INTERESTS }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.MATCHES }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.BLOCKS }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.REPORTS }),
  ]);

  console.log("CURRENT DESTINATION (TABLESDB) STATE:");
  console.log(`- social_preferences:            ${currentDbStats[0].total} rows`);
  console.log(`- social_showcased_favorites:    ${currentDbStats[1].total} rows`);
  console.log(`- social_interests:              ${currentDbStats[2].total} rows`);
  console.log(`- social_matches:                ${currentDbStats[3].total} rows`);
  console.log(`- social_blocks:                 ${currentDbStats[4].total} rows`);
  console.log(`- social_reports:                ${currentDbStats[5].total} rows\n`);

  // Target Key User Verification: Ariolas & Sylus
  const ariolasId = "6aed806c0000eebfc713";
  const sylusId = "6ae82af2003c3c5fea4c";
  const ariolasPref = prefRows.find((p) => p.rowId === ariolasId);
  const sylusPref = prefRows.find((p) => p.rowId === sylusId);
  const sylusFavs = favRows.filter((f) => f.data.userId === sylusId);
  const ariolasFavs = favRows.filter((f) => f.data.userId === ariolasId);

  console.log("CRITICAL USER VERIFICATION:");
  console.log(`- Ariolas (${ariolasId}): ${ariolasPref ? "FOUND (optIn=" + ariolasPref.data.discoveryOptIn + ", intent=" + ariolasPref.data.intent + ", favs=" + ariolasFavs.length + ")" : "MISSING!"}`);
  console.log(`- Sylus (${sylusId}): ${sylusPref ? "FOUND (optIn=" + sylusPref.data.discoveryOptIn + ", intent=" + sylusPref.data.intent + ", favs=" + sylusFavs.length + ")" : "MISSING!"}`);

  if (isDryRun) {
    console.log("\n=================================================");
    console.log("DRY-RUN COMPLETED SUCCESSFULLY.");
    console.log("No data was written to Appwrite TablesDB.");
    console.log("To execute live migration, pass: --apply");
    console.log("=================================================");
    return;
  }

  // --- LIVE APPLY ---
  console.log("\n>>> INITIATING LIVE APPLY MIGRATION <<<");

  // Step 1: Pre-flight snapshot backup
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const backupPath = path.join(BACKUP_DIR, `social_discovery_pre_tablesdb_apply_${Date.now()}.json`);
  fs.copyFileSync(SOCIAL_STORE_PATH, backupPath);
  console.log(`✓ Pre-migration backup saved to: ${backupPath}`);

  // Step 2: Upsert preferences (avoiding overwriting newer records)
  console.log(`Migrating ${prefRows.length} preferences...`);
  for (const p of prefRows) {
    let existing;
    try {
      existing = await tablesDb.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.PREFERENCES,
        rowId: p.rowId,
      });
    } catch {
      existing = null;
    }
    if (existing?.updatedAt && new Date(existing.updatedAt).getTime() > new Date(p.data.updatedAt).getTime()) {
      console.log(`  Skipping newer preference row in DB for ${p.rowId}`);
      continue;
    }
    await tablesDb.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.PREFERENCES,
      rowId: p.rowId,
      data: p.data,
    });
  }
  console.log(`✓ Migrated ${prefRows.length} preferences`);

  // Step 3: Upsert showcased favorites
  console.log(`Migrating ${favRows.length} showcased favorites...`);
  for (const f of favRows) {
    await tablesDb.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.FAVORITES,
      rowId: f.rowId,
      data: f.data,
    });
  }
  console.log(`✓ Migrated ${favRows.length} showcased favorites`);

  // Step 4: Upsert interests (avoiding overwriting newer records)
  console.log(`Migrating ${intRows.length} interests...`);
  for (const i of intRows) {
    let existing;
    try {
      existing = await tablesDb.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.INTERESTS,
        rowId: i.rowId,
      });
    } catch {
      existing = null;
    }
    if (existing?.createdAt && new Date(existing.createdAt).getTime() > new Date(i.data.createdAt).getTime()) {
      console.log(`  Skipping newer interest row in DB for ${i.rowId}`);
      continue;
    }
    await tablesDb.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.INTERESTS,
      rowId: i.rowId,
      data: i.data,
    });
  }
  console.log(`✓ Migrated ${intRows.length} interests`);

  // Step 5: Upsert matches (avoiding overwriting newer records)
  console.log(`Migrating ${matchRows.length} matches...`);
  for (const m of matchRows) {
    let existing;
    try {
      existing = await tablesDb.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        rowId: m.rowId,
      });
    } catch {
      existing = null;
    }
    if (existing?.matchedAt && new Date(existing.matchedAt).getTime() > new Date(m.data.matchedAt).getTime()) {
      console.log(`  Skipping newer match row in DB for ${m.rowId}`);
      continue;
    }
    await tablesDb.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.MATCHES,
      rowId: m.rowId,
      data: m.data,
    });
  }
  console.log(`✓ Migrated ${matchRows.length} matches`);

  // Step 6: Upsert blocks
  if (blockRows.length > 0) {
    for (const b of blockRows) {
      await tablesDb.upsertRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        rowId: b.rowId,
        data: b.data,
      });
    }
  }

  // Step 7: Upsert reports
  if (reportRows.length > 0) {
    for (const r of reportRows) {
      await tablesDb.upsertRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.REPORTS,
        rowId: r.rowId,
        data: r.data,
      });
    }
  }

  // Step 8: Post-migration count verification
  console.log("\nVERIFYING MIGRATED COUNTS IN TABLESDB...");
  const postStats = await Promise.all([
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.PREFERENCES }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.FAVORITES }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.INTERESTS }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.MATCHES }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.BLOCKS }),
    tablesDb.listRows({ databaseId: DATABASE_ID, tableId: TABLES.REPORTS }),
  ]);

  console.log(`- social_preferences:         expected=${prefRows.length}, actual=${postStats[0].total}`);
  console.log(`- social_showcased_favorites: expected=${favRows.length}, actual=${postStats[1].total}`);
  console.log(`- social_interests:           expected=${intRows.length}, actual=${postStats[2].total}`);
  console.log(`- social_matches:             expected=${matchRows.length}, actual=${postStats[3].total}`);
  console.log(`- social_blocks:              expected=${blockRows.length}, actual=${postStats[4].total}`);
  console.log(`- social_reports:             expected=${reportRows.length}, actual=${postStats[5].total}`);

  console.log("\n=================================================");
  console.log("LIVE APPLY MIGRATION COMPLETED SUCCESSFULLY.");
  console.log("=================================================");
}

runMigration().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});

