/**
 * IIOCCI HQ — Google Apps Script API
 * スプレッドシートをDBとして使い、HTMLからのデータ読み書きを担当
 *
 * 【シート構成】
 *   シート1: cases     → 案件ログ
 *   シート2: revenues  → 売上記録
 *   シート3: phase1    → Phase1タスク進捗（17個のtrue/false）
 */

// ── CORS対応 ──────────────────────────────────────
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e.parameter;
  const postData = e.postData ? JSON.parse(e.postData.contents) : {};
  const action = params.action || postData.action;
  const sheet = params.sheet || postData.sheet;

  let result;
  try {
    switch (action) {
      case 'read':   result = readSheet(sheet); break;
      case 'write':  result = writeSheet(sheet, postData.data); break;
      case 'append': result = appendRow(sheet, postData.row); break;
      case 'delete': result = deleteRow(sheet, postData.id); break;
      case 'claude': result = callClaude(postData.messages, postData.system); break;
      default: result = { error: 'unknown action' };
    }
  } catch(err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── スプレッドシート取得 ───────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // ヘッダー行を追加
    if (name === 'cases') {
      sheet.appendRow(['id','date','client','service','status','amount','memo']);
    } else if (name === 'revenues') {
      sheet.appendRow(['id','date','client','desc','amount','memo']);
    } else if (name === 'phase1') {
      sheet.appendRow(['index','checked']);
      // 17タスク分の初期値
      for (let i = 0; i < 17; i++) sheet.appendRow([i, 'false']);
    }
  }
  return sheet;
}

// ── 読み込み ─────────────────────────────────────
function readSheet(name) {
  const sheet = getSheet(name);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { rows: [] };

  if (name === 'phase1') {
    // phase1は boolean配列で返す
    const checked = data.slice(1).map(row => row[1] === 'true' || row[1] === true);
    return { checked };
  }

  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return { rows };
}

// ── 上書き保存（phase1タスク用）─────────────────────
function writeSheet(name, data) {
  const sheet = getSheet(name);
  if (name === 'phase1') {
    // data = boolean[]
    const existing = sheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      const rowIndex = i + 2; // ヘッダー行 + 1始まり
      if (existing[i + 1]) {
        sheet.getRange(rowIndex, 2).setValue(String(data[i]));
      } else {
        sheet.appendRow([i, String(data[i])]);
      }
    }
    return { success: true };
  }
  return { error: 'write only supported for phase1' };
}

// ── 行追加（cases/revenues用）────────────────────
function appendRow(name, row) {
  const sheet = getSheet(name);
  const id = Date.now();
  if (name === 'cases') {
    sheet.appendRow([id, row.date, row.client, row.service, row.status, row.amount, row.memo || '']);
  } else if (name === 'revenues') {
    sheet.appendRow([id, row.date, row.client, row.desc || '', row.amount, row.memo || '']);
  }
  return { success: true, id };
}

// ── 行削除（id列で検索）────────────────────────
function deleteRow(name, id) {
  const sheet = getSheet(name);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'row not found' };
}

// ── Claude API プロキシ ────────────────────────────
// ANTHROPIC_API_KEY をGASのスクリプトプロパティに設定してください
function callClaude(messages, systemPrompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY が設定されていません。GASのスクリプトプロパティに追加してください。' };

  const payload = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: messages
  };
  if (systemPrompt) payload.system = systemPrompt;

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  const json = JSON.parse(response.getContentText());

  if (json.error) return { error: json.error.message };
  return { text: json.content?.[0]?.text || '' };
}
