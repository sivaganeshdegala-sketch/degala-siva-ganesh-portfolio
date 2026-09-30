const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const excluded = new Set([".git", "node_modules", "dist", ".github", "scripts", "db", "supabase"]);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name === ".env" || entry.name.startsWith(".env.")) continue;
    if (["package.json", "package-lock.json", ".gitignore"].includes(entry.name)) continue;
    fs.cpSync(path.join(root, entry.name), path.join(output, entry.name), { recursive: true });
}

for (const routeFile of ["admin.html", "404.html"]) {
    fs.copyFileSync(path.join(output, "index.html"), path.join(output, routeFile));
}
