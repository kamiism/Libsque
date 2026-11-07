import crypto from "crypto";
import fs from "fs";
import path from "path";

export function loadEnvFile(envPath = ".env") {
  try {
    const resolved = path.resolve(envPath);
    if (fs.existsSync(resolved)) {
      const lines = fs.readFileSync(resolved, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key && (process.env[key] === undefined || process.env[key] === "")) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Ignore error
  }
}

loadEnvFile();

export function makeRowId(prefix, ...parts) {
  const content = `${prefix}:${parts.join(":")}`;
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 32);
}

export function getCanonicalPair(idA, idB) {
  const sorted = [String(idA), String(idB)].sort();
  return {
    u1: sorted[0],
    u2: sorted[1],
    pairKey: sorted.join(":"),
  };
}

