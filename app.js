import {readDrafts, saveDraft, importDrafts} from './note-storage.js';
import {createNoteEditor, renderNote, renderFormula} from './editor/note-editor.js';
const $ = id => document.getElementById(id);
const noteUpdates = new BroadcastChannel('xu-journal-updates');
let posts = [];
let library = [];
let drafts = [];
let current = null;
let dirty = false;
let busy = false;
let archiveOpen = true;
let journalPage = 0;
const journalPageSize = 8;
const status = message => $('status').textContent = message;

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
let noteEditor;
let loadingEditor = false;
function noteMarkdown(post) {
  const text = post?.content || '';
  return post?.contentFormat === 'markdown' ? text : text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}
function prose(node, text) { renderNote(node, text); }
function ensureEditor() {
  if (!noteEditor) noteEditor = createNoteEditor($('rich-editor'), () => { if (!loadingEditor) dirty = true; }, status);
  return noteEditor;
}
function sortPosts(items) {
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}
function render() {
  const box = $('entries');
  box.replaceChildren();
  const query = $('search').value.toLowerCase().trim();
  const searching = Boolean(query || $('filter').value);
  const matches = posts.filter(item => (!$('filter').value || item.category === $('filter').value) && (item.title + item.content).toLowerCase().includes(query));
  const paginated = archiveOpen || searching;
  const pageCount = Math.max(1, Math.ceil(matches.length / journalPageSize));
  journalPage = Math.min(journalPage, pageCount - 1);
  const visible = paginated ? matches.slice(journalPage * journalPageSize, (journalPage + 1) * journalPageSize) : matches.slice(0, 3);
  $('archive-toggle').hidden = posts.length <= 3 || searching;
  $('archive-toggle').textContent = archiveOpen ? '收起全部随笔' : '全部随笔（' + posts.length + ' 篇）';
  $('archive-toggle').setAttribute('aria-expanded', String(archiveOpen));
  $('journal-pagination').hidden = !paginated || matches.length <= journalPageSize;
  $('journal-page').textContent = (journalPage + 1) + ' / ' + pageCount;
  $('journal-prev').disabled = journalPage === 0;
  $('journal-next').disabled = journalPage === pageCount - 1;
  $('journal-count').textContent = searching ? '找到 ' + matches.length + ' 篇随笔' : archiveOpen ? '全部随笔 · ' + posts.length + ' 篇' : posts.length > 3 ? '最近 3 篇 · 共 ' + posts.length + ' 篇' : '';
  for (const post of visible) {
    const row = element('div', '');
    row.className = 'entry';
    row.id = 'post-' + post.id;
    const title = element('button', '');
    title.type = 'button';
    title.className = 'entry-open';
    title.setAttribute('aria-controls', 'drawer');
    title.append(element('strong', post.title), element('small', post.date + '　' + post.category), element('span', '阅读全文 ↗'));
    title.onclick = () => openDrawer(post.id, true);
    row.append(title);
    box.append(row);
  }
  if (!box.children.length) box.append(element('p', posts.length ? '没有匹配的随笔。' : '第一篇随笔，酝酿中。'));
}
function updatePosts(items) {
  posts = sortPosts(items);
  const previous = $('filter').value;
  $('filter').replaceChildren(new Option('全部分类', ''), ...Array.from(new Set(posts.map(item => item.category)), category => new Option(category, category)));
  if (posts.some(item => item.category === previous)) $('filter').value = previous;
  render();
}
function rebuildLibrary() {
  updatePosts([...drafts]);
  library = posts;
  $('library').replaceChildren(new Option('＋ 新建随笔', ''), ...library.map(post => new Option(post.title, post.id)));
  $('library').value = current?.id || '';
}
function select(post) {
  current = post || null;
  dirty = false;
  $('library').value = post?.id || '';
  $('title').value = post?.title || '';
  loadingEditor = true;
  try { ensureEditor().setMarkdown(noteMarkdown(post), false); } finally { loadingEditor = false; }
  $('category').value = post?.category || '随笔';
  $('date').value = post?.date || new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(new Date());
  $('preview').hidden = true;
  $('editor-area').hidden = false;
  $('toggle').textContent = '预览';
  $('remove').hidden = !post;
  $('remove').textContent = '删除随笔';
  $('read-note').hidden = !post;
  $('drawer-heading').textContent = post ? '编辑随笔' : '写随笔';
  status(post ? '已保存在当前浏览器。' : '');
}
function setReading(reading) {
  $('reader').hidden = !reading;
  $('writer').hidden = reading;
  $('drawer-heading').textContent = reading ? '阅读随笔' : current ? '编辑随笔' : '写随笔';
  $('drawer-note').hidden = reading;
  if (reading && current) {
    $('reader-title').textContent = current.title;
    $('reader-meta').textContent = current.date + '　' + current.category;
    prose($('reader-content'), noteMarkdown(current));
    status('');
  }
}
function openDrawer(id = null, reading = false) {
  if (busy || dirty && !confirm('放弃未保存的修改？')) return;
  rebuildLibrary();
  const post = library.find(item => item.id === id);
  select(post);
  setReading(reading && Boolean(post));
  document.body.classList.add('writing');
  $('drawer').hidden = false;
  $('drawer').scrollTop = 0;
  $('close').focus();
}
function closeDrawer() {
  if (busy || dirty && !confirm('放弃未保存的修改？')) return;
  dirty = false;
  $('drawer').hidden = true;
  document.body.classList.remove('writing');
  document.querySelector('[data-open]').focus();
}
async function run(action) {
  if (busy) return;
  busy = true;
  const controls = [...$('drawer').querySelectorAll('button, input, select, textarea')];
  const disabledStates = controls.map(control => control.disabled);
  controls.forEach(control => control.disabled = true);
  try { await action(); }
  catch (error) { status(error.name === 'QuotaExceededError' ? '设备分配给浏览器的存储空间已用完。请先导出备份，当前编辑内容仍在。' : error.message); }
  finally {
    busy = false;
    controls.forEach((control, index) => control.disabled = disabledStates[index]);
  }
}
function capture() {
  return {
    id: current?.id || crypto.randomUUID(),
    title: $('title').value.trim(), content: ensureEditor().getMarkdown(), contentFormat: 'markdown',
    date: $('date').value, category: $('category').value.trim() || '随笔',
    updatedAt: new Date().toISOString()
  };
}
document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => openDrawer());
$('close').onclick = closeDrawer;
$('edit-note').onclick = () => { setReading(false); $('title').focus(); };
$('read-note').onclick = () => {
  if (dirty) { status('请先保存修改，再阅读完整内容。'); return; }
  if (current) setReading(true);
};
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });
$('writer').oninput = event => { if (event.target !== $('library') && event.target !== $('import')) dirty = true; };
$('library').onchange = () => {
  if (busy || dirty && !confirm('放弃当前未保存的修改？')) { $('library').value = current?.id || ''; return; }
  select(library.find(item => item.id === $('library').value));
};
$('writer').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const post = capture();
    if (!post.title || !post.date) throw Error('请填写标题和日期。');
    await saveDraft(post, current);
    dirty = false;
    drafts = await readDrafts();
    noteUpdates.postMessage('changed');
    rebuildLibrary();
    select(post);
    setReading(true);
    status('已保存，可以在主页的随笔区查看。内容保存在当前浏览器。');
  });
};
$('toggle').onclick = () => {
  const show = $('preview').hidden;
  prose($('preview'), ensureEditor().getMarkdown());
  $('preview').hidden = !show;
  $('editor-area').hidden = show;
  $('toggle').textContent = show ? '继续编辑' : '预览';
};
$('remove').onclick = () => {
  if (!current || busy || !confirm('删除这篇本机随笔？建议先导出备份。')) return;
  run(async () => {
    await saveDraft(current, current, true);
    drafts = await readDrafts();
    noteUpdates.postMessage('changed');
    current = null;
    rebuildLibrary();
    select(null);
    status('随笔已删除。');
  });
};
$('backup').onclick = () => {
  const exported = [...library];
  if (dirty) {
    const post = capture();
    const index = exported.findIndex(item => item.id === post.id);
    if (index >= 0) exported[index] = post; else exported.push(post);
  }
  const link = element('a', '');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], {type: 'application/json'}));
  link.download = 'xu-blog-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
