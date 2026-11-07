import { loadEnvFile } from "./socialStoreCommon.js";
loadEnvFile();

import { socialStoreJson } from "./socialStoreJson.js";
import { socialStoreTablesDb } from "./socialStoreTablesDb.js";

const engine = (process.env.SOCIAL_STORAGE_ENGINE || "json").toLowerCase();

export const activeSocialStore = engine === "tablesdb" || engine === "appwrite"
  ? socialStoreTablesDb
  : socialStoreJson;

export const currentEngine = engine;
export { socialStoreTablesDb, socialStoreJson };

