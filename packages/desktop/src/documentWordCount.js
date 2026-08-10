const cjkCharacterPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function readableMarkdownText(markdown) {
  return String(markdown || "")
    .replace(/^\s*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*(?:#{1,6}|>|[-+*]\s+\[[ xX]\]|[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[*_~`|]/g, " ")
    .replace(/\\([\\`*{}[\]()#+\-.!_>])/g, "$1");
}

export function countDocumentWords(markdown) {
  const readableText = readableMarkdownText(markdown);
  const cjkCharacters = readableText.match(cjkCharacterPattern) || [];
  const spacedLanguageWords = readableText
    .replace(cjkCharacterPattern, " ")
    .match(wordPattern) || [];
  return cjkCharacters.length + spacedLanguageWords.length;
}
