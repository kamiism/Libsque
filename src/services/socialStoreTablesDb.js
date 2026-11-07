import { Client, TablesDB, Query } from "node-appwrite";
import { makeRowId, getCanonicalPair } from "./socialStoreCommon.js";
import { calculateLiteraryCompatibility } from "../utils/compatibility.js";
import { calculateReaderDna } from "../utils/readerDna.js";

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID || "6ae4933f0012901d41e7";
const DATABASE_ID = process.env.VITE_APPWRITE_DATABASE_ID || "6ae4cac1000d6937c4d7";
const API_KEY = process.env.APPWRITE_API_KEY || "";

const TABLES = {
  PREFERENCES: process.env.APPWRITE_TABLE_PREFERENCES || "social_preferences",
  FAVORITES: process.env.APPWRITE_TABLE_FAVORITES || "social_showcased_favorites",
  INTERESTS: process.env.APPWRITE_TABLE_INTERESTS || "social_interests",
  MATCHES: process.env.APPWRITE_TABLE_MATCHES || "social_matches",
  BLOCKS: process.env.APPWRITE_TABLE_BLOCKS || "social_blocks",
  REPORTS: process.env.APPWRITE_TABLE_REPORTS || "social_reports",
  PROFILES: process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "6ae5c1a80030674e1738",
  LIBRARY: process.env.VITE_APPWRITE_LIBRARY_COLLECTION_ID || "6ae4caeb002c08c44803",
};

let clientInstance = null;
let tablesDbInstance = null;

function getTablesDb() {
  if (!tablesDbInstance) {
    clientInstance = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setKey(API_KEY);
    tablesDbInstance = new TablesDB(clientInstance);
  }
  return tablesDbInstance;
}

// 1. Fetch user profile from authoritative profiles table
async function fetchUserProfile(userId, fallbackName = "") {
  const db = getTablesDb();
  try {
    const res = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.PROFILES,
      queries: [Query.equal("userId", userId), Query.limit(1)],
    });
    if (res.rows && res.rows.length > 0) {
      const p = res.rows[0];
      return {
        displayName: p.displayName || fallbackName || "Reader",
        username: p.username || "",
        bio: p.bio || "",
      };
    }
  } catch {
    // Ignore error, return fallback
  }
  return {
    displayName: fallbackName || "Reader",
    username: "",
    bio: "",
  };
}

// 2. Fetch showcased favorites from social_showcased_favorites
async function fetchShowcasedFavorites(userId) {
  const db = getTablesDb();
  try {
    const res = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.FAVORITES,
      queries: [Query.equal("userId", userId), Query.orderAsc("order"), Query.limit(5)],
    });
    return (res.rows || []).map((r) => ({
      id: r.bookId,
      title: r.title,
      author: r.author || "",
      coverId: r.coverId ? Number(r.coverId) : null,
    }));
  } catch {
    return [];
  }
}

// 3. Compute Reader DNA from library_entries
async function computeReaderDnaForUser(userId) {
  const db = getTablesDb();
  try {
    const res = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.LIBRARY,
      queries: [Query.equal("userId", userId), Query.limit(100)],
    });
    if (res.rows && res.rows.length > 0) {
      return calculateReaderDna(res.rows);
    }
  } catch {
    // fallback to empty
  }
  return { genres: {}, themes: {} };
}

