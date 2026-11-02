import { genreTaxonomy } from "../data/genreTaxonomy";

function addParentGenres(genres) {
  const result = new Set(genres);

  for (const [parentGenre, subgenres] of Object.entries(genreTaxonomy)) {
    for (const genre of genres) {
      if (subgenres.includes(genre)) {
        result.add(parentGenre);
      }
    }
  }

  return [...result];
}

const genreMap = {
  "fantasy": "Fantasy",
  "fantasy fiction": "Fantasy",
  "high fantasy": "High Fantasy",
  "epic fantasy": "Epic Fantasy",
  "dark fantasy": "Dark Fantasy",
  "urban fantasy": "Urban Fantasy",
  "contemporary fantasy": "Contemporary Fantasy",
  "historical fantasy": "Historical Fantasy",
  "romantic fantasy": "Romantic Fantasy",
  "fantasy romance": "Fantasy Romance",
  "magical realism": "Magical Realism",
  "sword and sorcery": "Sword & Sorcery",
  "sword & sorcery": "Sword & Sorcery",
  "isekai": "Isekai",
  "science fiction": "Science Fiction",
  "science fiction, general": "Science Fiction",
  "cyberpunk": "Cyberpunk",
  "space opera": "Space Opera",
  "dystopian": "Dystopian",
  "dystopian fiction": "Dystopian",
  "post-apocalyptic fiction": "Post-Apocalyptic",
  "post-apocalyptic": "Post-Apocalyptic",
  "time travel": "Time Travel",
  "military science fiction": "Military Science Fiction",
  "hard science fiction": "Hard Science Fiction",
  "soft science fiction": "Soft Science Fiction",
  "alternate history": "Alternate History",
  "horror": "Horror",
  "horror fiction": "Horror",
  "gothic fiction": "Gothic Horror",
  "gothic horror": "Gothic Horror",
  "psychological horror": "Psychological Horror",
  "cosmic horror": "Cosmic Horror",
  "supernatural horror": "Supernatural Horror",
  "body horror": "Body Horror",
  "folk horror": "Folk Horror",
  "paranormal horror": "Paranormal Horror",
  "mystery": "Mystery",
  "mystery fiction": "Mystery",
  "detective fiction": "Detective Fiction",
  "detective and mystery stories": "Detective Fiction",
  "whodunit": "Whodunit",
  "cozy mystery": "Cozy Mystery",
  "police procedural": "Police Procedural",
  "historical mystery": "Historical Mystery",
  "thriller": "Thriller",
  "thrillers": "Thriller",
  "psychological thriller": "Psychological Thriller",
  "crime thriller": "Crime Thriller",
  "political thriller": "Political Thriller",
  "spy fiction": "Spy Thriller",
  "spy thriller": "Spy Thriller",
  "legal thriller": "Legal Thriller",
  "romance": "Romance",
  "romance fiction": "Romance",
  "contemporary romance": "Contemporary Romance",
  "historical romance": "Historical Romance",
  "romantic comedy": "Romantic Comedy",
  "paranormal romance": "Paranormal Romance",
  "dark romance": "Dark Romance",
  "literary fiction": "Literary Fiction",
  "fiction / literary": "Literary Fiction",
  "psychological fiction": "Psychological Fiction",
  "fiction, psychological": "Psychological Fiction",
  "absurdist fiction": "Absurdist Fiction",
  "existential fiction": "Existential Fiction",
  "experimental fiction": "Experimental Fiction",
  "historical fiction": "Historical Fiction",
  "fiction, historical, general": "Historical Fiction",
  "crime": "Crime",
  "crime fiction": "Crime",
  "noir": "Noir",
  "adventure": "Adventure",
  "adventure fiction": "Adventure",
  "action adventure": "Action Adventure",
  "survival fiction": "Survival",
  "classic literature": "Classics",
  "classics": "Classics",
  "fiction / classics": "Classics",
  "young adult fiction": "Young Adult",
  "juvenile fiction": "Young Adult",
  "coming of age": "Coming of Age",
  "coming-of-age fiction": "Coming of Age",
  "middle grade": "Middle Grade",
  "picture books": "Picture Books",
  "comedy": "Comedy",
  "humorous fiction": "Humor",
  "humor": "Humor",
  "satire": "Satire",
  "parody": "Parody",
  "drama": "Drama",
  "tragedy": "Tragedy",
  "nonfiction": "Nonfiction",
  "biography": "Biography",
  "autobiography": "Autobiography",
  "memoir": "Memoir",
  "history": "History",
  "philosophy": "Philosophy",
  "psychology": "Psychology",
  "science": "Science",
  "politics": "Politics",
  "true crime": "True Crime",
  "essays": "Essays",
};

const themeMap = {
    "magic": "Magic",
    "magic and supernatural": "Magic",
    "witches": "Witches",
    "witches in fiction": "Witches",
    "wizards": "Wizards",
    "wizards in fiction": "Wizards",
    "ghosts": "Ghosts",
    "monsters": "Monsters",
    "vampires": "Vampires",
    "school life": "School Life",
    "school stories": "School Life",
    "prisons": "Prisons",
    "alchemy": "Alchemy",
    "orphans": "Orphans",
    "alienation (psychology)": "Alienation",
    "alienation (social psychology)": "Alienation",
    "family": "Family",
    "families": "Family",
    "social problems": "Social Problems",
    "insects": "Transformation",
    "metamorphosis": "Transformation",
};

export function normalizeSubjects(subjects = []) {
  const genres = new Set();
  const themes = new Set();

  for (const subject of subjects || []) {
    if (typeof subject !== "string") continue;
    let cleaned = subject
        .toLowerCase()
        .trim()
        .replace(/^genre:/, "")
        .replace(/\s+/g, " ")
        .trim();
    if (genreMap[cleaned]) {
      genres.add(genreMap[cleaned]);
    }
    if (themeMap[cleaned]) {
      themes.add(themeMap[cleaned]);
    }
  }
  return {
  genres: addParentGenres([...genres]),
  themes: [...themes],
  }
};