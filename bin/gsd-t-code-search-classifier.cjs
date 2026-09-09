/**
 * gsd-t-code-search-classifier.cjs
 *
 * M117 - Decide what a shell search command is asking for, so the search guard
 * can stop the ones the code graph should answer.
 *
 * THIS IS NOT gsd-t-grep-classifier.cjs, AND THE DIFFERENCE IS THE POINT.
 * That one feeds a hook that REPLACES grep output, so an unsure answer there
 * means "let grep run" - a wrong guess only costs a missed opportunity. This
 * one feeds a guard that BLOCKS, and under the graph rule an unsure answer is
 * the dangerous direction: a search that proceeds because the classifier could
 * not decide is a search that continued past a failure, which is the fallback
 * the No-Fallback rule bans. So the defaults are inverted here on purpose.
 * Merging the two would force one default onto both callers and silently break
 * whichever one it was not chosen for.
 *
 * Three answers, no fourth:
 *
 *   'structural'   asking who calls / who imports / where something is defined,
 *                  over code. The graph answers this. BLOCK.
 *   'content'      searching text the graph does not index - markdown, JSON,
 *                  SQL, config, prose, comments, log output. ALLOW. This is not
 *                  a loophole: the graph has no answer, so there is nothing to
 *                  route to.
 *   'unclear'      cannot tell. BLOCK, and say so. Never guessed either way.
 *
 * [RULE] search-classifier-unclear-blocks-never-allows
 * [RULE] search-classifier-content-scope-is-what-graph-cannot-index
 * [RULE] search-classifier-missing-input-is-unclear-not-content
 *
 * Zero dependencies. Pure - no filesystem, no spawning, no environment reads.
 */

'use strict';

// --- What the graph indexes ------------------------------------------------
// A search restricted to files OUTSIDE this set is a content search by
// definition: the graph holds nothing about them, so it cannot be the better
// answer. Kept as one shared constant because a second copy is where a
// mismatch hides.
const CODE_EXT = new Set([
  '.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.pyi', '.go', '.rs', '.java', '.rb', '.php',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift', '.kt', '.scala',
]);

// Content the graph does not index, named explicitly so "it is a .md file" is a
// decision rather than an absence of evidence.
const CONTENT_EXT = new Set([
  '.md', '.markdown', '.txt', '.rst',
  '.json', '.jsonl', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.sql', '.csv', '.tsv',
  '.sh', '.bash', '.zsh', '.fish',
  '.html', '.css', '.scss', '.less',
  '.lock', '.log', '.xml', '.svg',
]);

// The search programs this guard governs. `find` is here for `-name`, which is
// a "where does this live" question the graph answers.
const SEARCH_PROGRAMS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ripgrep', 'ag', 'ack', 'find', 'ugrep']);

// Flags whose NEXT argument names a file scope.
const SCOPE_FLAGS = new Set(['--include', '--glob', '-g', '--name', '-name', '-iname']);

// Flags of the form --include=<glob>, carrying the scope inline.
const INLINE_SCOPE_FLAGS = ['--include=', '--glob='];

// A bare identifier - a function, class, or variable name and nothing else.
const BARE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]{1,79}$/;

// A member access or call shape: Obj.method, this.method, foo(
const MEMBER_OR_CALL = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?\(?$/;

// Declaration-hunting shapes. These ask where something is DEFINED.
const DECLARATION_SHAPES = [
  /^(?:async\s+)?function\s+[A-Za-z_$]/,
  /^class\s+[A-Za-z_$]/,
  /^def\s+[A-Za-z_$]/,
  /^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$]/,
  /^func\s+[A-Za-z_$]/,
  /^(?:pub\s+)?fn\s+[A-Za-z_$]/,
];

// Import/require shapes - "who depends on this".
const IMPORT_SHAPES = [
  /\bimport\s/,
  /\bfrom\s+\S+\s+import\b/,
  /\brequire\s*\(/,
  /\bexport\s+(?:default\s+)?(?:function|class|const)\b/,
];

// Multi-word English: an error message or a sentence, not a symbol.
const PROSE_SHAPE = /^[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)+$/;

// A run of characters shaped like an identifier.
const IDENTIFIER_RUN = /[A-Za-z_$][A-Za-z0-9_$]{2,}/;

/**
 * Pull the file extensions a search is scoped to, from its arguments.
 * Returns a Set; empty means "no scope stated".
 */
function scopedExtensions(argv) {
  const found = new Set();

  const addFrom = (s) => {
    if (typeof s !== 'string') return;
    // *.{js,ts} - a brace group naming several at once.
    const brace = s.match(/\*\.\{([^}]+)\}/);
    if (brace) {
      for (const part of brace[1].split(',')) {
        const e = '.' + part.trim().replace(/^\./, '');
        if (e.length > 1) found.add(e.toLowerCase());
      }
      return;
    }
    // *.md, path/to/file.json
    const m = s.match(/\.([A-Za-z0-9]+)$/);
    if (m) found.add(('.' + m[1]).toLowerCase());
  };

  const inlineScopeValue = (arg) => {
    for (const prefix of INLINE_SCOPE_FLAGS) {
      if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    }
    return null;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a !== 'string') continue;

    if (SCOPE_FLAGS.has(a)) {
      addFrom(argv[i + 1]);
      i++;
      continue;
    }

    const inline = inlineScopeValue(a);
    if (inline !== null) {
      addFrom(inline);
      continue;
    }

    // ripgrep -t<type> shorthand: -tmd, -tjs. Counted only when the type names
    // an extension we know; an unknown type states no scope.
    const typeShorthand = a.match(/^-t([a-z]+)$/);
    if (typeShorthand) {
      const asExt = '.' + typeShorthand[1];
      if (CODE_EXT.has(asExt)) found.add(asExt);
      else if (CONTENT_EXT.has(asExt)) found.add(asExt);
      continue;
    }

    if (!a.startsWith('-')) addFrom(a);
  }
  return found;
}