// 4. Build full preference object combining preferences, profile, favorites, DNA
async function buildFullPreferenceObject(userId, prefRow = null, fallbackName = "") {
  const db = getTablesDb();
  let row = prefRow;
  if (!row) {
    try {
      row = await db.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.PREFERENCES,
        rowId: userId,
      });
    } catch {
      row = null;
    }
  }

  const [profile, favorites, dna] = await Promise.all([
    fetchUserProfile(userId, fallbackName),
    fetchShowcasedFavorites(userId),
    computeReaderDnaForUser(userId),
  ]);

  if (!row) {
    return {
      userId,
      discoveryOptIn: false,
      intent: "friends",
      adultConfirmed: false,
      adultConfirmedAt: null,
      bio: profile.bio,
      displayName: profile.displayName,
      username: profile.username,
      selectedFavorites: favorites,
      readerDna: dna,
      updatedAt: null,
    };
  }

  return {
    userId,
    discoveryOptIn: Boolean(row.discoveryOptIn),
    intent: row.intent || "friends",
    adultConfirmed: Boolean(row.adultConfirmed),
    adultConfirmedAt: row.adultConfirmedAt || null,
    bio: profile.bio,
    displayName: profile.displayName,
    username: profile.username,
    selectedFavorites: favorites,
    readerDna: dna,
    updatedAt: row.updatedAt || row.$updatedAt || null,
  };
}

