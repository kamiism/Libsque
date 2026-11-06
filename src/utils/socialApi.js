import { account } from "../appwrite/config";

let cachedJwt = null;
let cachedUserId = null;
let jwtExpiresAt = 0;

export async function getAuthHeaders() {
  try {
    const user = await account.get();
    if (!cachedJwt || user.$id !== cachedUserId || Date.now() > jwtExpiresAt) {
      const jwtData = await account.createJWT();
      cachedJwt = jwtData.jwt;
      cachedUserId = user.$id;
      jwtExpiresAt = Date.now() + 10 * 60 * 1000;
    }
  } catch {
    cachedJwt = null;
    cachedUserId = null;
  }

  return {
    "Content-Type": "application/json",
    ...(cachedJwt ? { Authorization: `Bearer ${cachedJwt}` } : {}),
  };
}

export async function getSocialPreferences() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/preferences", { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateSocialPreferences(data) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/preferences", {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function getDiscoverReaders(intent = "all") {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/social/discover?intent=${encodeURIComponent(intent)}`, {
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getMutualMatches() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/matches", { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function sendInterest(targetUserId, intent = "friends") {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/interest", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetUserId, intent }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function withdrawInterest(targetUserId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/social/interest/${encodeURIComponent(targetUserId)}`, {
    method: "DELETE",
    headers,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function unmatchReader(targetUserId) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/unmatch", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetUserId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function blockReader(targetUserId) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/block", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetUserId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function unblockReader(targetUserId) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/unblock", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetUserId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function getBlockedReaders() {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/blocks", { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function reportReader(targetUserId, reason, details = "", autoBlock = true) {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/social/report", {
    method: "POST",
    headers,
    body: JSON.stringify({ targetUserId, reason, details, autoBlock }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function getPublicReader(targetUserId) {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/social/reader/${encodeURIComponent(targetUserId)}`, {
    headers,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