/**
 * Is every extension this search touches outside the graph's index?
 * Only true when a scope was actually stated - an unscoped search reaches code
 * whether or not the pattern looks like prose.
 */
function scopedEntirelyToContent(exts) {
  if (exts.size === 0) return false;
  for (const e of exts) {
    if (!CONTENT_EXT.has(e)) return false;
  }
  return true;
}

function touchesCode(exts) {
  for (const e of exts) {
    if (CODE_EXT.has(e)) return true;
  }
  return false;
}

function asksByFileName(argv) {
  for (const a of argv) {
    if (a === '-name') return true;
    if (a === '-iname') return true;
  }
  return false;
}

/**
 * Classify a search.
 *
 * @param {object} input
 * @param {string} input.pattern   what is being searched for
 * @param {string[]} [input.argv]  the rest of the command's arguments
 * @param {string} [input.program] grep | rg | find | ...
 * @returns {{ verdict:'structural'|'content'|'unclear',
 *             reason:string, symbol:string|null, verb:string|null }}
 */
function classifySearch(input) {
  // A caller that hands over no pattern has not asked a question this can
  // answer. Reporting 'content' would ALLOW the search on the strength of an
  // input that never arrived - deciding by absence of evidence. It is unclear,
  // and unclear blocks.
  if (!input) return unclear('no input was given');
  if (typeof input.pattern !== 'string') return unclear('no search pattern was given');
  const pattern = input.pattern.trim();
  if (!pattern) return unclear('the search pattern was empty');

  const argv = Array.isArray(input.argv) ? input.argv : [];
  const program = typeof input.program === 'string' ? input.program : 'grep';

  const exts = scopedExtensions(argv);

  // Scoped entirely to things the graph does not index. The graph has no
  // answer, so there is nothing to route to.
  if (scopedEntirelyToContent(exts)) {
    return {
      verdict: 'content',
      reason: 'scoped to ' + [...exts].join(', ') + ' - the graph does not index these',
      symbol: null,
      verb: null,
    };
  }

  // `find -name Foo.js` asks where a file lives. The graph knows.
  if (program === 'find' && asksByFileName(argv) && touchesCode(exts)) {
    return {
      verdict: 'structural',
      reason: 'locating a code file by name',
      symbol: pattern.replace(/^\*/, '').replace(/\*$/, ''),
      verb: 'defines',
    };
  }

  // Unmistakable prose: several English words. The graph indexes symbols and
  // edges, not sentences.
  if (PROSE_SHAPE.test(pattern) && pattern.split(/\s+/).length >= 3) {
    return { verdict: 'content', reason: 'a phrase, not a symbol', symbol: null, verb: null };
  }

  // A quoted string literal hunted through the codebase is content.
  if (/^["'].*["']$/.test(pattern) && pattern.length > 12) {
    return { verdict: 'content', reason: 'a string literal', symbol: null, verb: null };
  }

  // --- Structural shapes ---------------------------------------------------
  for (const re of IMPORT_SHAPES) {
    if (re.test(pattern)) {
      return {
        verdict: 'structural',
        reason: 'asking who imports or requires something',
        symbol: extractSymbol(pattern),
        verb: 'who-imports',
      };
    }
  }

  for (const re of DECLARATION_SHAPES) {
    if (re.test(pattern)) {
      return {
        verdict: 'structural',
        reason: 'asking where something is defined',
        symbol: extractSymbol(pattern),
        verb: 'defines',
      };
    }
  }

  if (BARE_IDENT.test(pattern)) {
    return {
      verdict: 'structural',
      reason: 'a bare symbol name - who calls it and who imports it is a graph question',
      symbol: pattern,
      verb: 'who-calls',
    };
  }

  if (MEMBER_OR_CALL.test(pattern)) {
    return {
      verdict: 'structural',
      reason: 'a call or member-access shape',
      symbol: pattern.replace(/\($/, ''),
      verb: 'who-calls',
    };
  }

  // --- Everything left -----------------------------------------------------
  // A regex, a mixed pattern, something with punctuation. It MIGHT be a text
  // search and it might be a symbol hunt wearing a regex. Saying "probably
  // text" here is the guess this classifier exists not to make.
  //
  // One narrowing first: a pattern holding no identifier-shaped run has nothing
  // the graph could be asked about, whatever else it is.
  if (!IDENTIFIER_RUN.test(pattern)) {
    return {
      verdict: 'content',
      reason: 'no symbol-shaped text in the pattern',
      symbol: null,
      verb: null,
    };
  }

  return unclear('could be a symbol hunt or a text search - it has to be said which');
}

function unclear(reason) {
  return { verdict: 'unclear', reason, symbol: null, verb: null };
}

// Pull the most likely symbol out of a declaration/import pattern, for the
// suggested graph command. Null when nothing identifier-shaped is present.
function extractSymbol(pattern) {
  const trailing = pattern.match(/([A-Za-z_$][A-Za-z0-9_$]{1,})\s*$/);
  if (trailing) return trailing[1];
  const anywhere = pattern.match(/([A-Za-z_$][A-Za-z0-9_$]{1,})/);
  if (anywhere) return anywhere[1];
  return null;
}

module.exports = { classifySearch, CODE_EXT, CONTENT_EXT, SEARCH_PROGRAMS };
