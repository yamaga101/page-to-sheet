/**
 * POST request handler for Page to Sheet Chrome Extension.
 * Appends a row with [datetime, title, url] to the active sheet.
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

  sheet.appendRow([datetime, data.title, data.url]);

  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok" })
  ).setMimeType(ContentService.MimeType.JSON);
}
