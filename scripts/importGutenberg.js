import fs from "node:fs";
import { parse } from "csv-parse";

const books = [];

fs.createReadStream("./data/pg_catalog.csv")
  .pipe(
    parse({
      columns: true,
      bom: true,
    })
  )
  .on("data", (row) => {
    if (row.Type !== "Text") return;
    const languages = row.Language.split(";").map(
      (language) => language.trim()
    );

    if (!languages.includes("en")) return;
    books.push({
      id: Number(row["Text#"]),
      title: row.Title,
      author: row.Authors,
      language: row.Language,
    });
  })
  .on("end", () => {
    fs.writeFileSync(
      "./data/gutenberg.json",
      JSON.stringify(books)
    );
    console.log(`Imported ${books.length} books!`);
  })
  .on("error", (error) => {
    console.error("CSV import failed:", error);
  });
