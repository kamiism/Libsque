import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const approvedEpubs = JSON.parse(
    fs.readFileSync("./data/approvedEpubs.json", "utf8")
);

const outputFolder = "./public/books";
function downloadEpub(url, destination) {
    const result = spawnSync(
        "curl.exe",
        [
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--connect-timeout", "20",
            "--max-time", "600",
            "--output", destination,
            url
        ],
        {stdio: "inherit"}
    );
    return result.status === 0;
}
fs.mkdirSync(outputFolder, { recursive: true });
fs.mkdirSync("./incoming-epubs", { recursive: true });
for (const book of approvedEpubs) {
    if (book.status !== "approved-for-local-test") {
        continue;
    }
    const filePath = path.join(outputFolder, `${book.id}.epub`);
    if (fs.existsSync(filePath)) {
        console.log(`Already available: ${book.title}`);
        continue;
    } 
    const sourcePath = path.join(
        "./incoming-epubs",
        `${book.id}.epub`
    );
    if(!fs.existsSync(sourcePath)) {
        const url = book.source?.url;
        if(!url) {
            console.log(`No download url for: ${book.title}`);
            continue;
        }
        const sourceUrl = new URL(url);
        if(
            sourceUrl.protocol !== "https:" ||
            sourceUrl.hostname !== "gutenberg.pglaf.org"
        ) {
            console.log(`unapproved download source: ${book.title}`);
            continue;
        }
        console.log(`Downloading: ${book.title}`);
        const downloaded = downloadEpub(url, sourcePath);
        if(!downloaded) {
            console.log(`Download failed: ${book.title}`);
            fs.rmSync(sourcePath, {force: true});
            continue;
        }
    }
    const header = Buffer.alloc(4);
    const file = fs.openSync(sourcePath, "r");

    try{
        fs.readSync(file, header, 0, 4, 0);
    } finally {
        fs.closeSync(file)
    }
    if(header.toString("hex") !== "504b0304") {
        console.log(`INVALID EPUB container: ${book.title}`);
        continue;
    }
    fs.copyFileSync(sourcePath, filePath);
    console.log(`Imported: ${book.title}`);
}