import fs from "fs";
import path from "path";
import { Client, TablesDB, Query } from "node-appwrite";
import { calculateReaderDna } from "../src/utils/readerDna.js";

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
  PROFILES: env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "6ae5c1a80030674e1738",
  LIBRARY: env.VITE_APPWRITE_LIBRARY_COLLECTION_ID || "6ae4caeb002c08c44803",
};

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const tablesDb = new TablesDB(client);

async function listAllRows(tableId) {
  let rows = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await tablesDb.listRows({
      databaseId: DATABASE_ID,
      tableId,
      queries: [Query.limit(limit), Query.offset(offset)],
    });
    rows = rows.concat(res.rows || []);
    if ((res.rows || []).length < limit) break;
    offset += limit;
  }
  return rows;
}

async function exportTablesDb() {
  console.log("=== EXPORTING APPWRITE TABLESDB SOCIAL RECORDS TO JSON ===\n");

  const [prefRows, favRows, intRows, matchRows, blockRows, reportRows, profRows, libRows] =
    await Promise.all([
      listAllRows(TABLES.PREFERENCES),
      listAllRows(TABLES.FAVORITES),
      listAllRows(TABLES.INTERESTS),
      listAllRows(TABLES.MATCHES),
      listAllRows(TABLES.BLOCKS),
      listAllRows(TABLES.REPORTS),
      listAllRows(TABLES.PROFILES),
      listAllRows(TABLES.LIBRARY),
    ]);

  console.log(`Fetched from TablesDB:`);
  console.log(`- Preferences:         ${prefRows.length}`);
  console.log(`- Showcased Favorites: ${favRows.length}`);
  console.log(`- Interests:           ${intRows.length}`);
  console.log(`- Matches:             ${matchRows.length}`);
  console.log(`- Blocks:              ${blockRows.length}`);
  console.log(`- Reports:             ${reportRows.length}`);
  console.log(`- Profiles:            ${profRows.length}`);
  console.log(`- Library Entries:     ${libRows.length}\n`);

  // Index profiles by userId
  const profileMap = new Map();
  for (const p of profRows) {
    if (p.userId) {
      profileMap.set(p.userId, p);
    }
  }

  // Index favorites by userId
  const favsByUser = new Map();
  for (const f of favRows) {
    if (!favsByUser.has(f.userId)) favsByUser.set(f.userId, []);
    favsByUser.get(f.userId).push(f);
  }

  // Index library by userId for readerDna
  const libByUser = new Map();
  for (const l of libRows) {
    if (!libByUser.has(l.userId)) libByUser.set(l.userId, []);
    libByUser.get(l.userId).push(l);
  }

  // Build JSON preferences object
  const preferences = {};
  for (const p of prefRows) {
    const userId = p.userId || p.$id;
    const profile = profileMap.get(userId) || {};
    const userFavs = (favsByUser.get(userId) || [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((f) => ({
        id: f.bookId,
        title: f.title,
        author: f.author || "",
        coverId: f.coverId ? Number(f.coverId) : null,
      }));

    const userLib = libByUser.get(userId) || [];
    const readerDna = userLib.length > 0 ? calculateReaderDna(userLib) : { genres: {}, themes: {} };

    preferences[userId] = {
      userId,
      discoveryOptIn: Boolean(p.discoveryOptIn),
      intent: p.intent || "friends",
      adultConfirmed: Boolean(p.adultConfirmed),
      adultConfirmedAt: p.adultConfirmedAt || null,
      bio: profile.bio || "",
      displayName: profile.displayName || "Reader",
      username: profile.username || "",
      selectedFavorites: userFavs,
      readerDna,
      updatedAt: p.updatedAt || p.$updatedAt || new Date().toISOString(),
    };
  }

  // Build interests object
  const interests = {};
  for (const i of intRows) {
    const key = `${i.senderId}:${i.targetUserId}`;
    interests[key] = {
      id: i.$id,
      senderId: i.senderId,
      targetUserId: i.targetUserId,
      intent: i.intent || "friends",
      createdAt: i.createdAt || i.$createdAt || new Date().toISOString(),
    };
  }

  // Build matches object
  const matches = {};
  for (const m of matchRows) {
    const sorted = [m.user1Id, m.user2Id].sort();
    const key = sorted.join(":");
    matches[key] = {
      id: m.$id,
      user1Id: sorted[0],
      user2Id: sorted[1],
      type: m.type || "friends",
      matchedAt: m.matchedAt || m.$createdAt || new Date().toISOString(),
    };
  }

  // Build blocks object
  const blocks = {};
  for (const b of blockRows) {
    const key = `${b.blockerId}:${b.blockedId}`;
    blocks[key] = {
      blockerId: b.blockerId,
      blockedId: b.blockedId,
      createdAt: b.createdAt || b.$createdAt || new Date().toISOString(),
    };
  }

  // Build reports array
  const reports = reportRows.map((r) => ({
    id: r.$id,
    reporterId: r.reporterId,
    reportedUserId: r.reportedUserId,
    reason: r.reason,
    details: r.details || "",
    status: r.status || "pending",
    createdAt: r.createdAt || r.$createdAt || new Date().toISOString(),
  }));

  const exportPayload = {
    preferences,
    interests,
    matches,
    blocks,
    reports,
  };

  const isReplace = process.argv.includes("--replace");
  const targetPath = isReplace
    ? path.resolve("./data/social_discovery.json")
    : path.resolve("./data/social_discovery_from_tablesdb.json");

  if (isReplace && fs.existsSync(targetPath)) {
    const backupDir = path.resolve("./data/backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `social_discovery_pre_rollback_${Date.now()}.json`);
    fs.copyFileSync(targetPath, backupFile);
    console.log(`Pre-replacement backup saved to: ${backupFile}`);
  }

  fs.writeFileSync(targetPath, JSON.stringify(exportPayload, null, 2), "utf8");
  console.log(`✓ Export completed successfully to: ${targetPath}`);
}

exportTablesDb().catch((err) => {
  console.error("Export error:", err);
  process.exit(1);
});