export const socialStoreTablesDb = {
  // 1. Get preferences and stats
  async getPreferences(userId, userFallbackName = "") {
    const db = getTablesDb();
    const userPref = await buildFullPreferenceObject(userId, null, userFallbackName);

    const [m1Res, m2Res, sentRes, blockRes] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        queries: [Query.equal("user1Id", userId), Query.limit(100)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        queries: [Query.equal("user2Id", userId), Query.limit(100)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.INTERESTS,
        queries: [Query.equal("senderId", userId), Query.limit(100)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        queries: [Query.equal("blockerId", userId), Query.limit(100)],
      }),
    ]);

    const matchesCount = (m1Res.total || 0) + (m2Res.total || 0);
    const sentInterestsCount = sentRes.total || 0;
    const blockedCount = blockRes.total || 0;

    return {
      preferences: userPref,
      stats: {
        matchesCount,
        sentInterestsCount,
        blockedCount,
      },
    };
  },

  // 2. Update preferences
  async updatePreferences(userId, data, userFallbackName = "") {
    const db = getTablesDb();
    const validIntent = ["friends", "dating", "both"].includes(data.intent)
      ? data.intent
      : "friends";

    if ((validIntent === "dating" || validIntent === "both") && !data.adultConfirmed) {
      const err = new Error("Explicit adult certification (18+) is required to enable dating discovery.");
      err.statusCode = 400;
      throw err;
    }

    // Check existing row for adultConfirmedAt
    let existing;
    try {
      existing = await db.getRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.PREFERENCES,
        rowId: userId,
      });
    } catch {
      existing = null;
    }

    const adultConfirmed = Boolean(data.adultConfirmed);
    const adultConfirmedAt =
      adultConfirmed && !existing?.adultConfirmedAt
        ? new Date().toISOString()
        : existing?.adultConfirmedAt || null;
    const nowIso = new Date().toISOString();

    await db.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.PREFERENCES,
      rowId: userId,
      data: {
        userId,
        discoveryOptIn: Boolean(data.discoveryOptIn),
        intent: validIntent,
        adultConfirmed,
        adultConfirmedAt,
        updatedAt: nowIso,
      },
    });

    // Handle showcased favorites
    if (Array.isArray(data.selectedFavorites)) {
      // Fetch existing favorites to remove unused
      try {
        const existingFavs = await db.listRows({
          databaseId: DATABASE_ID,
          tableId: TABLES.FAVORITES,
          queries: [Query.equal("userId", userId), Query.limit(20)],
        });
        const newFavs = data.selectedFavorites.slice(0, 5);
        const newBookIds = new Set(newFavs.map((f) => String(f.id || f.bookId || "").slice(0, 100)));

        for (const ef of existingFavs.rows || []) {
          if (!newBookIds.has(ef.bookId)) {
            try {
              await db.deleteRow({
                databaseId: DATABASE_ID,
                tableId: TABLES.FAVORITES,
                rowId: ef.$id,
              });
            } catch {
              // Ignore individual delete errors
            }
          }
        }

        // Upsert new list
        for (let idx = 0; idx < newFavs.length; idx++) {
          const f = newFavs[idx];
          const bId = String(f.id || f.bookId || "").slice(0, 100);
          if (!bId) continue;
          const favRowId = makeRowId("fav", userId, bId);
          await db.upsertRow({
            databaseId: DATABASE_ID,
            tableId: TABLES.FAVORITES,
            rowId: favRowId,
            data: {
              userId,
              bookId: bId,
              title: String(f.title || "").slice(0, 200),
              author: String(f.author || "").slice(0, 100),
              coverId: f.coverId ? Number(f.coverId) : null,
              order: idx,
            },
          });
        }
      } catch (favErr) {
        console.error("Error updating showcased favorites:", favErr.message);
      }
    }

    const updatedPref = await buildFullPreferenceObject(userId, null, userFallbackName);
    return { success: true, preferences: updatedPref };
  },

  // 3. Discover compatible readers
  async getDiscoverReaders(userId, filterIntent = "all") {
    const db = getTablesDb();
    const userPref = await buildFullPreferenceObject(userId);

    if (!userPref.discoveryOptIn) {
      return {
        optedIn: false,
        message:
          "Reader discovery is currently turned off. Opt in from your settings to browse and connect with compatible readers.",
        readers: [],
      };
    }

    // Get all opted-in readers (up to 100)
    const optInRows = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.PREFERENCES,
      queries: [Query.equal("discoveryOptIn", true), Query.limit(100)],
    });

    const candidateRows = (optInRows.rows || []).filter((r) => r.userId !== userId);
    if (candidateRows.length === 0) {
      return {
        optedIn: true,
        userIntent: userPref.intent,
        adultConfirmed: userPref.adultConfirmed,
        readers: [],
      };
    }

    // Fetch user blocks (outgoing and incoming)
    const [outBlocks, inBlocks] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        queries: [Query.equal("blockerId", userId), Query.limit(100)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        queries: [Query.equal("blockedId", userId), Query.limit(100)],
      }),
    ]);

    const blockedUserIds = new Set([
      ...(outBlocks.rows || []).map((b) => b.blockedId),
      ...(inBlocks.rows || []).map((b) => b.blockerId),
    ]);

    // Filter candidate rows by blocks and intent
    const eligibleCandidateRows = candidateRows.filter((candidate) => {
      if (blockedUserIds.has(candidate.userId)) return false;

      // Intent compatibility
      if (filterIntent === "dating" || userPref.intent === "dating") {
        if (!userPref.adultConfirmed || !candidate.adultConfirmed) return false;
        if (candidate.intent !== "dating" && candidate.intent !== "both") return false;
      } else if (filterIntent === "friends" || userPref.intent === "friends") {
        if (candidate.intent !== "friends" && candidate.intent !== "both") return false;
      } else {
        if (candidate.intent === "dating" && (!userPref.adultConfirmed || !candidate.adultConfirmed)) {
          return false;
        }
      }
      return true;
    });

    if (eligibleCandidateRows.length === 0) {
      return {
        optedIn: true,
        userIntent: userPref.intent,
        adultConfirmed: userPref.adultConfirmed,
        readers: [],
      };
    }

    // Fetch matches & sent interests for userId
    const [m1, m2, sent] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        queries: [Query.equal("user1Id", userId), Query.limit(100)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        queries: [Query.equal("user2Id", userId), Query.limit(100)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.INTERESTS,
        queries: [Query.equal("senderId", userId), Query.limit(100)],
      }),
    ]);

    const matchMap = new Map();
    for (const m of [...(m1.rows || []), ...(m2.rows || [])]) {
      const partnerId = m.user1Id === userId ? m.user2Id : m.user1Id;
      matchMap.set(partnerId, m);
    }

    const interestMap = new Map();
    for (const i of sent.rows || []) {
      interestMap.set(i.targetUserId, i);
    }

    // Hydrate candidates
    const readers = await Promise.all(
      eligibleCandidateRows.map(async (candidateRow) => {
        const candidate = await buildFullPreferenceObject(candidateRow.userId, candidateRow);
        const match = matchMap.get(candidate.userId);
        const sentInterest = interestMap.get(candidate.userId);
        const compatibility = calculateLiteraryCompatibility(userPref, candidate);

        return {
          userId: candidate.userId,
          displayName: candidate.displayName || "Anonymous Reader",
          username: candidate.username || "reader",
          bio: candidate.bio || "",
          intent: candidate.intent,
          adultConfirmed: candidate.adultConfirmed,
          selectedFavorites: candidate.selectedFavorites || [],
          readerDnaSummary: {
            topGenres: Object.entries(candidate.readerDna?.genres || {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([g]) => g),
          },
          compatibility,
          isMatched: Boolean(match),
          matchType: match?.type || null,
          hasSentInterest: Boolean(sentInterest),
          sentInterestType: sentInterest?.intent || null,
        };
      })
    );

    // Sort: unmatched first, then by highest score
    readers.sort((a, b) => {
      if (a.isMatched !== b.isMatched) return a.isMatched ? 1 : -1;
      const scoreA = a.compatibility.score ?? -1;
      const scoreB = b.compatibility.score ?? -1;
      return scoreB - scoreA;
    });

    return {
      optedIn: true,
      userIntent: userPref.intent,
      adultConfirmed: userPref.adultConfirmed,
      readers,
    };
  },

  // 4. Send interest
  async sendInterest(senderId, targetUserId, intent = "friends") {
    if (!targetUserId || targetUserId === senderId) {
      const err = new Error("Invalid target user");
      err.statusCode = 400;
      throw err;
    }

    const validIntent = intent === "dating" ? "dating" : "friends";
    const db = getTablesDb();

    // Verify sender & target preferences
    let senderPref = null;
    let targetPref = null;
    try {
      [senderPref, targetPref] = await Promise.all([
        db.getRow({ databaseId: DATABASE_ID, tableId: TABLES.PREFERENCES, rowId: senderId }),
        db.getRow({ databaseId: DATABASE_ID, tableId: TABLES.PREFERENCES, rowId: targetUserId }),
      ]);
    } catch {
      // one of them missing
    }

    if (!senderPref || !senderPref.discoveryOptIn) {
      const err = new Error("You must opt into discovery to send interest.");
      err.statusCode = 403;
      throw err;
    }
    if (!targetPref || !targetPref.discoveryOptIn) {
      const err = new Error("Target reader is not available in discovery.");
      err.statusCode = 404;
      throw err;
    }

    // Verify blocks
    const [b1, b2] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        queries: [
          Query.equal("blockerId", senderId),
          Query.equal("blockedId", targetUserId),
          Query.limit(1),
        ],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        queries: [
          Query.equal("blockerId", targetUserId),
          Query.equal("blockedId", senderId),
          Query.limit(1),
        ],
      }),
    ]);

    if ((b1.total || 0) > 0 || (b2.total || 0) > 0) {
      const err = new Error("Interaction not permitted.");
      err.statusCode = 403;
      throw err;
    }

    // Check adult verification for dating
    if (validIntent === "dating") {
      if (!senderPref.adultConfirmed || !targetPref.adultConfirmed) {
        const err = new Error("Adult eligibility certification required for dating interest.");
        err.statusCode = 400;
        throw err;
      }
    }

    // Check if already matched
    const { u1, u2 } = getCanonicalPair(senderId, targetUserId);
    const existingMatchRes = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.MATCHES,
      queries: [Query.equal("user1Id", u1), Query.equal("user2Id", u2), Query.limit(1)],
    });

    if (existingMatchRes.rows && existingMatchRes.rows.length > 0) {
      const m = existingMatchRes.rows[0];
      return {
        status: "matched",
        match: {
          id: m.$id,
          user1Id: m.user1Id,
          user2Id: m.user2Id,
          type: m.type,
          matchedAt: m.matchedAt,
        },
        message: "You are already mutually matched with this reader.",
      };
    }

    // Check if identical interest already recorded
    const existingInterestRes = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.INTERESTS,
      queries: [
        Query.equal("senderId", senderId),
        Query.equal("targetUserId", targetUserId),
        Query.limit(1),
      ],
    });

    const existingInt = existingInterestRes.rows?.[0];
    if (existingInt && existingInt.intent === validIntent) {
      return {
        status: "interested",
        alreadySent: true,
        message:
          "Interest already recorded confidentially. If they express mutual interest, you will be matched.",
      };
    }

    // Record interest
    const interestRowId = makeRowId("int", senderId, targetUserId, validIntent);
    const nowIso = new Date().toISOString();
    await db.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.INTERESTS,
      rowId: interestRowId,
      data: {
        senderId,
        targetUserId,
        intent: validIntent,
        createdAt: nowIso,
      },
    });

    // Check reverse interest
    const reverseRes = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.INTERESTS,
      queries: [
        Query.equal("senderId", targetUserId),
        Query.equal("targetUserId", senderId),
        Query.limit(1),
      ],
    });

    const reverseInt = reverseRes.rows?.[0];
    if (reverseInt) {
      let matchType = null;
      if (reverseInt.intent === validIntent) {
        matchType = validIntent;
      } else if (senderPref.intent === "both" || targetPref.intent === "both") {
        matchType = validIntent;
      }

      if (matchType) {
        const matchRowId = makeRowId("match", u1, u2, matchType);
        const matchRow = await db.upsertRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.MATCHES,
          rowId: matchRowId,
          data: {
            user1Id: u1,
            user2Id: u2,
            type: matchType,
            matchedAt: nowIso,
          },
        });

        return {
          status: "matched",
          match: {
            id: matchRow.$id,
            user1Id: matchRow.user1Id,
            user2Id: matchRow.user2Id,
            type: matchRow.type,
            matchedAt: matchRow.matchedAt,
          },
          message: `It's a mutual match! You are now connected for ${matchType}.`,
        };
      }
    }

    return {
      status: "interested",
      message:
        "Interest sent confidentially. If they express mutual interest, you will be matched.",
    };
  },

  // 5. Withdraw interest
  async withdrawInterest(senderId, targetUserId) {
    const db = getTablesDb();

    // Delete outgoing interests
    const intRes = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.INTERESTS,
      queries: [
        Query.equal("senderId", senderId),
        Query.equal("targetUserId", targetUserId),
        Query.limit(10),
      ],
    });
    for (const r of intRes.rows || []) {
      try {
        await db.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.INTERESTS, rowId: r.$id });
      } catch {
        // continue
      }
    }

    // Invalidate any match between them
    const { u1, u2 } = getCanonicalPair(senderId, targetUserId);
    const mRes = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.MATCHES,
      queries: [Query.equal("user1Id", u1), Query.equal("user2Id", u2), Query.limit(10)],
    });
    for (const m of mRes.rows || []) {
      try {
        await db.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.MATCHES, rowId: m.$id });
      } catch {
        // continue
      }
    }

    return { success: true, message: "Interest withdrawn." };
  },

  // 6. Unmatch connected reader
  async unmatch(userId, targetUserId) {
    if (!targetUserId) {
      const err = new Error("Target user ID required");
      err.statusCode = 400;
      throw err;
    }
    const db = getTablesDb();
    const { u1, u2 } = getCanonicalPair(userId, targetUserId);

    // Delete match
    const mRes = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.MATCHES,
      queries: [Query.equal("user1Id", u1), Query.equal("user2Id", u2), Query.limit(10)],
    });
    for (const m of mRes.rows || []) {
      try {
        await db.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.MATCHES, rowId: m.$id });
      } catch {
        // continue
      }
    }

    // Delete interests both ways
    const [i1, i2] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.INTERESTS,
        queries: [
          Query.equal("senderId", userId),
          Query.equal("targetUserId", targetUserId),
          Query.limit(10),
        ],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.INTERESTS,
        queries: [
          Query.equal("senderId", targetUserId),
          Query.equal("targetUserId", userId),
          Query.limit(10),
        ],
      }),
    ]);

    for (const r of [...(i1.rows || []), ...(i2.rows || [])]) {
      try {
        await db.deleteRow({ databaseId: DATABASE_ID, tableId: TABLES.INTERESTS, rowId: r.$id });
      } catch {
        // continue
      }
    }

    return { success: true, message: "Unmatched successfully." };
  },

  // 7. Block user
  async block(blockerId, targetUserId) {
    if (!targetUserId || targetUserId === blockerId) {
      const err = new Error("Invalid target user");
      err.statusCode = 400;
      throw err;
    }
    const db = getTablesDb();
    const blockRowId = makeRowId("block", blockerId, targetUserId);

    await db.upsertRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.BLOCKS,
      rowId: blockRowId,
      data: {
        blockerId,
        blockedId: targetUserId,
        createdAt: new Date().toISOString(),
      },
    });

    // Dissolve any match and mutual interests
    await this.unmatch(blockerId, targetUserId);

    return {
      success: true,
      message:
        "User blocked. You will no longer see each other in discovery or interactions.",
    };
  },

  // 8. Unblock user
  async unblock(blockerId, targetUserId) {
    const db = getTablesDb();
    const blockRowId = makeRowId("block", blockerId, targetUserId);
    try {
      await db.deleteRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        rowId: blockRowId,
      });
    } catch {
      // Ignore if already deleted
    }
    return { success: true, message: "User unblocked." };
  },

  // 9. Get blocked users
  async getBlockedUsers(userId) {
    const db = getTablesDb();
    const res = await db.listRows({
      databaseId: DATABASE_ID,
      tableId: TABLES.BLOCKS,
      queries: [Query.equal("blockerId", userId), Query.limit(100)],
    });

    const blockedUsers = await Promise.all(
      (res.rows || []).map(async (b) => {
        const prof = await fetchUserProfile(b.blockedId);
        return {
          userId: b.blockedId,
          displayName: prof.displayName || "Reader",
          username: prof.username || "reader",
        };
      })
    );

    return { blockedUsers };
  },

  // 10. Get mutual matches
  async getMatches(userId) {
    const db = getTablesDb();
    const userPref = await buildFullPreferenceObject(userId);

    const [m1, m2] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        queries: [Query.equal("user1Id", userId), Query.limit(100)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        queries: [Query.equal("user2Id", userId), Query.limit(100)],
      }),
    ]);

    const allMatches = [...(m1.rows || []), ...(m2.rows || [])];
    const matches = await Promise.all(
      allMatches.map(async (m) => {
        const partnerId = m.user1Id === userId ? m.user2Id : m.user1Id;
        const partnerPref = await buildFullPreferenceObject(partnerId);
        const compatibility = calculateLiteraryCompatibility(userPref, partnerPref);

        return {
          matchId: m.$id,
          matchedAt: m.matchedAt,
          type: m.type,
          partner: {
            userId: partnerId,
            displayName: partnerPref.displayName || "Matched Reader",
            username: partnerPref.username || "reader",
            bio: partnerPref.bio || "",
            selectedFavorites: partnerPref.selectedFavorites || [],
            compatibility,
          },
        };
      })
    );

    return { matches };
  },

  // 11. Create report
  async createReport(reporterId, data) {
    const { targetUserId, reason, details, autoBlock = true } = data;
    const validReasons = [
      "harassment",
      "inappropriate_content",
      "underage_dating",
      "spam",
      "impersonation",
      "other",
    ];

    if (!targetUserId || targetUserId === reporterId) {
      const err = new Error("Invalid target user");
      err.statusCode = 400;
      throw err;
    }
    if (!validReasons.includes(reason)) {
      const err = new Error("Invalid report reason");
      err.statusCode = 400;
      throw err;
    }

    const db = getTablesDb();
    // Check recent duplicate report within 60s
    try {
      const recent = await db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.REPORTS,
        queries: [
          Query.equal("reporterId", reporterId),
          Query.equal("reportedUserId", targetUserId),
          Query.equal("reason", reason),
          Query.orderDesc("createdAt"),
          Query.limit(1),
        ],
      });
      if (recent.rows && recent.rows.length > 0) {
        const r = recent.rows[0];
        if (Date.now() - new Date(r.createdAt).getTime() < 60000) {
          return {
            success: true,
            alreadyReported: true,
            message: "Report already received and queued for review.",
            reportId: r.$id,
          };
        }
      }
    } catch {
      // Continue to create report
    }

    const nowIso = new Date().toISOString();
    const reportRowId = makeRowId("rep", reporterId, targetUserId, String(Date.now()));
    const reportRow = await db.createRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.REPORTS,
      rowId: reportRowId,
      data: {
        reporterId,
        reportedUserId: targetUserId,
        reason,
        details: typeof details === "string" ? details.trim().slice(0, 1000) : "",
        status: "pending",
        createdAt: nowIso,
      },
    });

    if (autoBlock) {
      await this.block(reporterId, targetUserId);
    }

    return {
      success: true,
      message: "Report securely submitted to the moderation queue.",
      reportId: reportRow.$id,
    };
  },

  // 12. Get reports overview (Admin)
  async getReports(adminKey) {
    const expectedKey = process.env.DOAB_ADMIN_KEY || process.env.ADMIN_KEY;
    if (!expectedKey || adminKey !== expectedKey) {
      const err = new Error(
        "Access denied. Confidential moderation queue requires administrator authorization."
      );
      err.statusCode = 403;
      throw err;
    }

    const db = getTablesDb();
    const [allReports, pendingReports] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.REPORTS,
        queries: [Query.orderDesc("createdAt"), Query.limit(50)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.REPORTS,
        queries: [Query.equal("status", "pending"), Query.limit(1)],
      }),
    ]);

    return {
      totalReports: allReports.total || 0,
      pendingReports: pendingReports.total || 0,
      reports: allReports.rows || [],
    };
  },

  // 13. Public reader profile details
  async getPublicReader(viewerId, targetUserId) {
    const db = getTablesDb();
    // Check blocks in either direction
    const [b1, b2] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        queries: [
          Query.equal("blockerId", viewerId),
          Query.equal("blockedId", targetUserId),
          Query.limit(1),
        ],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.BLOCKS,
        queries: [
          Query.equal("blockerId", targetUserId),
          Query.equal("blockedId", viewerId),
          Query.limit(1),
        ],
      }),
    ]);

    if ((b1.total || 0) > 0 || (b2.total || 0) > 0) {
      const err = new Error("Reader not found or unavailable.");
      err.statusCode = 404;
      throw err;
    }

    const [targetPref, viewerPref] = await Promise.all([
      buildFullPreferenceObject(targetUserId),
      buildFullPreferenceObject(viewerId),
    ]);

    const compatibility = calculateLiteraryCompatibility(viewerPref, targetPref);
    const { u1, u2 } = getCanonicalPair(viewerId, targetUserId);

    const [matchRes, interestRes] = await Promise.all([
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MATCHES,
        queries: [Query.equal("user1Id", u1), Query.equal("user2Id", u2), Query.limit(1)],
      }),
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.INTERESTS,
        queries: [
          Query.equal("senderId", viewerId),
          Query.equal("targetUserId", targetUserId),
          Query.limit(1),
        ],
      }),
    ]);

    const match = matchRes.rows?.[0];
    const sentInterest = interestRes.rows?.[0];

    return {
      reader: {
        userId: targetPref.userId,
        displayName: targetPref.displayName || "Reader",
        username: targetPref.username || "reader",
        bio: targetPref.bio || "",
        intent: targetPref.intent || "friends",
        discoveryOptIn: Boolean(targetPref.discoveryOptIn),
        selectedFavorites: targetPref.selectedFavorites || [],
        topGenres: Object.entries(targetPref.readerDna?.genres || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([g]) => g),
        compatibility,
        isMatched: Boolean(match),
        matchType: match?.type || null,
        hasSentInterest: Boolean(sentInterest),
        sentInterestType: sentInterest?.intent || null,
      },
    };
  },
};
