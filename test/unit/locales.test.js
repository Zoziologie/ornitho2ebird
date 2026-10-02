import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const localesDir = fileURLToPath(new URL("../../src/locales/", import.meta.url));
const locales = Object.fromEntries(
  readdirSync(localesDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => [file.replace(".json", ""), JSON.parse(readFileSync(localesDir + file, "utf8"))]),
);
const en = locales.en;
const translations = Object.entries(locales).filter(([language]) => language !== "en");

function placeholders(message) {
  return [...new Set([...String(message).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

describe("locales", () => {
  it("include English and the translations", () => {
    expect(Object.keys(locales).sort()).toEqual(["ca", "de", "en", "fr", "it"]);
  });

  it.each(translations)("%s has exactly the English keys", (language, messages) => {
    expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(translations)("%s uses the same {placeholders} as English", (language, messages) => {
    const mismatches = Object.keys(en)
      .filter((key) => key in messages)
      .filter((key) => placeholders(messages[key]).join() !== placeholders(en[key]).join())
      .map((key) => `${key}: en {${placeholders(en[key])}} vs ${language} {${placeholders(messages[key])}}`);
    expect(mismatches).toEqual([]);
  });

  it.each(Object.entries(locales))("%s has no empty messages", (language, messages) => {
    expect(Object.keys(messages).filter((key) => String(messages[key]).trim() === "")).toEqual([]);
  });
});
