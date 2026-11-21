const legacyKey = 'xu.github-pages.drafts.v1';
const storeName = 'notes';
const metadata = 'metadata';

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('xu-journal', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(storeName, {keyPath: 'id'});
    request.result.createObjectStore(metadata);
  };
  request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => db.close();
    resolve(db);
  };
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(Error('请关闭其他随笔窗口后重试。'));
});

async function transaction(mode, stores, action) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    let failure;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || tx.error || Error('随笔存储操作未完成。'));
    const finish = value => { result = value; };
    const abort = error => { failure = error; tx.abort(); };
    try { action(tx, finish, abort); } catch (error) { abort(error); }
  });
}

const migrated = transaction('readwrite', [storeName, metadata], (tx, finish, abort) => {
  const flags = tx.objectStore(metadata);
  const request = flags.get('legacy-imported');
  request.onsuccess = () => {
    if (request.result) return;
    try {
      const saved = JSON.parse(localStorage.getItem(legacyKey) || '[]');
      if (!Array.isArray(saved)) throw Error('旧随笔存储格式有误。');
      for (const note of saved) tx.objectStore(storeName).put(note);
      flags.put(true, 'legacy-imported');
    } catch (error) { abort(error); }
  };
});

export async function readDrafts() {
  await migrated;
  return transaction('readonly', [storeName], (tx, finish) => {
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => finish(request.result);
  });
}

export async function saveDraft(note, previous, remove = false) {
  await migrated;
  return transaction('readwrite', [storeName], (tx, finish, abort) => {
    const notes = tx.objectStore(storeName);
    const request = notes.get(note.id);
    request.onsuccess = () => {
      if (request.result?.updatedAt !== previous?.updatedAt) {
        abort(Error('这篇随笔已在另一窗口修改或删除，请先导出当前备份，再重新打开随笔。'));
        return;
      }
      if (remove) notes.delete(note.id);
      else notes.put(note);
    };
  });
}

export async function importDrafts(items) {
  await migrated;
  return transaction('readwrite', [storeName], (tx, finish) => {
    const notes = tx.objectStore(storeName);
    const request = notes.getAll();
    request.onsuccess = () => {
      const known = request.result;
      let count = 0;
      for (const item of items) {
        if (known.some(note => ['title', 'content', 'contentFormat', 'category', 'date'].every(key =>
          (note[key] ?? (key === 'contentFormat' ? 'plain' : '')) === item[key]))) continue;
        notes.add(item);
        known.push(item);
        count++;
      }
      finish(count);
    };
  });
}
