/**
 * POST request handler for Page to Sheet Chrome Extension.
 * Columns: [datetime, title, url, category, tags]
 *
 * Features:
 * - Duplicate URL detection: moves existing row to bottom (preserves tags/category)
 * - Supports category and tags fields
 *
 * Deploy as: Web App
 * - Execute as: Me
 * - Who has access: Anyone
 */
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  var now = new Date();
  var datetime = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "yyyy/MM/dd HH:mm:ss"
  );

  var newCategory = data.category || "";
  var newTags = data.tags || "";

  // Check for duplicate URL
  var existingRow = findRowByUrl(sheet, data.url);

  if (existingRow) {
    // Preserve existing data and merge
    var existingData = sheet.getRange(existingRow, 1, 1, 5).getValues()[0];
    var existingCategory = existingData[3] || "";
    var existingTags = existingData[4] || "";

    // Use new category if provided, otherwise keep existing
    var category = newCategory || existingCategory;

    // Merge tags (union of existing and new, deduplicated)
    var tags = mergeTags(existingTags, newTags);

    // Delete old row
    sheet.deleteRow(existingRow);

    // Append at bottom with merged data
    sheet.appendRow([datetime, data.title, data.url, category, tags]);
  } else {
    // New entry
    sheet.appendRow([datetime, data.title, data.url, newCategory, newTags]);
  }

  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok", duplicate: !!existingRow })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Find row number by URL in column C.
 * Returns row number (1-based) or null if not found.
 */
function findRowByUrl(sheet, url) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return null;

  var urls = sheet.getRange(1, 3, lastRow, 1).getValues();
  for (var i = urls.length - 1; i >= 0; i--) {
    if (urls[i][0] === url) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Merge two comma-separated tag strings, removing duplicates.
 */
function mergeTags(existing, incoming) {
  var existingArr = existing ? existing.split(",").map(function(t) { return t.trim(); }).filter(Boolean) : [];
  var incomingArr = incoming ? incoming.split(",").map(function(t) { return t.trim(); }).filter(Boolean) : [];

  var merged = existingArr.slice();
  incomingArr.forEach(function(tag) {
    if (merged.indexOf(tag) === -1) {
      merged.push(tag);
    }
  });

  return merged.join(", ");
}
