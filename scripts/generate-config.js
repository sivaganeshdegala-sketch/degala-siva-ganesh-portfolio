const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
    console.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in your environment or .env file.");
    process.exit(1);
}

const config = `window.__SUPABASE_CONFIG__ = ${JSON.stringify({ url, publishableKey })};\n`;
fs.writeFileSync(path.join(__dirname, "..", "supabase-config.js"), config);
