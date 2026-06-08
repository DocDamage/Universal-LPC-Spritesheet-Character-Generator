/**
 * Minimal RFC-4180 CSV field formatter.
 * Wraps a field in double quotes if it contains commas, quotes, or newlines,
 * and escapes embedded quotes by doubling them.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeCsvField(value) {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return '"' + value.replaceAll('"', '""') + '"';
  }
  return value;
}

/**
 * Converts an array of string values into a single CSV line.
 *
 * @param {string[]} fields
 * @returns {string}
 */
export function toCsvLine(fields) {
  return fields.map(escapeCsvField).join(",") + "\n";
}
