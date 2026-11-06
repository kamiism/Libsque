import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function validateEpub(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, reason: "File does not exist" };
  }
  const stat = fs.statSync(filePath);
  if (stat.size < 100) {
    return { valid: false, reason: "File too small" };
  }

  const header = Buffer.alloc(4);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, header, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString("hex") !== "504b0304") {
    return { valid: false, reason: "Invalid ZIP header" };
  }

  const listRes = spawnSync("tar.exe", ["-tf", filePath], {
    encoding: "utf8",
  });
  if (listRes.status !== 0 || !listRes.stdout) {
    return { valid: false, reason: "Corrupted ZIP archive" };
  }

  const entries = listRes.stdout.split(/\r?\n/).map((e) => e.trim());
  const hasMimetype = entries.some((e) => e === "mimetype" || e.endsWith("/mimetype"));
  const hasContainer = entries.some((e) => e === "META-INF/container.xml" || e.endsWith("META-INF/container.xml"));

  if (!hasMimetype || !hasContainer) {
    return { valid: false, reason: "Missing required mimetype or META-INF/container.xml" };
  }

  return { valid: true };
}

export function downloadEpub(url, destination) {
  const partFile = `${destination}.part`;
  const result = spawnSync(
    "curl.exe",
    [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--connect-timeout", "20",
      "--max-time", "600",
      "-C", "-",
      "--output", partFile,
      url,
    ],
    { stdio: "inherit" }
  );

  if (result.status === 0 && fs.existsSync(partFile)) {
    fs.renameSync(partFile, destination);
    return true;
  }
  return false;
}

export function runImport(options = {}) {
  const dataDir = options.dataDir || "./data";
  const outputFolder = options.outputFolder || "./public/books";
  const incomingFolder = options.incomingFolder || "./incoming-epubs";

  const manifestPath = path.join(dataDir, "approvedEpubs.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    return;
  }

  const approvedEpubs = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  fs.mkdirSync(outputFolder, { recursive: true });
  fs.mkdirSync(incomingFolder, { recursive: true });

  for (const book of approvedEpubs) {
    if (book.status !== "approved-for-local-test") {
      continue;
    }
    const finalPath = path.join(outputFolder, `${book.id}.epub`);
    if (fs.existsSync(finalPath)) {
      const check = validateEpub(finalPath);
      if (check.valid) {
        console.log(`Already verified and available: ${book.title} (ID: ${book.id})`);
        continue;
      }
      console.warn(`Existing file invalid for ${book.title}: ${check.reason}. Re-importing.`);
      fs.rmSync(finalPath, { force: true });
    }

    const stagedPath = path.join(incomingFolder, `${book.id}.epub`);
    if (!fs.existsSync(stagedPath)) {
      const url = book.source?.url;
      if (!url) {
        console.log(`No download url for: ${book.title}`);
        continue;
      }
      try {
        const sourceUrl = new URL(url);
        if (
          sourceUrl.protocol !== "https:" ||
          sourceUrl.hostname !== "gutenberg.pglaf.org"
        ) {
          console.log(`Unapproved download source: ${book.title} (${url})`);
          continue;
        }
      } catch {
        console.log(`Invalid URL for: ${book.title}`);
        continue;
      }

      console.log(`Downloading: ${book.title} from ${url}`);
      const downloaded = downloadEpub(url, stagedPath);
      if (!downloaded) {
        console.log(`Download failed: ${book.title}`);
        continue;
      }
    }

    const validation = validateEpub(stagedPath);
    if (!validation.valid) {
      console.error(`Invalid EPUB container: ${book.title} - ${validation.reason}`);
      continue;
    }

    fs.copyFileSync(stagedPath, finalPath);
    console.log(`Imported and verified: ${book.title}`);
  }
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  runImport();
}
