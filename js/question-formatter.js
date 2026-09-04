/**
 * UPSC Prelims Battle Arena — Intelligent Question & Statement Formatter
 * Parses and formats complex UPSC question styles:
 * 1. Match List I & List II (tabular 2-column side-by-side comparison & code matrix)
 * 2. Numbered statements (1., 2., 3., 4.) with distinct statement cards
 * 3. Pairs format (Term — Definition / Location — State)
 * 4. Code & concluding directives (e.g. 'Select the correct answer using the code given below')
 */

export function formatQuestionHTML(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  const text = rawText.trim();

  // ----------------------------------------------------
  // Style 1: Match List I with List II (Tabular Format)
  // ----------------------------------------------------
  if (/Match List/i.test(text) && /List\s*(?:I|1|II|2)/i.test(text)) {
    const formattedMatch = parseAndFormatMatchQuestion(text);
    if (formattedMatch) return formattedMatch;
  }

  // ----------------------------------------------------
  // Style 2: Numbered Statements (1., 2., 3., 4.)
  // ----------------------------------------------------
  if (hasNumberedStatements(text)) {
    const formattedStatements = parseAndFormatNumberedStatements(text);
    if (formattedStatements) return formattedStatements;
  }

  // ----------------------------------------------------
  // Style 3: Pairs Format (1. Item — Description)
  // ----------------------------------------------------
  if (/pairs?[\s\S]*?(?:correctly|matched)/i.test(text) && /\d+\.\s*[^—–-]+[—–-]/.test(text)) {
    const formattedPairs = parseAndFormatPairs(text);
    if (formattedPairs) return formattedPairs;
  }

  // ----------------------------------------------------
  // Default: General intelligent newline & paragraph break formatting
  // ----------------------------------------------------
  return defaultFormatText(text);
}

/**
 * Format Match List I and List II into a modern responsive 2-column table
 */
