/**
 * POST request handler for Page to Sheet Chrome Extension.
 * Columns: [datetime, title, url, tagGroup1, tagGroup2, tagGroup3, ...]
 *
 * Features:
 * - Duplicate URL detection: moves existing row to bottom (preserves tag values)
 * - Supports multiple tag group columns
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

  var tagValues = data.tagValues || [];

  // Check for duplicate URL
  var existingRow = findRowByUrl(sheet, data.url);

  if (existingRow) {
    var existingData = sheet.getRange(existingRow, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Merge tag values: keep existing if new is empty
    var mergedTags = [];
    var maxLen = Math.max(tagValues.length, existingData.length - 3);
    for (var i = 0; i < maxLen; i++) {
      var newVal = i < tagValues.length ? tagValues[i] : "";
      var existVal = (i + 3) < existingData.length ? (existingData[i + 3] || "") : "";
      mergedTags.push(newVal || existVal);
    }

    sheet.deleteRow(existingRow);
    sheet.appendRow([datetime, data.title, data.url].concat(mergedTags));
  } else {
    sheet.appendRow([datetime, data.title, data.url].concat(tagValues));
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
