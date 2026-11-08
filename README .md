LIBSQUE is a web application that combines book discovery, personal library management, in-browser reading, and reader-to-reader connections. It brings a reader's bookshelf and literary preferences into a social experience built around shared books, genres, and interests.

The project is currently being prepared for **private beta**. Its social data is stored in Appwrite. A permanent public deployment is not decided yet.

## Features(till now):

### Book discovery and personal libraries

- Search for books and explore their details using external catalog metadata.
- Maintain a personal shelf with reading status, ratings, and favorites.
- Build a **Reader DNA** profile from cataloged books and reading preferences.
- Discover available reading formats and distinguish full-text access from limited previews.

### In-browser reading

- Read supported EPUBs, accessible documents, and provider-hosted books through a unified reading interface.
- Access eligible public-domain and open-access books through integrated content sources.
- Use reading preferences and progress tracking where supported by the reading format.
- Continue to an external provider when a title is only available as a preview, audiobook, or authorized external reading option.

Full-book availability varies by title, edition, provider, license, and jurisdiction. LIBSQUE does not guarantee free full-text access to every listed book.

### Reader discovery and connections

- Opt into reader discovery and curate up to five showcased books.
- Browse readers with compatible literary tastes.
- View **Reading Compatibility** scores with explanations based on available reading data.
- Express friendship or dating interest and form a connection when interest is mutual.
- Manage visibility, connection preferences, blocks, and reports.

Private messaging and real-time chat are **not implemented** in the current version.

## Technology stack

- Frontend : React, Vite, Tailwind CSS, React Router 
- Backend : Node.js, Express 
- Authentication : Appwrite Authentication 
- Persistent data : Appwrite
- Book metadata and availability : Open Library, Project Gutenberg, Directory of Open Access Books (DOAB), Google Books, Internet Archive 
- Reading and audio : EPUB.js and supported provider integrations, including LibriVox discovery |
- Deployment target : Render Free Web Service(for now)

## Architecture

```text
React application (Vite)
        |
        | Same-origin requests in production
        v
Node.js / Express server
        |-- Book search, availability, and content endpoints
        |-- Social discovery and matching endpoints
        |-- Production React static assets
        |
        +--> Appwrite Authentication and TablesDB
        |
        +--> External book and reading providers
```

### Prerequisites

- Node.js and npm compatible with the project's dependencies.
- An Appwrite project configured for Authentication and TablesDB.
- The existing application tables described below.
- Access to the relevant third-party book APIs, where applicable.

### 1. Install dependencies

```terminal
npm ci
```

### 2. Configure environment variables

Create a `.env` file in the project root. Use your own Appwrite identifiers and backend credentials; the names below reflect the current project configuration.

```dotenv

VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_appwrite_project_id
VITE_APPWRITE_DATABASE_ID=your_appwrite_database_id
VITE_APPWRITE_PROFILES_COLLECTION_ID=your_profiles_table_id
VITE_APPWRITE_LIBRARY_COLLECTION_ID=your_library_entries_table_id
VITE_GOOGLE_BOOKS_API_KEY=your_restricted_google_books_api_key
APPWRITE_API_KEY=your_server_api_key
SOCIAL_STORAGE_ENGINE=tablesdb
DOAB_ADMIN_KEY=your_doab_admin_secret
ADMIN_API_KEY=your_moderation_admin_secret
```

### 3. Configure Appwrite TablesDB

In addition to `profiles` and `library_entries`, the social system uses six tables:

| Table | Purpose |
| --- | --- |
| `social_preferences` | Discovery opt-in and connection preferences |
| `social_showcased_favorites` | Books selected for public showcase |
| `social_interests` | Confidential one-sided interests |
| `social_matches` | Mutual connections |
| `social_blocks` | User blocking relationships |
| `social_reports` | Confidential moderation reports |

These tables require the columns, indexes, and access rules expected by the backend. They are configured as **server-mediated**, with no general client permissions. The repository includes a schema verification utility:

```terminal
node scripts/verifyTablesDbSchema.js
```

### 4. Run locally

Start the Express backend:

```terminal
npm start
```

In a second terminal, start Vite:

```terminal
npm run dev
```

The default local development addresses are:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Book sources and availability

LIBSQUE combines metadata discovery with format-specific availability checks. A search result does not necessarily represent a downloadable book.

| Source | Role in LIBSQUE |
| --- | --- |
| Open Library | Book and edition metadata, covers, and reading links |
| Project Gutenberg | Eligible public-domain ebook discovery and reading |
| DOAB | Open-access scholarly books and supported EPUB/PDF links |
| Google Books | Book metadata and permitted full or partial previews |
| Internet Archive | Available scans, borrowing, and external reading options, subject to provider access rules |
| LibriVox | Discovery of available public-domain audiobooks |

The application distinguishes verified full-text reading from limited previews where the source provides that information. Availability can change, and access restrictions imposed by publishers or providers still apply.

**Copyright and licensing:** Rights may vary by edition, translation, country, and provider. Content must only be cached, hosted, or redistributed when the relevant rights and terms permit it. Inclusion in a catalog is not proof that an ebook may be redistributed.

## Privacy and safety

LIBSQUE's reader discovery and matching features are designed around user choice:

- Discovery is off by default until a reader opts in.
- Friendship and dating intentions are separate preferences.
- One-sided interests are not disclosed as matches.
- Blocking prevents discovery and interaction between users.

Dating mode currently relies on **adult self-attestation**. This is not independent age or identity verification.

## Deployment status

A Render Free Web Service configuration is being prepared for the private beta rn. The intended deployment runs the React production build and Express backend on a single hostname, while Appwrite stores the user and social records.

No permanent public demo URL will be included until the deployment has been completed and verified.

## Project structure

Selected files and directories relevant to the current architecture:

```text
LIBSQUE/
├── public/                       # Public assets and eligible bundled reading files
├── src/
│   ├── pages/                    # Search, library, profiles, discovery, reader pages
│   ├── services/                 # Social storage adapters
│   └── utils/                    # Availability and Reader DNA utilities
├── scripts/                      # Catalog maintenance and verification utilities
├── data/                         # Local catalog indexes and runtime data
├── server.js                     # Express application and API routes
├── package.json
└── render.yaml                   # Private beta hosting configuration
```

Directory contents and deployment configuration may evolve/change during beta preparation.

## Development and AI assistance

LIBSQUE has been developed with the assistance of AI tools. **Google Antigravity** has been used to refactor application code, investigate defects, run development checks, and prepare database migration and deployment changes. **ChatGPT** has been used for technical planning, architectural review, troubleshooting guidance, and documentation support.

Project direction, feature selection, acceptance testing, and decisions about what to retain or change have been guided by Me. AI-generated work is treated as implementation assistance and subject to review and testing.

## Current project status

LIBSQUE is still under active development, with core reading, library, discovery, and matching functionality implemented. The immediate focus is production-readiness testing and a limited private beta; messaging and additional social features are deferred(for now).
