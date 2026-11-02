import { genreTaxonomy } from "../data/genreTaxonomy";

function normalizeScores(scores) {
  const values = Object.values(scores);
  if (values.length === 0) {
    return {};
  }
  const positiveValues = values.filter((score) => score > 0);
  if (positiveValues.length === 0) {
    return {};
  }
  const highestScore = Math.max(...positiveValues);
  const normalized = {};
  for (const [name, score] of Object.entries(scores)) {
    if (score <= 0) {
      continue;
    }
    normalized[name] = Math.round((score / highestScore) * 100);
  }
  return normalized;
}

function isParentGenre(genre) {
  return Object.keys(genreTaxonomy).includes(genre);
}

export function calculateReaderDna(library = []) {
  const genreScores = {};
  const themeScores = {};
  for (const book of library) {
    let weight = 0;
    if (book.status === "read") {
      weight += 3;
    }
    if (book.status === "reading") {
      weight += 2;
    }
    if (book.status === "want_to_read") {
      weight += 1;
    }
    if (book.status === "dropped") {
      weight -= 1;
    }
    if (book.favorite === true) {
      weight += 3;
    }
    if (book.rating) {
      weight += book.rating;
    }
    for (const genre of book.genres || []) {
      const genreWeight = isParentGenre(genre)
        ? weight * 0.5
        : weight;
      genreScores[genre] =
        (genreScores[genre] || 0) + genreWeight;
    }
    for (const theme of book.themes || []) {
      themeScores[theme] = (themeScores[theme] || 0) + weight;
    }
  }
  return {
    genres: normalizeScores(genreScores),
    themes: normalizeScores(themeScores),
  };
}