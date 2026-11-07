const $ = id => document.getElementById(id);
let db;
let albums = [];
let photos = [];
let selected = null;
let visiblePhotos = [];
let viewerIndex = 0;
let renaming = false;
let busy = false;
let gridUrls = [];
let viewerUrl = null;
const status = message => $('album-status').textContent = message;
function element(tag, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('xu-local-albums', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('albums', {keyPath: 'id'});
      request.result.createObjectStore('photos', {keyPath: 'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => status('请关闭其他相册页面后重试。');
  });
}
function all(store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function change(stores, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || Error('保存未完成，请重试。'));
    try { action(transaction); } catch (error) { transaction.abort(); reject(error); }
  });
}
async function refresh() {
  [albums, photos] = await Promise.all([all('albums'), all('photos')]);
  albums.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (selected && !albums.some(album => album.id === selected)) selected = null;
  render();
}
function albumButton(name, id, count) {
  const button = element('button');
  button.append(element('span', name), element('small', String(count)));
  button.setAttribute('aria-pressed', String(selected === id));
  button.onclick = () => { selected = id; status(''); render(); };
  return button;
}
function render() {
  gridUrls.forEach(url => URL.revokeObjectURL(url));
  gridUrls = [];
  $('album-list').replaceChildren(albumButton('全部照片', null, photos.length));
  for (const album of albums) $('album-list').append(albumButton(album.name, album.id, photos.filter(photo => photo.albumId === album.id).length));
  $('album-title').textContent = albums.find(album => album.id === selected)?.name || '全部照片';
  $('rename-album').hidden = !selected;
  $('delete-album').hidden = !selected;
  visiblePhotos = photos.filter(photo => !selected || photo.albumId === selected);
  $('photo-count').textContent = visiblePhotos.length + ' 张照片';
  const grid = $('photo-grid');
  grid.replaceChildren();
  visiblePhotos.forEach((photo, index) => {
    const url = URL.createObjectURL(photo.blob);
    gridUrls.push(url);
    const button = element('button');
    button.className = 'photo-tile';
    button.setAttribute('aria-label', '查看照片 ' + photo.name);
    const image = document.createElement('img');
    image.src = url;
    image.alt = photo.name;
    image.loading = 'lazy';
    button.append(image, element('span', photo.name));
    button.onclick = () => { viewerIndex = index; showPhoto(); $('photo-viewer').showModal(); };
    grid.append(button);
  });
  if (!visiblePhotos.length) {
    const empty = element('div');
    empty.className = 'album-empty';
    empty.append(element('h3', selected ? '给这个相册添几张照片吧' : '收藏你的日常片段'), element('p', '新建相册后，可以一次添加多张照片。'));
    grid.append(empty);
  }
}
function showPhoto() {
  const photo = visiblePhotos[viewerIndex];
  if (!photo) { $('photo-viewer').close(); return; }
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = URL.createObjectURL(photo.blob);
  $('viewer-image').src = viewerUrl;
  $('viewer-image').alt = photo.name;
  $('download-photo').href = viewerUrl;
  $('download-photo').download = photo.name;
  $('viewer-caption').textContent = photo.name;
  $('viewer-position').textContent = (viewerIndex + 1) + ' / ' + visiblePhotos.length;
  $('previous-photo').disabled = viewerIndex === 0;
  $('next-photo').disabled = viewerIndex === visiblePhotos.length - 1;
}
async function run(action) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button,input')];
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => control.disabled = true);
  try { await action(); }
  catch (error) {
    const message = error.name === 'QuotaExceededError' ? '浏览器空间不足。本次添加未保存，请减少照片后重试。' : error.message || '操作失败，请重试。';
    status(message);
    $('album-form-status').textContent = message;
  } finally {
    busy = false;
    controls.forEach((control, index) => control.disabled = disabled[index]);
    // Refresh may replace navigation and photo buttons, while viewer buttons persist.
    if ($('photo-viewer').open) showPhoto();
  }
}
function nameDialog(rename = false) {
  if (busy) return;
  renaming = rename;
  $('album-dialog-title').textContent = rename ? '重命名相册' : '新建相册';
  $('album-name').value = rename ? albums.find(album => album.id === selected)?.name || '' : '';
  $('album-form-status').textContent = '';
  $('album-dialog').showModal();
  $('album-name').focus();
}
$('new-album').onclick = () => nameDialog();
$('rename-album').onclick = () => nameDialog(true);
$('cancel-album').onclick = () => $('album-dialog').close();
$('album-form').onsubmit = event => {
  event.preventDefault();
  const name = $('album-name').value.trim();
  if (!name) { $('album-form-status').textContent = '请填写相册名称。'; return; }
  run(async () => {
    const id = renaming ? selected : crypto.randomUUID();
    await change(['albums'], transaction => {
      const store = transaction.objectStore('albums');
      if (renaming) {
        const request = store.get(id);
        request.onsuccess = () => {
          if (!request.result) { transaction.abort(); return; }
          store.put({...request.result, name});
        };
      } else store.add({id, name, createdAt: new Date().toISOString()});
    });
    selected = id;
    await refresh();
    $('album-dialog').close();
    status('相册已保存。');
  });
};
$('add-photos').onclick = () => {
  if (busy) return;
  if (!selected) { nameDialog(); status('先新建或选择一个相册，再添加照片。'); return; }
  $('photo-files').click();
};
$('photo-files').onchange = event => {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length) return;
  const albumId = selected;
  run(async () => {
    status('正在保存 ' + files.length + ' 张照片…');
    const added = [];
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) throw Error('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片。');
      if (file.size > 30 * 1024 * 1024) throw Error('单张照片请控制在 30 MB 内。本次照片尚未保存。');
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
      } finally { URL.revokeObjectURL(url); }
      added.push({id: crypto.randomUUID(), albumId, name: file.name, blob: file, createdAt: new Date().toISOString()});
    }
    await change(['albums', 'photos'], transaction => {
      const request = transaction.objectStore('albums').get(albumId);
      request.onsuccess = () => {
        if (!request.result) { transaction.abort(); return; }
        for (const photo of added) transaction.objectStore('photos').add(photo);
      };
    });
    await refresh();
    status('已保存 ' + added.length + ' 张照片。');
  });
};
$('delete-album').onclick = () => {
  if (!selected || busy || !confirm('删除这个相册及其中的所有照片？请确认已保留原图。')) return;
  const id = selected;
  run(async () => {
    await change(['albums', 'photos'], transaction => {
      transaction.objectStore('albums').delete(id);
      const request = transaction.objectStore('photos').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.albumId === id) cursor.delete();
        cursor.continue();
      };
    });
    selected = null;
    await refresh();
    status('相册已删除。');
  });
};
$('remove-photo').onclick = () => {
  const photo = visiblePhotos[viewerIndex];
  if (!photo || busy || !confirm('删除这张照片？请确认已保留原图。')) return;
  run(async () => {
    await change(['photos'], transaction => transaction.objectStore('photos').delete(photo.id));
    await refresh();
    viewerIndex = Math.min(viewerIndex, visiblePhotos.length - 1);
    showPhoto();
  });
};
$('close-viewer').onclick = () => $('photo-viewer').close();
$('photo-viewer').onclose = () => {
  $('viewer-image').removeAttribute('src');
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = null;
};
$('previous-photo').onclick = () => { viewerIndex--; showPhoto(); };
$('next-photo').onclick = () => { viewerIndex++; showPhoto(); };
$('photo-viewer').onkeydown = event => {
  if (busy) { if (event.key === 'Escape') event.preventDefault(); return; }
  if (event.key === 'ArrowLeft' && viewerIndex > 0) { event.preventDefault(); viewerIndex--; showPhoto(); }
  if (event.key === 'ArrowRight' && viewerIndex < visiblePhotos.length - 1) { event.preventDefault(); viewerIndex++; showPhoto(); }
};
$('album-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('focus', () => { if (db && !busy && !$('photo-viewer').open && !$('album-dialog').open) refresh().catch(error => status(error.message)); });
run(async () => {
  db = await openDatabase();
  db.onversionchange = () => { db.close(); status('相册存储已更新，请刷新页面。'); };
  await refresh();
});
