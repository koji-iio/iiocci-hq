/**
 * IIOCCI HQ — 共通APIクライアント
 * 全HTMLファイルから <script src="api-client.js"> で読み込む
 *
 * 使い方:
 *   const api = new IioApi('https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec');
 *   await api.read('cases')           → { rows: [...] }
 *   await api.append('cases', row)    → { success: true, id: ... }
 *   await api.delete('cases', id)     → { success: true }
 *   await api.readPhase1()            → boolean[]
 *   await api.writePhase1(arr)        → { success: true }
 */

class IioApi {
  constructor(gasUrl) {
    this.url = gasUrl;
  }

  async _call(params) {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // GASのCORS回避
        body: JSON.stringify(params),
        redirect: 'follow'
      });
      return await res.json();
    } catch(e) {
      console.error('API error:', e);
      return { error: e.message };
    }
  }

  read(sheet)           { return this._call({ action: 'read', sheet }); }
  append(sheet, row)    { return this._call({ action: 'append', sheet, row }); }
  delete(sheet, id)     { return this._call({ action: 'delete', sheet, id }); }
  write(sheet, data)    { return this._call({ action: 'write', sheet, data }); }

  async readPhase1() {
    const r = await this.read('phase1');
    return r.checked || new Array(17).fill(false);
  }

  async writePhase1(arr) {
    return this.write('phase1', arr);
  }
}

// GAS URLをlocalStorageにキャッシュ（設定画面から保存）
function getApiUrl() {
  return localStorage.getItem('iiocci-gas-url') || '';
}

function saveApiUrl(url) {
  localStorage.setItem('iiocci-gas-url', url);
}

function createApi() {
  const url = getApiUrl();
  return url ? new IioApi(url) : null;
}