$('import').onchange = event => run(async () => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const items = JSON.parse(await file.text());
  if (!Array.isArray(items) || items.some(item => !item || typeof item.title !== 'string' || item.title.length > 120 || typeof item.content !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) throw Error('备份格式不正确。');
  const imported = items.map(item => ({id: crypto.randomUUID(), title: item.title, content: item.content, contentFormat: item.contentFormat === 'markdown' ? 'markdown' : 'plain', date: item.date, category: typeof item.category === 'string' ? item.category.slice(0, 24) : '随笔', published: false, updatedAt: new Date().toISOString(), baseUpdatedAt: null}));
  const count = await importDrafts(imported);
  drafts = await readDrafts();
  noteUpdates.postMessage('changed');
  rebuildLibrary();
  status('已导入 ' + count + ' 篇本机随笔，可在文章列表选择。');
});
function resetJournalPage() {
  journalPage = 0;
  render();
}
$('search').oninput = resetJournalPage;
$('filter').onchange = resetJournalPage;
$('archive-toggle').onclick = () => {
  archiveOpen = true;
  resetJournalPage();
};
$('journal-prev').onclick = () => { journalPage--; render(); };
$('journal-next').onclick = () => { journalPage++; render(); };

window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
noteUpdates.onmessage = async () => {
  try { drafts = await readDrafts(); rebuildLibrary(); }
  catch (error) { status(error.message); }
};
try { drafts = await readDrafts(); }
catch (error) {
  $('journal-count').textContent = '随笔存储打开失败：' + error.message;
  throw error;
}
const linkedIndex = sortPosts([...drafts]).findIndex(post => '#post-' + post.id === location.hash);
if (linkedIndex >= 3) {
  archiveOpen = true;
  journalPage = Math.floor(linkedIndex / journalPageSize);
}
rebuildLibrary();
if (linkedIndex >= 0) openDrawer(location.hash.slice(6), true);
if (new URLSearchParams(location.search).has('edit')) openDrawer();

$('insert-formula').onclick = () => {
  $('formula-input').value = String.raw`\sum_{i=1}^{n} a_i`;
  renderFormula($('formula-preview'), $('formula-input').value);
  $('formula-dialog').showModal();
  $('formula-input').focus();
};
$('formula-input').oninput = () => renderFormula($('formula-preview'), $('formula-input').value);
$('formula-cancel').onclick = () => $('formula-dialog').close();
$('formula-form').onsubmit = event => {
  event.preventDefault();
  const latex = $('formula-input').value.trim();
  if (!latex || latex.includes('$$') || !renderFormula($('formula-preview'), latex)) return;
  const editor = ensureEditor();
  editor.setMarkdown(editor.getMarkdown() + '\n\n$$latex\n' + latex + '\n$$\n');
  dirty = true;
  $('formula-dialog').close();
};
