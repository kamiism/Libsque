export function calculateMatchScore(myDna, otherDna, myLibrary=[], otherLibrary = []) {
    let totalDifference = 0;
    let comparisons = 0;

    const allGenres = new Set([
        ...Object.keys(myDna.genres || {}),
        ...Object.keys(otherDna.genres || {})
    ])

    for(const genre of allGenres) {
        const myScore = myDna.genres?.[genre] || 0;
        const otherScore = otherDna.genres?.[genre] || 0;

        totalDifference += Math.abs(myScore - otherScore);
        comparisons++;
    }
    const allThemes = new Set([
        ...Object.keys(myDna.themes || {}),
        ...Object.keys(otherDna.themes || {})
    ]);

    for(const theme of allThemes) {
        const myScore = myDna.themes?.[theme] || 0;
        const otherScore = otherDna.themes?.[theme] || 0;

        totalDifference += Math.abs(myScore - otherScore);
        comparisons++;
    }
    if(comparisons === 0) {
        return 0;
    }

    const averageDifference =  totalDifference / comparisons;
    const myBookIds = new Set(
        myLibrary.map((book)=>book.bookId)
    );
    let sharedBooks = 0;
    for(const book of otherLibrary) {
        if(myBookIds.has(book.bookId)) {
            sharedBooks++;
        }
    }
    const maxLibrarySize = Math.max(
        myLibrary.length,
        otherLibrary.length,
        1
    );
    const sharedBookScore = (sharedBooks / maxLibrarySize) * 100;
    const dnaScore = Math.max(
        0,
        100 - averageDifference
    );
    let ratingDifference = 0;
    let ratingComparisons = 0;
    for(const myBook of myLibrary) {
        const otherBook = otherLibrary.find(
            (book) => book.bookId === myBook.bookId
        );
        if(otherBook && myBook.rating && otherBook.rating) {
            ratingDifference += Math.abs(
                myBook.rating - otherBook.rating
            );
            ratingComparisons++;
        }
    }
    let ratingScore = 0;
    if(ratingComparisons > 0) {
        const averageRatingDifference = ratingDifference / ratingComparisons;
        ratingScore = Math.max(0, 100 - averageRatingDifference * 25)
    }
    let finalScore;
    if (ratingComparisons >0){
    finalScore =
        dnaScore*0.60 +
        sharedBookScore*0.25 +
        ratingScore*0.15;
    }else{
    finalScore =
        dnaScore* 0.70 +
        sharedBookScore *0.30;
    }
    return Math.round(finalScore);
}