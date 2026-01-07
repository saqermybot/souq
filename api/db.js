import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

export const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

// init schema
const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
db.exec(schema);

export function nowMs(){ return Date.now(); }
