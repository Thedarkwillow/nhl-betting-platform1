'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function canArchive(frame, at = Date.now()) {
  const generatedAt = Date.parse(frame?.generatedAt);
  return Number.isFinite(at) && Number.isFinite(generatedAt) && generatedAt <= at &&
    Array.isArray(frame.rows) && frame.rows.length > 0 &&
    frame.rows.every(row => Date.parse(row.gameStartAt) > at + 15 * 60_000);
}

if (require.main === module) {
  for (const file of process.argv.slice(2)) {
    const bytes = fs.readFileSync(file);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (path.basename(file) !== digest + '.json' || !canArchive(JSON.parse(bytes))) {
      console.error('Forecast archive gate rejected a changed, invalid, or late research forecast');
      process.exitCode = 1;
      break;
    }
  }
}

module.exports = { canArchive };
