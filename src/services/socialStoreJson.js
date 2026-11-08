import fs from "fs";
import path from "path";
import crypto from "crypto";
import { calculateLiteraryCompatibility } from "../utils/compatibility.js";

const SOCIAL_STORE_PATH = path.resolve("./data/social_discovery.json");
const SOCIAL_BACKUP_DIR = path.resolve("./data/backups");

function loadSocialStore() {
  if (fs.existsSync(SOCIAL_STORE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SOCIAL_STORE_PATH, "utf8"));
      return {
        preferences: data.preferences || {},
        interests: data.interests || {},
        matches: data.matches || {},
        blocks: data.blocks || {},
        reports: Array.isArray(data.reports) ? data.reports : [],
      };
    } catch (err) {
      console.error("Failed to parse social_discovery.json:", err.message);
      try {
        if (fs.existsSync(SOCIAL_BACKUP_DIR)) {
          const backups = fs
            .readdirSync(SOCIAL_BACKUP_DIR)
            .filter((f) => f.startsWith("social_discovery_backup_") && f.endsWith(".json"))
            .sort()
            .reverse();
          for (const b of backups) {
            try {
              const content = fs.readFileSync(path.join(SOCIAL_BACKUP_DIR, b), "utf8");
              const parsed = JSON.parse(content);
              if (parsed.preferences && typeof parsed.preferences === "object") {
                console.log(`Successfully recovered social store from backup: ${b}`);
                return {
                  preferences: parsed.preferences || {},
                  interests: parsed.interests || {},
                  matches: parsed.matches || {},
                  blocks: parsed.blocks || {},
                  reports: Array.isArray(parsed.reports) ? parsed.reports : [],
                };
              }
            } catch {
              // try next
            }
          }
        }
      } catch (rollbackErr) {
        console.error("Rollback scan failed:", rollbackErr.message);
      }
    }
  }

  return {
    preferences: {},
    interests: {},
    matches: {},
    blocks: {},
    reports: [],
  };
}

let store = loadSocialStore();

