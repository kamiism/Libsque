import fs from "node:fs";
import https from "node:https";
import readline from "node:readline";

const KBART_URL = "https://memo.doabooks.org/file/oapen/DOAB_KBART_books_with_download_url.tsv";
const TSV_FILE = "./data/doab_kbart.tsv";
const INDEX_FILE = "./data/doab_index.json";

function cleanIsbn(str) {
  if (!str) return "";
  return str.replace(/[^0-9X]/gi, "").toUpperCase();
}

function cleanTitle(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeOapenUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes("library.oapen.org")) return rawUrl;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "bitstream" && parts[1] !== "handle" && parts.length >= 5) {
      const prefix = parts[1];
      const id = parts[2];
      const seq = parts[3];
      const filename = parts.slice(4).join("/");
      return `https://library.oapen.org/bitstream/handle/${prefix}/${id}/${filename}?sequence=${seq}`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export async function downloadDoabFeed(targetPath = TSV_FILE) {
  const tempPath = `${targetPath}.tmp.${Date.now()}`;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    https
      .get(KBART_URL, (res) => {
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(tempPath, () => {});
          return reject(new Error(`Failed to download DOAB TSV: HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            const stats = fs.statSync(tempPath);
            if (stats.size < 1000000) {
              fs.unlink(tempPath, () => {});
              return reject(new Error(`Downloaded TSV too small (${stats.size} bytes), download aborted`));
            }
            try {
              if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
              }
              fs.renameSync(tempPath, targetPath);
              resolve(targetPath);
            } catch (renameErr) {
              fs.unlink(tempPath, () => {});
              reject(renameErr);
            }
          });
        });
      })
      .on("error", (err) => {
        fs.unlink(tempPath, () => {});
        reject(err);
      });
  });
}

export async function buildDoabIndex(sourceTsv = TSV_FILE, targetIndex = INDEX_FILE) {
  if (!fs.existsSync(sourceTsv)) {
    throw new Error(`Source TSV not found at ${sourceTsv}`);
  }

  const tempIndexPath = `${targetIndex}.tmp.${Date.now()}`;
  const rl = readline.createInterface({
    input: fs.createReadStream(sourceTsv),
  });

  const items = [];
  const isbnIndex = {};
  const titleIndex = {};

  let count = 0;
  for await (const line of rl) {
    count++;
    if (count === 1) continue;

    const parts = line.split("\t");
    const rawUrl = parts[9]?.trim();
    if (!rawUrl) continue;

    const title = parts[0]?.trim();
    const author = parts[10]?.trim();
    const publisher = parts[15]?.trim();
    const rawLicense = parts[14]?.trim() || "";
    const license = rawLicense.replace(/^publication licence:\s*/i, "");
    const pIsbn = cleanIsbn(parts[1]);
    const oIsbn = cleanIsbn(parts[2]);
    const url = normalizeOapenUrl(rawUrl);
    const format = url.toLowerCase().includes(".epub") ? "epub" : "pdf";
    const doi = parts[27]?.trim();

    const id = items.length;
    items.push({
      title,
      author,
      publisher,
      license,
      format,
      url,
      isbn: oIsbn || pIsbn,
      doi,
    });

    const others = parts[26] ? parts[26].split(";").map(cleanIsbn) : [];
    const isbns = [pIsbn, oIsbn, ...others].filter(Boolean);
    for (const i of isbns) {
      if (isbnIndex[i] === undefined) isbnIndex[i] = id;
    }

    const ct = cleanTitle(title);
    if (ct.length > 5 && titleIndex[ct] === undefined) {
      titleIndex[ct] = id;
    }
  }

  if (items.length < 1000) {
    throw new Error(`Index generation aborted: parsed only ${items.length} items`);
  }

  const indexData = {
    updatedAt: new Date().toISOString(),
    totalItems: items.length,
    items,
    isbnIndex,
    titleIndex,
  };

  const backupIndex = `${targetIndex}.bak`;
  try {
    fs.writeFileSync(tempIndexPath, JSON.stringify(indexData));
    if (fs.existsSync(targetIndex)) {
      if (fs.existsSync(backupIndex)) fs.unlinkSync(backupIndex);
      fs.renameSync(targetIndex, backupIndex);
    }
    fs.renameSync(tempIndexPath, targetIndex);
    if (fs.existsSync(backupIndex)) {
      try { fs.unlinkSync(backupIndex); } catch (e) { void e; }
    }
    return indexData;
  } catch (err) {
    if (fs.existsSync(tempIndexPath)) {
      try { fs.unlinkSync(tempIndexPath); } catch (e) { void e; }
    }
    if (!fs.existsSync(targetIndex) && fs.existsSync(backupIndex)) {
      try { fs.renameSync(backupIndex, targetIndex); } catch (e) { void e; }
    }
    throw err;
  }
}

if (process.argv[1]?.endsWith("syncDoab.js")) {
  console.log("Downloading DOAB KBART feed...");
  downloadDoabFeed()
    .then(() => {
      console.log("Download complete. Generating index...");
      return buildDoabIndex();
    })
    .then((idx) => {
      console.log(`DOAB index created with ${idx.totalItems} items.`);
    })
    .catch((err) => {
      console.error("DOAB sync failed:", err.message);
      process.exit(1);
    });
}

