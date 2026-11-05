import * as cheerio from "cheerio";
import express from "express";
import fs from "node:fs";

const app = express();
const PORT = 3001;
const books = JSON.parse(
  fs.readFileSync("./data/gutenberg.json", "utf8")
);
const approvedEpubs = JSON.parse(
  fs.readFileSync("./data/approvedEpubs.json", "utf8")
);


app.get("/api/gutenberg/search", (req, res) => {
  const query = (req.query.q || "").toString().toLowerCase().trim();
  if (!query) {
    return res.json([]);
  }
  const results = books
    .filter((book) =>
      book.title.toLowerCase().includes(query)
    )
    .slice(0, 10);
  res.json(results);
});

app.get("/api/gutenberg/book/:id", (req, res) => {
  const id = Number(req.params.id);
  if(!Number.isSafeInteger(id) || id<=0) {
    return res.status(400).json({
      error: "Invalid Gutenberg ID"
    })
  }
  const book =  books.find((item) => item.id === id);
  if(!book) {
    return res.status(404).json({
      error: "Book not found"
    })
  }
  res.json({
    id: book.id,
    title: book.title,
    author: book.author,
    language: book.language
  })
})

app.get("/api/gutenberg/inspect", async (req,res) => {
  try{
    const response = await fetch(
      "https://www.gutenberg.org/cache/epub/1342/pg1342-images.html"
    )
    if(!response.ok) {
      throw new Error(`Gutenberg returned ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    res.json({
      pageTitle: $("title").first().text(),
      headings: $("h1, h2, h3")
        .slice(0, 15)
        .map((i, element) => $(element).text().trim())
        .get(),
      paragraphCount: $("p").length,
      chapterElements: $('[class*="chapter"]').length,
      chapterHeadings: $("h2, h3")
        .filter((i, element) => /\bchapter\s+[ivxlcdm\d]+\b/i.test(
          $(element).text()
        ))
        .slice(0,15)
        .map((i, element) => ({
          tag: element.tagName,
          // id: $(element).attr("id") || null,
          // className: $(element).attr("class") || null,
          text: $(element).text().trim(),
          html: $(element).html()?.slice(0, 400)
          // parentTag: $(element).parent().prop("tagName")
        }))
        .get(),
      chapterAnchors: $("h2")
        .filter((i,element) => {
          const anchorId = $(element).find("a[id]").first().attr("id");
          return /^chapter_[ivxlcdm\d]+$/i.test(anchorId || "");
        })
        .map((i, element) => {
          const anchorId = $(element).find("a[id]").first().attr("id");
          return {
            id: anchorId,
            headings: anchorId.replace("_", " "),
            paragraphs: $(element).nextUntil("h2").find("p").length + $(element).nextUntil("h2").filter("p").length
          }
        })
        .get()
    })
  } catch(error) {
    console.error("HTML inspection failed:", error);
    res.status(500).json({
      error: error.message
    });
  }
});

app.get("/api/gutenberg/:id/chapter/:chapter", async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    if(!Number.isSafeInteger(bookId) || bookId <= 0) {
      return res.status(404).json({
        error: "Invalid ID"
      })
    }
    const book = books.find((item)=> item.id === bookId)
    if(!book) {
      return res.status(404).json({
        error: "Book not found"
      })
    }
    if(bookId !== 1342) {
      return res.status(501).json({
        error: "Reader yet to be implemented"
      })
    }
    const chapterNumber = Number(req.params.chapter);
    if(!Number.isInteger(chapterNumber) || 
      chapterNumber < 1 || chapterNumber > 61) {
        return res.status(400).json({
          error: "Invalid chapter name"
        })
      }
    const response = await fetch(
      "https://www.gutenberg.org/cache/epub/1342/pg1342-images.html"
    )
    if(!response.ok) {
      throw new Error(`Gutenberg returned ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const chapterHeadings = $("h2").filter((i ,element) => {
      const anchorId = $(element).find("a[id]").first().attr("id");
      return/^chapter_[ivxlcdm\d]+$/i.test(anchorId || "");
    })
    const chapterHeading =  chapterHeadings.eq(chapterNumber - 1);
    if(!chapterHeading.length) {
      return res.status(404).json({
        error: "Chapter not found"
      })
    }
    const paragraphs = chapterHeading
      .nextUntil("h2")
      .filter("p")
      .add(chapterHeading.nextUntil("h2").find("p"))
      .map((i, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .map((text) => text.replace(/\{\d+\}/g, ""));

    res.json({
      bookId: book.id,
      title: book.title,
      chapter: chapterNumber,
      totalChapters: chapterHeadings.length,
      paragraphs  
    })
  } catch(error) {
    console.error("Extraction failed:", error);
    res.status(500).json({
      error: error.message
    })
  }
})

app.get("/api/gutenberg/:id/epub",(req,res) => {
  const id = Number(req.params.id);
  if(!Number.isSafeInteger(id) || id<=0){
    return res.status(400).json({
      error: "Invalid Id"
    })
  }
  const book = books.find((item) => item.id === id);
  if(!book){
    return res.status(404).json({
      error: "Book not found"
    })
  }
  const approvedBooks = approvedEpubs.find(
    (item) =>
      item.id === id &&
      item.status === "approved-for-local-test"
  )
  const filePath = `./public/books/${id}.epub`;
  const available = Boolean(approvedBooks) && fs.existsSync(filePath);
  res.json({
    id: book.id,
    title: book.title,
    available,
    epubUrl: available ? `/books/${id}.epub` : null
  })
})

app.listen(PORT, () => {
  console.log(`Gutenberg API running on http://localhost:${PORT}`);
});