function saveSocialStore() {
  const storeDir = path.dirname(SOCIAL_STORE_PATH);
  const tempFile = path.join(
    storeDir,
    `.tmp_${path.basename(SOCIAL_STORE_PATH)}_${Date.now()}_${process.pid}.json`
  );

  try {
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    if (!fs.existsSync(SOCIAL_BACKUP_DIR)) {
      fs.mkdirSync(SOCIAL_BACKUP_DIR, { recursive: true });
    }

    const payload = JSON.stringify(store, null, 2);

    const fd = fs.openSync(tempFile, "w");
    try {
      fs.writeSync(fd, payload, 0, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    const backupFile = path.join(
      SOCIAL_BACKUP_DIR,
      `social_discovery_backup_${Date.now()}.json`
    );
    fs.copyFileSync(tempFile, backupFile);

    let renamed = false;
    let attempts = 0;
    while (!renamed && attempts < 5) {
      try {
        fs.renameSync(tempFile, SOCIAL_STORE_PATH);
        renamed = true;
      } catch (renameErr) {
        attempts++;
        if (attempts >= 5) throw renameErr;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempts * 20);
      }
    }

    try {
      const backups = fs
        .readdirSync(SOCIAL_BACKUP_DIR)
        .filter((f) => f.startsWith("social_discovery_backup_") && f.endsWith(".json"))
        .sort();
      while (backups.length > 10) {
        const oldest = backups.shift();
        fs.unlinkSync(path.join(SOCIAL_BACKUP_DIR, oldest));
      }
    } catch {
      // non-fatal
    }
  } catch (err) {
    console.error("Failed to persist social_discovery.json:", err.message);
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (cleanErr) {
      void cleanErr;
    }
  }
}

let storeLock = Promise.resolve();
function withLock(fn) {
  const next = storeLock.then(() => fn());
  storeLock = next.catch(() => {});
  return next;
}

export const socialStoreJson = {
  async getPreferences(userId, userFallbackName = "") {
    const userPref = store.preferences[userId] || {
      userId,
      discoveryOptIn: false,
      intent: "friends",
      adultConfirmed: false,
      adultConfirmedAt: null,
      bio: "",
      displayName: userFallbackName || "",
      username: "",
      selectedFavorites: [],
      readerDna: { genres: {}, themes: {} },
    };

    const myMatches = Object.values(store.matches).filter(
      (m) => m.user1Id === userId || m.user2Id === userId
    );

    const mySentInterests = Object.values(store.interests).filter(
      (i) => i.senderId === userId
    );

    const myBlocks = Object.values(store.blocks).filter(
      (b) => b.blockerId === userId
    );

    return {
      preferences: userPref,
      stats: {
        matchesCount: myMatches.length,
        sentInterestsCount: mySentInterests.length,
        blockedCount: myBlocks.length,
      },
    };
  },

  async updatePreferences(userId, data, userFallbackName = "") {
    const {
      discoveryOptIn,
      intent,
      adultConfirmed,
      bio,
      displayName,
      username,
      selectedFavorites,
      readerDna,
    } = data;

    const validIntent = ["friends", "dating", "both"].includes(intent)
      ? intent
      : "friends";

    if ((validIntent === "dating" || validIntent === "both") && !adultConfirmed) {
      const err = new Error("Explicit adult certification (18+) is required to enable dating discovery.");
      err.statusCode = 400;
      throw err;
    }

    return withLock(async () => {
      const existingPref = store.preferences[userId] || {};

      const cleanFavorites = Array.isArray(selectedFavorites)
        ? selectedFavorites.slice(0, 5).map((f) => ({
            id: String(f.id || f.bookId || "").slice(0, 100),
            title: String(f.title || "").slice(0, 200),
            author: String(f.author || "").slice(0, 100),
            coverId: f.coverId ? Number(f.coverId) : null,
          }))
        : existingPref.selectedFavorites || [];

      const updatedPref = {
        userId,
        discoveryOptIn: Boolean(discoveryOptIn),
        intent: validIntent,
        adultConfirmed: Boolean(adultConfirmed),
        adultConfirmedAt:
          adultConfirmed && !existingPref.adultConfirmedAt
            ? new Date().toISOString()
            : existingPref.adultConfirmedAt || null,
        bio: typeof bio === "string" ? bio.trim().slice(0, 500) : existingPref.bio || "",
        displayName:
          typeof displayName === "string"
            ? displayName.trim().slice(0, 50)
            : existingPref.displayName || userFallbackName || "Reader",
        username:
          typeof username === "string"
            ? username.trim().slice(0, 30)
            : existingPref.username || "",
        selectedFavorites: cleanFavorites,
        readerDna:
          readerDna && typeof readerDna === "object"
            ? readerDna
            : existingPref.readerDna || { genres: {}, themes: {} },
        updatedAt: new Date().toISOString(),
      };

      store.preferences[userId] = updatedPref;
      saveSocialStore();

      return { success: true, preferences: updatedPref };
    });
  },

  async getDiscoverReaders(userId, filterIntent = "all") {
    const userPref = store.preferences[userId];

    if (!userPref || !userPref.discoveryOptIn) {
      return {
        optedIn: false,
        message:
          "Reader discovery is currently turned off. Opt in from your settings to browse and connect with compatible readers.",
        readers: [],
      };
    }

    const candidates = Object.values(store.preferences).filter((candidate) => {
      if (candidate.userId === userId) return false;
      if (!candidate.discoveryOptIn) return false;

      if (store.blocks[`${userId}:${candidate.userId}`]) return false;
      if (store.blocks[`${candidate.userId}:${userId}`]) return false;

      // Intent compatibility
      if (filterIntent === "dating") {
        if (!userPref.adultConfirmed || !candidate.adultConfirmed) return false;
        if (candidate.intent !== "dating" && candidate.intent !== "both") return false;
      } else if (filterIntent === "friends") {
        if (candidate.intent !== "friends" && candidate.intent !== "both") return false;
      } else {
        // filterIntent is "all" or default: filter according to user's registered intent
        if (userPref.intent === "dating") {
          if (!userPref.adultConfirmed || !candidate.adultConfirmed) return false;
          if (candidate.intent !== "dating" && candidate.intent !== "both") return false;
        } else if (userPref.intent === "friends") {
          if (candidate.intent !== "friends" && candidate.intent !== "both") return false;
        } else {
          // User intent is "both"
          if (candidate.intent === "dating" && (!userPref.adultConfirmed || !candidate.adultConfirmed)) {
            return false;
          }
        }
      }

      return true;
    });

    const readers = candidates.map((candidate) => {
      const pairKey = [userId, candidate.userId].sort().join(":");
      const match = store.matches[pairKey];
      const sentInterest = store.interests[`${userId}:${candidate.userId}`];
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
    });

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

  async sendInterest(senderId, targetUserId, intent = "friends") {
    if (!targetUserId || targetUserId === senderId) {
      const err = new Error("Invalid target user");
      err.statusCode = 400;
      throw err;
    }

    const validIntent = intent === "dating" ? "dating" : "friends";

    return withLock(async () => {
      const senderPref = store.preferences[senderId];
      if (!senderPref || !senderPref.discoveryOptIn) {
        const err = new Error("You must opt into discovery to send interest.");
        err.statusCode = 403;
        throw err;
      }

      const targetPref = store.preferences[targetUserId];
      if (!targetPref || !targetPref.discoveryOptIn) {
        const err = new Error("Target reader is not available in discovery.");
        err.statusCode = 404;
        throw err;
      }

      if (
        store.blocks[`${senderId}:${targetUserId}`] ||
        store.blocks[`${targetUserId}:${senderId}`]
      ) {
        const err = new Error("Interaction not permitted.");
        err.statusCode = 403;
        throw err;
      }

      if (validIntent === "dating") {
        if (!senderPref.adultConfirmed || !targetPref.adultConfirmed) {
          const err = new Error("Adult eligibility certification required for dating interest.");
          err.statusCode = 400;
          throw err;
        }
      }

      const pairKey = [senderId, targetUserId].sort().join(":");
      if (store.matches[pairKey]) {
        return {
          status: "matched",
          match: store.matches[pairKey],
          message: "You are already mutually matched with this reader.",
        };
      }

      const interestKey = `${senderId}:${targetUserId}`;
      const existingInterest = store.interests[interestKey];
      if (existingInterest && existingInterest.intent === validIntent) {
        return {
          status: "interested",
          alreadySent: true,
          message:
            "Interest already recorded confidentially. If they express mutual interest, you will be matched.",
        };
      }

      store.interests[interestKey] = {
        id: crypto.randomUUID(),
        senderId,
        targetUserId,
        intent: validIntent,
        createdAt: new Date().toISOString(),
      };

      const reverseKey = `${targetUserId}:${senderId}`;
      const reverseInterest = store.interests[reverseKey];

      if (reverseInterest) {
        let matchType = null;
        if (reverseInterest.intent === validIntent) {
          matchType = validIntent;
        } else if (senderPref.intent === "both" || targetPref.intent === "both") {
          matchType = validIntent;
        }

        if (matchType) {
          const match = {
            id: crypto.randomUUID(),
            user1Id: [senderId, targetUserId].sort()[0],
            user2Id: [senderId, targetUserId].sort()[1],
            type: matchType,
            matchedAt: new Date().toISOString(),
          };
          store.matches[pairKey] = match;
          saveSocialStore();

          return {
            status: "matched",
            match,
            message: `It's a mutual match! You are now connected for ${matchType}.`,
          };
        }
      }

      saveSocialStore();
      return {
        status: "interested",
        message:
          "Interest sent confidentially. If they express mutual interest, you will be matched.",
      };
    });
  },

  async withdrawInterest(senderId, targetUserId) {
    return withLock(async () => {
      const interestKey = `${senderId}:${targetUserId}`;
      if (store.interests[interestKey]) {
        delete store.interests[interestKey];
      }

      const pairKey = [senderId, targetUserId].sort().join(":");
      if (store.matches[pairKey]) {
        delete store.matches[pairKey];
      }

      saveSocialStore();
      return { success: true, message: "Interest withdrawn." };
    });
  },

  async unmatch(userId, targetUserId) {
    if (!targetUserId) {
      const err = new Error("Target user ID required");
      err.statusCode = 400;
      throw err;
    }

    return withLock(async () => {
      const pairKey = [userId, targetUserId].sort().join(":");
      if (store.matches[pairKey]) {
        delete store.matches[pairKey];
      }

      delete store.interests[`${userId}:${targetUserId}`];
      delete store.interests[`${targetUserId}:${userId}`];

      saveSocialStore();
      return { success: true, message: "Unmatched successfully." };
    });
  },

  async block(blockerId, targetUserId) {
    if (!targetUserId || targetUserId === blockerId) {
      const err = new Error("Invalid target user");
      err.statusCode = 400;
      throw err;
    }

    return withLock(async () => {
      const blockKey = `${blockerId}:${targetUserId}`;
      store.blocks[blockKey] = {
        blockerId,
        blockedId: targetUserId,
        createdAt: new Date().toISOString(),
      };

      const pairKey = [blockerId, targetUserId].sort().join(":");
      delete store.matches[pairKey];
      delete store.interests[`${blockerId}:${targetUserId}`];
      delete store.interests[`${targetUserId}:${blockerId}`];

      saveSocialStore();
      return {
        success: true,
        message:
          "User blocked. You will no longer see each other in discovery or interactions.",
      };
    });
  },

  async unblock(blockerId, targetUserId) {
    return withLock(async () => {
      const blockKey = `${blockerId}:${targetUserId}`;
      if (store.blocks[blockKey]) {
        delete store.blocks[blockKey];
        saveSocialStore();
      }
      return { success: true, message: "User unblocked." };
    });
  },

  async getBlockedUsers(userId) {
    const blockedIds = Object.values(store.blocks)
      .filter((b) => b.blockerId === userId)
      .map((b) => b.blockedId);

    const blockedUsers = blockedIds.map((id) => {
      const pref = store.preferences[id];
      return {
        userId: id,
        displayName: pref?.displayName || "Reader",
        username: pref?.username || "reader",
      };
    });

    return { blockedUsers };
  },

  async getMatches(userId) {
    const userPref = store.preferences[userId] || {};

    const matches = Object.values(store.matches)
      .filter((m) => m.user1Id === userId || m.user2Id === userId)
      .map((m) => {
        const partnerId = m.user1Id === userId ? m.user2Id : m.user1Id;
        const partnerPref = store.preferences[partnerId] || {};
        const compatibility = calculateLiteraryCompatibility(userPref, partnerPref);

        return {
          matchId: m.id,
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
      });

    return { matches };
  },

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

    return withLock(async () => {
      const existingRecent = store.reports.find(
        (r) =>
          r.reporterId === reporterId &&
          r.reportedUserId === targetUserId &&
          r.reason === reason &&
          Date.now() - new Date(r.createdAt).getTime() < 60000
      );

      if (existingRecent) {
        return {
          success: true,
          alreadyReported: true,
          message: "Report already received and queued for review.",
          reportId: existingRecent.id,
        };
      }

      const report = {
        id: crypto.randomUUID(),
        reporterId,
        reportedUserId: targetUserId,
        reason,
        details: typeof details === "string" ? details.trim().slice(0, 1000) : "",
        createdAt: new Date().toISOString(),
        status: "pending",
      };

      store.reports.push(report);

      if (autoBlock) {
        const blockKey = `${reporterId}:${targetUserId}`;
        store.blocks[blockKey] = {
          blockerId: reporterId,
          blockedId: targetUserId,
          createdAt: new Date().toISOString(),
          reason: `Report: ${reason}`,
        };
        const pairKey = [reporterId, targetUserId].sort().join(":");
        delete store.matches[pairKey];
        delete store.interests[`${reporterId}:${targetUserId}`];
        delete store.interests[`${targetUserId}:${reporterId}`];
      }

      saveSocialStore();
      return {
        success: true,
        message: "Report securely submitted to the moderation queue.",
        reportId: report.id,
      };
    });
  },

  async getReports(adminKey) {
    const expectedKey = process.env.DOAB_ADMIN_KEY || process.env.ADMIN_KEY;
    if (!expectedKey || adminKey !== expectedKey) {
      const err = new Error(
        "Access denied. Confidential moderation queue requires administrator authorization."
      );
      err.statusCode = 403;
      throw err;
    }

    return {
      totalReports: store.reports.length,
      pendingReports: store.reports.filter((r) => r.status === "pending").length,
      reports: store.reports.slice(-50),
    };
  },

  async getPublicReader(viewerId, targetUserId) {
    if (
      store.blocks[`${viewerId}:${targetUserId}`] ||
      store.blocks[`${targetUserId}:${viewerId}`]
    ) {
      const err = new Error("Reader not found or unavailable.");
      err.statusCode = 404;
      throw err;
    }

    const targetPref = store.preferences[targetUserId] || {
      userId: targetUserId,
      displayName: "Reader",
      username: "reader",
      bio: "",
      intent: "friends",
      selectedFavorites: [],
      readerDna: { genres: {}, themes: {} },
      discoveryOptIn: false,
    };

    const viewerPref = store.preferences[viewerId] || {};
    const compatibility = calculateLiteraryCompatibility(viewerPref, targetPref);
    const pairKey = [viewerId, targetUserId].sort().join(":");
    const match = store.matches[pairKey];
    const sentInterest = store.interests[`${viewerId}:${targetUserId}`];

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

