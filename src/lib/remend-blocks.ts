import remend from "remend";

/**
 * Fix heading syntax: add space after # marks.
 */
function fixHeadings(text: string): string {
  return text.replace(/^(#{1,6})([^\s#])/gm, "$1 $2");
}

/**
 * Cap heading level at 6 (####### → ######).
 */
function fixHeadingOverflow(text: string): string {
  return text.replace(/^#{7,}(\s)/gm, "######$1");
}

/**
 * Fix blockquote spacing: >text → > text
 */
function fixBlockquoteSpacing(text: string): string {
  return text.replace(/^(>+)([^\s>])/gm, "$1 $2");
}

/**
 * Fix spaced bold markers: * *text* * → **text**
 */
function fixSpacedBoldMarkers(text: string): string {
  return text.replace(/\* \*([^*]+)\* \*/g, "**$1**");
}

/**
 * Fix list markers missing a space: "*text" → "* text", "-text" → "- text"
 */
function fixListMarkerSpacing(text: string): string {
  return text.replace(/^(\s*)([-*+])(?=[^\s\-*+`~#])/gm, "$1$2 ");
}

/**
 * Fix table rows missing trailing pipe: | a | b → | a | b |
 */
function fixTableTrailingPipe(text: string): string {
  return text.replace(/^(\|.+[^|\s])\s*$/gm, "$1 |");
}

/**
 * Fix space between link bracket and paren: [text] (url) → [text](url)
 */
function fixLinkBracketSpace(text: string): string {
  return text.replace(/\]\s+\(([^)]+)\)/g, "]($1)");
}

/**
 * Fix asymmetric bold/italic/strikethrough markers.
 *
 * Strategy: promote the shorter side to match the longer side.
 * For *** patterns, process before ** to avoid partial matches.
 * Guard: skip ** asymmetric fix if line already has balanced ** pairs (nested formatting).
 */
function fixAsymmetricMarkers(line: string): string {
  // --- *** bold-italic asymmetric ---
  // ***text** → ***text***
  line = line.replace(/(?<!\*)\*{3}(?!\*)((?:(?!\*{1,3}).)+?)\*{2}(?!\*)/g, "***$1***");
  // ***text* → ***text***
  line = line.replace(/(?<!\*)\*{3}(?!\*)((?:(?!\*{1,3}).)+?)\*(?!\*)/g, "***$1***");

  // --- ** bold asymmetric ---
  // Guard: if line has 2+ occurrences of **, the pairs are likely balanced
  // and a lone * inside is nested italic — don't promote it.
  const doubleStarCount = (line.match(/\*\*/g) || []).length;
  if (doubleStarCount < 2) {
    // *text** → **text**
    line = line.replace(/(?<!\*)\*(?!\*|\s)((?:(?!\*{2}).)+?)\*{2}(?!\*)/g, "**$1**");
    // **text* → **text** (lookahead allows space/punctuation/EOL after closing)
    line = line.replace(
      /(?<!\*)\*{2}(?!\*)((?:(?!\*).)+?)\*(?!\*)/g,
      "**$1**"
    );
  }

  // --- __ underscore bold asymmetric ---
  // _text__ → __text__
  line = line.replace(/(?<!_)_(?!_|\s)((?:(?!_{2}).)+?)_{2}(?!_)/g, "__$1__");
  // __text_ → __text__
  line = line.replace(/(?<!_)_{2}(?!_)((?:(?!_).)+?)_(?!_)/g, "__$1__");

  // --- ~~ strikethrough asymmetric ---
  // ~text~~ → ~~text~~
  line = line.replace(/(?<!~)~(?!~|\s)((?:(?!~~).)+?)~~(?!~)/g, "~~$1~~");
  // ~~text~ → ~~text~~
  line = line.replace(/(?<!~)~~(?!~)((?:(?!~).)+?)~(?!~)/g, "~~$1~~");

  return line;
}

/**
 * Fix unclosed inline math: $E=mc^2 text → $E=mc^2$ text
 * Only when content looks like math (contains =, ^, \, {, }, etc.)
 */
function fixUnclosedInlineMath(line: string): string {
  // Match $ (not $$) followed by math-like content, then space+text
  return line.replace(
    /(?<!\$)\$(?!\$)([^$\n]*?[=^\\{}+\-*/∑∫∏])([^$\n]*?)(\s+)/g,
    (match, mathStart, mathEnd, space) => {
      // Only fix if there's no closing $ later in the line
      const afterMatch = line.indexOf(match) + match.length;
      const rest = line.substring(afterMatch);
      if (rest.includes("$")) return match;
      return "$" + mathStart + mathEnd.trimEnd() + "$" + space;
    }
  );
}

/**
 * Fix unclosed link URLs: [text](url rest → [text](url) rest
 * Must run before remend to prevent remend from replacing with streamdown:incomplete-link.
 */
function fixUnclosedLinkUrl(line: string): string {
  // Match [text](url-without-closing-paren followed by space+text or EOL
  return line.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)(\s)/g,
    "[$1]($2)$3"
  );
}

/**
 * Fix unclosed image URLs: ![alt](url → ![alt](url)
 * Must run before remend to prevent remend from deleting the image.
 */
function fixUnclosedImageUrl(line: string): string {
  return line.replace(/!\[([^\]]*)\]\(([^)\s]+)$/gm, "![$1]($2)");
}

/**
 * Fix asymmetric double backticks: ``code` → ``code``
 */
function fixAsymmetricBackticks(line: string): string {
  // ``code` rest → ``code`` rest
  return line.replace(/(`{2,})([^`]+?)`(?!`)/g, (match, open, content) => {
    return open + content + open;
  });
}

/**
 * Fix unclosed formatting inside link text: [**text](url) → [**text**](url)
 */
function fixUnclosedMarkersInLinkText(line: string): string {
  return line.replace(
    /\[(\*{1,3}|_{1,2}|`{1,2}|~~)([^\]]*?)\]\(/g,
    (match, marker, text) => {
      if (text.includes(marker)) return match; // already closed
      return "[" + marker + text + marker + "](";
    }
  );
}

/**
 * Fix unclosed italic inside bold: **text *italic** → **text *italic***
 * Adds the missing * before the closing ** so the italic is properly closed.
 */
function fixNestedUnclosedItalic(line: string): string {
  // Match **...text *content** where the inner * has no closing pair before **
  return line.replace(
    /(\*\*[^*]*)\*([^*]+)\*\*(?!\*)/g,
    (match, before, inner) => {
      // Check the inner * isn't already paired
      if (inner.includes("*")) return match;
      return before + "*" + inner + "***";
    }
  );
}

/**
 * Fix unclosed inline code before bold closure: `code** → `code`**
 */
function fixNestedUnclosedCode(line: string): string {
  // Only apply when backtick count is odd (unclosed)
  const ticks = (line.match(/`/g) || []).length;
  if (ticks % 2 === 0) return line;
  // `content** → `content`**
  return line.replace(/`([^`]+?)(\*{2,3})/, "`$1`$2");
}

/**
 * Fix unclosed inline code with code-like token: `console.log text → `console.log` text
 * Applied before remend to place the closing backtick correctly.
 */
function fixUnclosedInlineCode(line: string): string {
  const ticks = (line.match(/`/g) || []).length;
  if (ticks % 2 === 0) return line;
  // `identifier.chain(args) rest → `identifier.chain(args)` rest
  return line.replace(
    /`([\w$][\w.$]*(?:\([^)]*\))?(?:\.[\w$]+(?:\([^)]*\))?)*)(\s)/,
    "`$1`$2"
  );
}

/**
 * Represents a segment of text that is syntactically ambiguous
 * and needs LLM assistance to determine the correct fix.
 */
export interface AmbiguousSegment {
  /** Unique identifier */
  id: string;
  /** The original ambiguous text */
  original: string;
  /** Surrounding context for the LLM */
  context: string;
  /** What the syntactic fixer chose to do */
  syntacticFix: string;
  /** Line number (0-based) in the original text */
  lineIndex: number;
}

/**
 * Detect syntactically ambiguous patterns in the original (pre-fix) text.
 * These are patterns where multiple valid interpretations exist and
 * only semantic understanding can determine the correct fix.
 *
 * Categories:
 * A. Asymmetric emphasis markers (* / _ count mismatch)
 * B. Dollar sign: inline math vs. currency
 * C. Link-like image: [desc](img-url) missing ! prefix
 * D. Star/underscore in arithmetic/identifiers: formatting vs. literal
 * E. Unclosed code block with ambiguous boundary
 * F. Backtick delimiter grouping ambiguity
 */
export function findAmbiguousPatterns(text: string): AmbiguousSegment[] {
  if (!text) return [];
  const segments: AmbiguousSegment[] = [];
  const lines = text.split("\n");
  let id = 0;

  // Helper to extract context around a match
  const ctx = (line: string, start: number, end: number, pad = 15) => {
    const before = line.substring(Math.max(0, start - pad), start);
    const after = line.substring(end, Math.min(line.length, end + pad));
    return before + line.substring(start, end) + after;
  };

  // Track code block state to skip code content
  let inCode = false;
  let codeFence = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Track code blocks — skip content inside
    if (!inCode) {
      const fm = trimmed.match(/^(`{3,}|~{3,})/);
      if (fm) { inCode = true; codeFence = fm[1][0].repeat(fm[1].length); continue; }
    } else {
      if (trimmed.startsWith(codeFence) && trimmed.slice(codeFence.length).trim() === "") {
        inCode = false; codeFence = "";
      }
      continue;
    }

    let m;

    // --- A1: **text* or *text** (1 vs 2 stars) ---
    const asymBold = /(?<!\*)\*{2}(?!\*)((?:(?!\*).)+?)\*(?!\*)/g;
    while ((m = asymBold.exec(line)) !== null) {
      segments.push({
        id: `amb-${id++}`,
        original: m[0],
        context: ctx(line, m.index, m.index + m[0].length),
        syntacticFix: "**" + m[1] + "**",
        lineIndex: i,
      });
    }

    // --- A2: ***text** or ***text* (3 vs 2 or 3 vs 1 stars) ---
    const asymBoldItalic = /(?<!\*)\*{3}(?!\*)((?:(?!\*{1,3}).)+?)\*{1,2}(?!\*)/g;
    while ((m = asymBoldItalic.exec(line)) !== null) {
      const closeStars = m[0].match(/\*+$/)![0];
      if (closeStars.length === 3) continue; // balanced
      segments.push({
        id: `amb-${id++}`,
        original: m[0],
        context: ctx(line, m.index, m.index + m[0].length),
        syntacticFix: "***" + m[1] + "***",
        lineIndex: i,
      });
    }

    // --- A3: __text_ or _text__ (underscore asymmetry) ---
    const asymUnderscore = /(?<!_)_{1,2}(?!_)((?:(?!_).)+?)_{1,2}(?!_)/g;
    while ((m = asymUnderscore.exec(line)) !== null) {
      const openCount = m[0].match(/^_+/)![0].length;
      const closeCount = m[0].match(/_+$/)![0].length;
      if (openCount === closeCount) continue;
      segments.push({
        id: `amb-${id++}`,
        original: m[0],
        context: ctx(line, m.index, m.index + m[0].length),
        syntacticFix: "__" + m[0].replace(/^_+|_+$/g, "") + "__",
        lineIndex: i,
      });
    }

    // --- B: Lone $ — math delimiter vs. currency ---
    // Match $<content> where content has no closing $ on the same line
    const dollarRe = /(?<!\$)\$(?!\$)([^$\n]+)/g;
    while ((m = dollarRe.exec(line)) !== null) {
      const content = m[1];
      const restOfLine = line.substring(m.index + m[0].length);
      // Only ambiguous if there's no closing $ (unclosed)
      if (restOfLine.includes("$")) continue;
      // Must have some content that could plausibly be math OR currency
      const looksLikeCurrency = /^\d/.test(content.trim());
      const looksLikeMath = /[=^\\{}∑∫]/.test(content);
      // It's ambiguous when it could be either
      if (looksLikeCurrency || looksLikeMath) {
        segments.push({
          id: `amb-${id++}`,
          original: m[0],
          context: ctx(line, m.index, m.index + m[0].length),
          syntacticFix: looksLikeMath
            ? "$" + content.trim() + "$"
            : m[0], // leave as-is for currency
          lineIndex: i,
        });
      }
    }

    // --- C: [desc](image-url) without ! — image vs. link ---
    const imgLinkRe = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)]+\.(?:png|jpe?g|gif|svg|webp|bmp|ico))\)/gi;
    while ((m = imgLinkRe.exec(line)) !== null) {
      segments.push({
        id: `amb-${id++}`,
        original: m[0],
        context: ctx(line, m.index, m.index + m[0].length),
        syntacticFix: m[0], // current fixer leaves as link
        lineIndex: i,
      });
    }

    // --- D: *text* between digits/identifiers — formatting vs. literal ---
    // e.g., 3*4*5 (multiplication), my_project_name (identifier)
    const literalStarRe = /(\d)\*([^*\s]+)\*(\d)/g;
    while ((m = literalStarRe.exec(line)) !== null) {
      segments.push({
        id: `amb-${id++}`,
        original: m[0],
        context: ctx(line, m.index, m.index + m[0].length),
        syntacticFix: m[0], // fixer leaves as-is (renders as italic)
        lineIndex: i,
      });
    }
    const literalUnderRe = /\w_([\w]+(?:\/[\w]+)*)_\w/g;
    while ((m = literalUnderRe.exec(line)) !== null) {
      // Skip if it looks like a file path or snake_case
      if (/[/\\.]/.test(m[0]) || /^[a-z]/.test(m[0])) {
        segments.push({
          id: `amb-${id++}`,
          original: m[0],
          context: ctx(line, m.index, m.index + m[0].length),
          syntacticFix: m[0],
          lineIndex: i,
        });
      }
    }

    // --- F: Backtick content containing backticks — delimiter grouping ---
    // e.g., `let x = `hello`` — ambiguous delimiter boundaries
    const nestedTickRe = /`[^`]*`[^`]*`/g;
    while ((m = nestedTickRe.exec(line)) !== null) {
      // Count total backticks — if > 2, it's potentially ambiguous
      const tickCount = (m[0].match(/`/g) || []).length;
      if (tickCount <= 2) continue;
      segments.push({
        id: `amb-${id++}`,
        original: m[0],
        context: ctx(line, m.index, m.index + m[0].length),
        syntacticFix: m[0],
        lineIndex: i,
      });
    }
  }

  // --- E: Unclosed code block with ambiguous boundary ---
  // If a code block is unclosed and there are blank lines followed by
  // lines that could be either code or markdown, flag it
  inCode = false;
  codeFence = "";
  let codeStart = -1;
  let blankAfterCode = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (!inCode) {
      const fm = trimmed.match(/^(`{3,}|~{3,})/);
      if (fm) {
        inCode = true;
        codeFence = fm[1][0].repeat(fm[1].length);
        codeStart = i;
        blankAfterCode = -1;
      }
    } else {
      if (trimmed.startsWith(codeFence) && trimmed.slice(codeFence.length).trim() === "") {
        inCode = false;
        codeFence = "";
        continue;
      }
      if (trimmed === "" && blankAfterCode < 0) {
        blankAfterCode = i;
      }
      // If we see a blank line then markdown-like content, this boundary is ambiguous
      if (blankAfterCode >= 0 && trimmed !== "") {
        const mdLike = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|!\[|\[.+\]\()/.test(trimmed);
        if (mdLike) {
          const codeContent = lines.slice(codeStart, blankAfterCode + 1).join("\n");
          segments.push({
            id: `amb-${id++}`,
            original: codeContent,
            context: `代码块起始行${codeStart + 1}，空行在第${blankAfterCode + 1}行，之后出现 Markdown 语法：${trimmed.substring(0, 30)}`,
            syntacticFix: codeContent + "\n" + codeFence,
            lineIndex: codeStart,
          });
          // Only flag once per code block
          inCode = false;
          codeFence = "";
        }
      }
    }
  }

  return segments;
}

/**
 * Apply LLM fixes to the syntactically-fixed text.
 * Replaces syntactic fixes with LLM-determined fixes for ambiguous segments.
 */
export function applyLLMFixes(
  syntacticResult: string,
  ambiguousSegments: AmbiguousSegment[],
  llmFixes: { id: string; fixed: string }[]
): string {
  let result = syntacticResult;
  for (const fix of llmFixes) {
    const seg = ambiguousSegments.find((s) => s.id === fix.id);
    if (!seg) continue;
    // Replace the syntactic fix with the LLM fix
    result = result.replace(seg.syntacticFix, fix.fixed);
  }
  return result;
}

/**
 * Check if a line looks like markdown syntax that would NEVER appear in code.
 */
function looksLikeMarkdownNotCode(line: string): boolean {
  const t = line.trimStart();
  return (
    /^>\s?.+/.test(t) ||             // blockquote with content
    /^\|.+\|/.test(t) ||            // table row (pipes on both sides)
    /^\[.+\]\(/.test(t) ||          // link at start of line
    /^!\[/.test(t)                   // image
  );
}

/**
 * Apply remend + custom fixes to markdown text.
 *
 * Pipeline:
 * 1. Global pre-processing (headings, lists, blockquotes, tables, links, markers)
 * 2. Per-line processing with math/code block state tracking
 * 3. Per-line pre-processing before remend (inline math, images, backticks, nested)
 * 4. remend() call
 */
export function remendByBlocks(text: string): string {
  if (!text) return text;

  // === Global pre-processing ===
  text = fixHeadings(text);
  text = fixHeadingOverflow(text);
  text = fixBlockquoteSpacing(text);
  text = fixSpacedBoldMarkers(text);
  text = text.split("\n").map(fixAsymmetricMarkers).join("\n");
  text = fixListMarkerSpacing(text);
  text = fixTableTrailingPipe(text);
  text = fixLinkBracketSpace(text);

  const result: string[] = [];
  const lines = text.split("\n");

  let inCodeBlock = false;
  let codeFence = "";
  let codeBlockLines: string[] = [];
  let blankLineIdx = -1;

  let inMathBlock = false;
  let mathBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // --- Math block tracking (must be before code block) ---
    if (!inCodeBlock && !inMathBlock) {
      if (trimmed === "$$") {
        inMathBlock = true;
        mathBlockLines = [line];
        continue;
      }
    } else if (inMathBlock) {
      if (trimmed === "$$") {
        mathBlockLines.push(line);
        result.push(mathBlockLines.join("\n"));
        mathBlockLines = [];
        inMathBlock = false;
        continue;
      }
      if (trimmed === "$") {
        // Fix asymmetric closing: $ → $$
        mathBlockLines.push("$$");
        result.push(mathBlockLines.join("\n"));
        mathBlockLines = [];
        inMathBlock = false;
        continue;
      }
      mathBlockLines.push(line);
      continue;
    }

    // --- Code block tracking ---
    if (!inCodeBlock) {
      const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        inCodeBlock = true;
        codeFence = fenceMatch[1][0].repeat(fenceMatch[1].length);
        codeBlockLines = [line];
        blankLineIdx = -1;
        continue;
      }
    } else {
      // Check for proper closing fence (exact match)
      if (trimmed.startsWith(codeFence) && trimmed.slice(codeFence.length).trim() === "") {
        codeBlockLines.push(line);
        result.push(codeBlockLines.join("\n"));
        codeBlockLines = [];
        inCodeBlock = false;
        codeFence = "";
        blankLineIdx = -1;
        continue;
      }

      // Check for near-match closing fence (fewer backticks/tildes)
      // A near-match is a line with only fence chars (no language info) that
      // has fewer chars than the opening fence. For nested fences (e.g., ```
      // inside ````), we skip: a line of exactly 3 backticks inside a 4+
      // backtick fence is likely an inner fence, not a near-match close.
      const fenceChar = codeFence[0];
      const nearFenceRe = fenceChar === "`" ? /^(`{2,})\s*$/ : /^(~{2,})\s*$/;
      const nearMatch = trimmed.match(nearFenceRe);
      // Only treat as near-match if: fewer than the fence, AND it looks like
      // a mistyped close (not a valid inner fence opening). Inner fences have
      // 3+ chars; a near-match close of a 3-char fence would be 2 chars (``).
      const isNearClose = nearMatch
        && nearMatch[1].length < codeFence.length
        && nearMatch[1].length < 3; // 2 backticks can't start an inner fence
      if (isNearClose) {
        // Replace with correct fence
        const indent = line.substring(0, line.length - trimmed.length);
        codeBlockLines.push(indent + codeFence);
        result.push(codeBlockLines.join("\n"));
        codeBlockLines = [];
        inCodeBlock = false;
        codeFence = "";
        blankLineIdx = -1;
        continue;
      }

      // Heuristic: blank line + markdown syntax = code block boundary
      if (blankLineIdx >= 0 && trimmed !== "" && looksLikeMarkdownNotCode(line)) {
        const codeContent = codeBlockLines.slice(0, blankLineIdx);
        const afterBlank = codeBlockLines.slice(blankLineIdx);
        result.push(codeContent.join("\n") + "\n" + codeFence);
        inCodeBlock = false;
        codeFence = "";
        codeBlockLines = [];
        blankLineIdx = -1;
        for (const buffered of afterBlank) {
          const bt = buffered.trimStart();
          if (bt === "") {
            result.push("");
          } else {
            result.push(applyLineFixes(buffered));
          }
        }
        // Process current line (fall through below)
      } else {
        if (trimmed === "") {
          blankLineIdx = codeBlockLines.length;
        }
        codeBlockLines.push(line);
        continue;
      }
    }

    // --- Regular line (outside code/math blocks) ---
    if (trimmed === "") {
      result.push("");
    } else {
      result.push(applyLineFixes(line));
    }
  }

  // Handle unclosed math block at end
  if (inMathBlock && mathBlockLines.length > 0) {
    result.push(mathBlockLines.join("\n") + "\n$$");
  }

  // Handle unclosed code block at end
  if (inCodeBlock && codeBlockLines.length > 0) {
    result.push(codeBlockLines.join("\n") + "\n" + codeFence);
  }

  return result.join("\n");
}

/**
 * Apply per-line pre-processing, remend, then post-processing.
 */
function applyLineFixes(line: string): string {
  let processed = line;
  processed = fixUnclosedInlineMath(processed);
  processed = fixUnclosedLinkUrl(processed);
  processed = fixUnclosedImageUrl(processed);
  processed = fixAsymmetricBackticks(processed);
  processed = fixUnclosedMarkersInLinkText(processed);
  processed = fixNestedUnclosedItalic(processed);
  processed = fixNestedUnclosedCode(processed);
  processed = fixUnclosedInlineCode(processed);
  processed = remend(processed, { katex: false, inlineKatex: false });
  return processed;
}
