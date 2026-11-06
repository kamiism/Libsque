/**
 * Honest, understandable literary compatibility calculation
 * Handles sparse/empty data gracefully and provides clear explanations.
 */

export function calculateLiteraryCompatibility(userA = {}, userB = {}) {
  const dnaA = userA.readerDna || { genres: {}, themes: {} };
  const dnaB = userB.readerDna || { genres: {}, themes: {} };

  const genresA = dnaA.genres || {};
  const genresB = dnaB.genres || {};

  const favoritesA = (userA.selectedFavorites || userA.favoriteBooks || []).map(f => {
    if (typeof f === 'string') return { id: f, title: f };
    return { id: f.id || f.bookId || '', title: f.title || '' };
  });

  const favoritesB = (userB.selectedFavorites || userB.favoriteBooks || []).map(f => {
    if (typeof f === 'string') return { id: f, title: f };
    return { id: f.id || f.bookId || '', title: f.title || '' };
  });

  const keysA = Object.keys(genresA);
  const keysB = Object.keys(genresB);

  // 1. Sparse data check
  const hasBooksA = keysA.length > 0 || favoritesA.length > 0;
  const hasBooksB = keysB.length > 0 || favoritesB.length > 0;

  if (!hasBooksA && !hasBooksB) {
    return {
      score: null,
      label: "New Bookshelves",
      explanation: "Both readers are just starting their reading journals.",
      sharedGenres: [],
      sharedFavorites: [],
      breakdown: { genreScore: 0, favoriteScore: 0, ratingScore: 0 }
    };
  }

  if (!hasBooksA || !hasBooksB) {
    return {
      score: null,
      label: "Awaiting Bookshelf",
      explanation: "Add books to your bookshelf to compare reading compatibility.",
      sharedGenres: [],
      sharedFavorites: [],
      breakdown: { genreScore: 0, favoriteScore: 0, ratingScore: 0 }
    };
  }

  // 2. Shared Favorites Calculation
  const idsA = new Set(favoritesA.map(b => b.id.toLowerCase()).filter(Boolean));
  const titlesA = new Set(favoritesA.map(b => b.title.toLowerCase().trim()).filter(Boolean));

  const commonFavorites = favoritesB.filter(b => {
    const bId = (b.id || '').toLowerCase();
    const bTitle = (b.title || '').toLowerCase().trim();
    return (bId && idsA.has(bId)) || (bTitle && titlesA.has(bTitle));
  });

  const maxFavorites = Math.max(favoritesA.length, favoritesB.length, 1);
  const favoriteScore = Math.min(100, Math.round((commonFavorites.length / Math.min(maxFavorites, 3)) * 100));

  // 3. Genre Overlap Calculation
  const allGenres = new Set([...keysA, ...keysB]);
  let totalDifference = 0;
  const commonGenreList = [];

  for (const genre of allGenres) {
    const scoreA = genresA[genre] || 0;
    const scoreB = genresB[genre] || 0;
    if (scoreA > 0 && scoreB > 0) {
      commonGenreList.push({ genre, combined: scoreA + scoreB });
    }
    totalDifference += Math.abs(scoreA - scoreB);
  }

  commonGenreList.sort((a, b) => b.combined - a.combined);
  const topSharedGenres = commonGenreList.slice(0, 3).map(g => g.genre);

  const averageDiff = allGenres.size > 0 ? totalDifference / allGenres.size : 100;
  const genreScore = Math.max(0, Math.round(100 - averageDiff));

  // 4. Rating Agreement (if available)
  let ratingScore = 0;
  let hasRatingComparison = false;
  const ratingsA = userA.ratings || {};
  const ratingsB = userB.ratings || {};
  const sharedRatingKeys = Object.keys(ratingsA).filter(k => ratingsB[k] !== undefined);

  if (sharedRatingKeys.length > 0) {
    hasRatingComparison = true;
    const totalDiff = sharedRatingKeys.reduce((acc, k) => acc + Math.abs(ratingsA[k] - ratingsB[k]), 0);
    const avgRatingDiff = totalDiff / sharedRatingKeys.length;
    ratingScore = Math.max(0, Math.round(100 - avgRatingDiff * 25));
  }

  // 5. Composite Final Score
  const compositeScore = hasRatingComparison
    ? Math.round(genreScore * 0.50 + favoriteScore * 0.35 + ratingScore * 0.15)
    : Math.round(genreScore * 0.60 + favoriteScore * 0.40);

  // Ensure score is bounded [0, 99] (never claim 100% mathematical perfection)
  const finalScore = Math.min(99, Math.max(10, compositeScore));

  // 6. Natural Language Literary Explanation
  let label = "Reading Compatibility";
  let explanation = "Distinct bookshelves with room for new recommendations.";

  if (commonFavorites.length > 0) {
    const favTitle = commonFavorites[0].title;
    explanation = commonFavorites.length === 1
      ? `Shared favorite: "${favTitle}".`
      : `Shared favorites including "${favTitle}" and ${commonFavorites.length - 1} other${commonFavorites.length > 2 ? 's' : ''}.`;
    label = "Shared Favorites";
  } else if (topSharedGenres.length >= 2) {
    explanation = `Mutual interest in ${topSharedGenres[0]} and ${topSharedGenres[1]}.`;
    label = `${topSharedGenres[0]} Affinity`;
  } else if (topSharedGenres.length === 1) {
    explanation = `Shared affinity for ${topSharedGenres[0]}.`;
    label = `${topSharedGenres[0]} Reader`;
  } else if (finalScore >= 70) {
    explanation = "Similar reading preferences across shelf tags.";
    label = "Reading Compatibility";
  }

  return {
    score: finalScore,
    label,
    explanation,
    sharedGenres: topSharedGenres,
    sharedFavorites: commonFavorites.map(b => b.title),
    breakdown: {
      genreScore,
      favoriteScore,
      ratingScore: hasRatingComparison ? ratingScore : null
    }
  };
}