function parseAndFormatMatchQuestion(text) {
  try {
    // 1. Extract Codes block if present at the end
    let mainPart = text;
    let codesText = '';
    const codesIndex = mainPart.search(/\b(?:Codes?\s*)?A\s+B\s+C\s+D\b/i);
    if (codesIndex !== -1) {
      codesText = mainPart.slice(codesIndex).trim();
      mainPart = mainPart.slice(0, codesIndex).trim();
    }

    // 2. Extract preamble (introductory sentence)
    const listIndex = mainPart.search(/List\s*(?:I|1)\b/i);
    let preamble = 'Match List I with List II and select the correct answer using the codes given below:';
    if (listIndex > 0) {
      preamble = mainPart.slice(0, listIndex).replace(/[.\s]+$/, '.').trim();
      mainPart = mainPart.slice(listIndex).trim();
    }

    // 3. Extract Headers for List I and List II
    let header1 = 'List I';
    let header2 = 'List II';
    const headerRegex = /List\s*(?:I|1)\s*(?:\(([^)]+)\))?[\s\S]*?List\s*(?:II|2|H)\s*(?:\(([^)]+)\))?/i;
    const headerMatch = mainPart.match(headerRegex);
    if (headerMatch) {
      if (headerMatch[1]) header1 = headerMatch[1].trim();
      if (headerMatch[2]) header2 = headerMatch[2].trim();
      mainPart = mainPart.replace(headerRegex, '').trim();
    }

    // 4. Extract rows A, B, C, D
    const rowRegex = /(?:^|\s*)([A-D])[.\s]+([\s\S]*?)(?=(?:[A-D][.\s]|$))/gi;
    const items = [];
    let match;
    while ((match = rowRegex.exec(mainPart)) !== null) {
      const letter = match[1].toUpperCase();
      const content = match[2].trim();
      items.push({ letter, content });
    }

    if (items.length >= 2) {
      // Split each item into Left item and Right item (e.g. "Asia 1. Atacama" or "Spree 1. Bonn")
      const rows = items.map((item, idx) => {
        const num = idx + 1;
        const splitRegex = new RegExp(`^(.*?)(?:\\s+|\\b)${num}[.\\s]+(.*)$`, 'i');
        const m = item.content.match(splitRegex);
        if (m) {
          return {
            letter: item.letter,
            col1: m[1].replace(/[—–-]$/, '').trim(),
            num: `${num}.`,
            col2: m[2].trim()
          };
        }
        return {
          letter: item.letter,
          col1: item.content,
          num: `${num}.`,
          col2: ''
        };
      });

      // Build tabular HTML
      let html = `
        <div class="question-match-container mb-3">
          <p class="question-preamble mb-3" style="font-weight: 600; color: var(--text-primary); line-height: 1.6;">
            ${escapeHTML(preamble)}
          </p>

          <div class="match-table-card" style="border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); margin-bottom: 16px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; background: rgba(99, 102, 241, 0.12); border-bottom: 1px solid var(--border-subtle); font-weight: 700; font-size: 0.85rem;">
              <div style="padding: 10px 14px; border-right: 1px solid var(--border-subtle); color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.5px;">
                📋 List I <span style="opacity: 0.8; font-weight: 500;">(${escapeHTML(header1)})</span>
              </div>
              <div style="padding: 10px 14px; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.5px;">
                🎯 List II <span style="opacity: 0.8; font-weight: 500;">(${escapeHTML(header2)})</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column;">
              ${rows.map((r, i) => `
                <div style="display: grid; grid-template-columns: 1fr 1fr; border-bottom: ${i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'}; font-size: 0.92rem; align-items: center; background: ${i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'};">
                  <div style="padding: 10px 14px; border-right: 1px solid var(--border-subtle); display: flex; align-items: baseline; gap: 8px;">
                    <span style="font-weight: 800; color: var(--primary); min-width: 22px;">${r.letter}.</span>
                    <span style="color: var(--text-primary);">${escapeHTML(r.col1)}</span>
                  </div>
                  <div style="padding: 10px 14px; display: flex; align-items: baseline; gap: 8px;">
                    <span style="font-weight: 800; color: #fbbf24; min-width: 22px;">${r.num}</span>
                    <span style="color: var(--text-primary);">${escapeHTML(r.col2)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
      `;

      // If Codes matrix is present, format it nicely
      if (codesText) {
        html += `
          <div class="match-codes-box" style="padding: 8px 14px; border-radius: var(--radius-sm); background: rgba(0,0,0,0.25); border: 1px solid var(--border-subtle); font-family: monospace; font-size: 0.82rem; color: var(--text-secondary); margin-top: 8px;">
            <strong style="color: var(--text-primary);">Codes:</strong> ${escapeHTML(codesText)}
          </div>
        `;
      }

      html += `</div>`;
      return html;
    }
  } catch (e) {
    console.warn("Match question formatting fallback:", e);
  }
  return null;
}

/**
 * Check if text has numbered statements like 1. ... 2. ...
 */
function hasNumberedStatements(text) {
  return /\b1\.\s+[A-Z\w]/.test(text) && /\b2\.\s+[A-Z\w]/.test(text);
}

/**
 * Format numbered statements (1., 2., 3., 4.)
 */
function parseAndFormatNumberedStatements(text) {
  try {
    const directiveRegex = /(Which of the (?:statements|pairs|above)[\s\S]*?$|Select the correct answer[\s\S]*?$)/i;
    let mainText = text;
    let directiveText = '';

    const dirMatch = mainText.match(directiveRegex);
    if (dirMatch) {
      directiveText = dirMatch[0].trim();
      mainText = mainText.slice(0, dirMatch.index).trim();
    }

    const firstNumIndex = mainText.search(/\b1\.\s+/);
    let preamble = '';
    if (firstNumIndex > 0) {
      preamble = mainText.slice(0, firstNumIndex).trim();
      mainText = mainText.slice(firstNumIndex).trim();
    }

    const stmtRegex = /(?:^|\s*)(\d+)\.\s+([\s\S]*?)(?=(?:\s*\d+\.\s+|$))/g;
    const statements = [];
    let m;
    while ((m = stmtRegex.exec(mainText)) !== null) {
      statements.push({
        num: m[1],
        content: m[2].trim()
      });
    }

    if (statements.length >= 2) {
      return `
        <div class="question-statements-container mb-3">
          ${preamble ? `
            <p class="question-preamble mb-3" style="font-weight: 600; color: var(--text-primary); line-height: 1.6; font-size: 1.05rem;">
              ${escapeHTML(preamble)}
            </p>
          ` : ''}

          <div style="display: flex; flex-direction: column; gap: 8px; margin: 12px 0;">
            ${statements.map(s => `
              <div class="statement-card" style="display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); line-height: 1.6;">
                <span class="badge badge-primary" style="font-size: 0.8rem; font-weight: 800; min-width: 24px; padding: 2px 6px; text-align: center; margin-top: 2px;">${s.num}</span>
                <span style="color: var(--text-primary); font-size: 0.95rem;">${escapeHTML(s.content)}</span>
              </div>
            `).join('')}
          </div>

          ${directiveText ? `
            <div class="question-directive mt-3" style="padding-top: 8px; font-weight: 600; color: #a5b4fc; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
              <span>👉</span> <span>${escapeHTML(directiveText)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }
  } catch (e) {
    console.warn("Statements formatting fallback:", e);
  }
  return null;
}

/**
 * Format Pairs (e.g. 1. Namdapha — Arunachal Pradesh)
 */
function parseAndFormatPairs(text) {
  try {
    const directiveRegex = /(Which of the pairs[\s\S]*?$|Select the correct answer[\s\S]*?$)/i;
    let mainText = text;
    let directiveText = '';

    const dirMatch = mainText.match(directiveRegex);
    if (dirMatch) {
      directiveText = dirMatch[0].trim();
      mainText = mainText.slice(0, dirMatch.index).trim();
    }

    const firstNumIndex = mainText.search(/\b1\.\s+/);
    let preamble = '';
    if (firstNumIndex > 0) {
      preamble = mainText.slice(0, firstNumIndex).trim();
      mainText = mainText.slice(firstNumIndex).trim();
    }

    const pairRegex = /(?:^|\s*)(\d+)\.\s+([^—–-]+?)\s*[—–-]\s*([\s\S]*?)(?=(?:\s*\d+\.\s+|$))/g;
    const pairs = [];
    let m;
    while ((m = pairRegex.exec(mainText)) !== null) {
      pairs.push({
        num: m[1],
        left: m[2].trim(),
        right: m[3].trim()
      });
    }

    if (pairs.length >= 2) {
      return `
        <div class="question-pairs-container mb-3">
          ${preamble ? `
            <p class="question-preamble mb-3" style="font-weight: 600; color: var(--text-primary); line-height: 1.6; font-size: 1.05rem;">
              ${escapeHTML(preamble)}
            </p>
          ` : ''}

          <div style="display: flex; flex-direction: column; gap: 8px; margin: 12px 0;">
            ${pairs.map(p => `
              <div class="pair-card" style="display: grid; grid-template-columns: auto 1fr auto 1fr; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-size: 0.92rem;">
                <span class="badge badge-primary" style="font-size: 0.75rem; font-weight: 800;">${p.num}</span>
                <span style="font-weight: 600; color: var(--text-primary);">${escapeHTML(p.left)}</span>
                <span style="color: var(--text-muted);">:</span>
                <span style="color: #34d399;">${escapeHTML(p.right)}</span>
              </div>
            `).join('')}
          </div>

          ${directiveText ? `
            <div class="question-directive mt-3" style="padding-top: 8px; font-weight: 600; color: #a5b4fc; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
              <span>👉</span> <span>${escapeHTML(directiveText)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }
  } catch (e) {
    console.warn("Pairs formatting fallback:", e);
  }
  return null;
}

/**
 * Clean default text with proper paragraphing and line breaks
 */
function defaultFormatText(text) {
  let formatted = escapeHTML(text);

  formatted = formatted.replace(/(Consider the following statements:?)/gi, '$1<br><br>');
  formatted = formatted.replace(/([.?!])\s+(Which of the (?:statements|above|following)[\s\S]*?$)/i, '$1<br><br><span style="color: #a5b4fc; font-weight: 600;">$2</span>');
  formatted = formatted.replace(/([.?!])\s+(Select the correct answer using the code[\s\S]*?$)/i, '$1<br><br><span style="color: #a5b4fc; font-weight: 600;">$2</span>');

  return `<div class="question-default-text" style="line-height: 1.65; font-size: 1.05rem; color: var(--text-primary);">${formatted}</div>`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
