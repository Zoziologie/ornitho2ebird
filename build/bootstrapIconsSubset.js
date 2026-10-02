import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import subsetFont from "subset-font";

const require = createRequire(import.meta.url);
const ICONS_CSS_SUFFIX = "bootstrap-icons/font/bootstrap-icons.css";
const SOURCE_EXTENSIONS = new Set([".vue", ".js", ".html"]);

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }
      return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
    }),
  );
  return files.flat();
}

// Ship only the icons the app uses (~55 of ~2000): replaces the 134 KB woff2 and
// ~85 KB of CSS with a few KB. Icon names are found by scanning the sources for
// "bi-<name>", so they must appear literally (not built from string fragments).
// Build only: the dev server keeps the full font.
export default function bootstrapIconsSubset({ root = process.cwd(), sourceDirs = ["src"] } = {}) {
  return {
    name: "bootstrap-icons-subset",
    apply: "build",
    enforce: "pre",
    async transform(code, id) {
      if (!id.split("?")[0].endsWith(ICONS_CSS_SUFFIX)) {
        return null;
      }

      const codepoints = JSON.parse(
        await readFile(require.resolve("bootstrap-icons/font/bootstrap-icons.json"), "utf8"),
      );
      const files = [path.join(root, "index.html")];
      for (const directory of sourceDirs) {
        files.push(...(await listSourceFiles(path.join(root, directory))));
      }

      const used = new Set();
      for (const file of files) {
        const text = await readFile(file, "utf8");
        for (const match of text.matchAll(/\bbi-([a-z0-9-]+)/g)) {
          if (codepoints[match[1]] !== undefined) {
            used.add(match[1]);
          }
        }
      }

      const names = [...used].sort();
      const font = await readFile(require.resolve("bootstrap-icons/font/fonts/bootstrap-icons.woff2"));
      const subset = await subsetFont(font, String.fromCodePoint(...names.map((name) => codepoints[name])), {
        targetFormat: "woff2",
      });

      // Keep the library's shared ".bi::before" rule, drop the per-icon rules and font URLs.
      const baseRule = code.slice(code.indexOf(".bi::before"), code.indexOf("}", code.indexOf(".bi::before")) + 1);
      const iconRules = names
        .map((name) => `.bi-${name}::before { content: "\\${codepoints[name].toString(16)}"; }`)
        .join("\n");

      return {
        code: `@font-face {
  font-display: block;
  font-family: "bootstrap-icons";
  src: url("data:font/woff2;base64,${subset.toString("base64")}") format("woff2");
}

${baseRule}

${iconRules}
`,
        map: null,
      };
    },
  };
}
