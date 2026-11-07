const $ = id => document.getElementById(id);
const storageKey = 'xu.github-pages.drafts.v1';
let posts = [];
let library = [];
let drafts = [];
let current = null;
let dirty = false;
let busy = false;
const status = message => $('status').textContent = message;

function readDrafts() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(saved)) throw Error('随笔格式有误，请先导出浏览器数据。');
  return saved;
}
function storeDrafts(next) {
  localStorage.setItem(storageKey, JSON.stringify(next));
  drafts = next;
}
function saveLocal(post) {
  const next = drafts.filter(item => item.id !== post.id);
  next.push(post);
  storeDrafts(next);
  current = post;
  dirty = false;
}
function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function prose(node, text) {
  node.replaceChildren();
  for (const line of text.split('\n')) {
    const match = line.match(/^(#{1,3}|>|-) (.*)$/);
    let tag = 'p';
    let content = line || ' ';
    if (match) {
      tag = match[1] === '>' ? 'blockquote' : match[1] === '-' ? 'p' : 'h3';
      content = (match[1] === '-' ? '• ' : '') + match[2];
    }
    node.append(element(tag, content));
  }
}
function sortPosts(items) {
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}
function render() {
  const box = $('entries');
  box.replaceChildren();
  const query = $('search').value.toLowerCase().trim();
  for (const post of posts.filter(item => (!$('filter').value || item.category === $('filter').value) && (item.title + item.content).toLowerCase().includes(query))) {
    const details = element('details', '');
    details.className = 'entry';
    details.id = 'post-' + post.id;
    details.open = location.hash === '#' + details.id;
    const title = element('summary', post.title);
    title.append(element('small', post.date + '　' + post.category));
    const article = element('article', '');
    article.className = 'article-text';
    prose(article, post.content);
    details.append(title, article);
    box.append(details);
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
  $('body').value = post?.content || '';
  $('category').value = post?.category || '随笔';
  $('date').value = post?.date || new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(new Date());
  $('preview').hidden = true;
  $('body').hidden = false;
  $('toggle').textContent = '预览';
  $('remove').hidden = !post;
  $('remove').textContent = '删除随笔';
  status(post ? '已保存在当前浏览器。' : '');
}
function openDrawer() {
  document.body.classList.add('writing');
  $('drawer').hidden = false;
  rebuildLibrary();
  if (!dirty) select(current);
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
  catch (error) { status(error.name === 'QuotaExceededError' ? '浏览器存储空间不足，请先导出备份。当前编辑内容仍在，请勿关闭页面。' : error.message); }
  finally {
    busy = false;
    controls.forEach((control, index) => control.disabled = disabledStates[index]);
  }
}
function capture() {
  return {
    id: current?.id || crypto.randomUUID(),
    title: $('title').value.trim(), content: $('body').value,
    date: $('date').value, category: $('category').value.trim() || '随笔',
    updatedAt: new Date().toISOString()
  };
}
document.querySelectorAll('[data-open]').forEach(button => button.onclick = openDrawer);
$('close').onclick = closeDrawer;
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });
$('writer').oninput = event => { if (event.target !== $('library') && event.target !== $('import')) dirty = true; };
$('library').onchange = () => {
  if (busy || dirty && !confirm('放弃当前未保存的修改？')) { $('library').value = current?.id || ''; return; }
  select(library.find(item => item.id === $('library').value));
};
$('writer').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    // Read the latest storage before merging to preserve other windows' saved notes.
    drafts = readDrafts();
    const existing = drafts.find(post => post.id === current?.id);
    if (current && existing?.updatedAt !== current.updatedAt) throw Error('这篇随笔已在另一窗口修改或删除，请先导出当前文字备份，再重新选择文章。');
    const post = capture();
    if (!post.title || !post.date) throw Error('请填写标题和日期。');
    saveLocal(post);
    rebuildLibrary();
    select(post);
    status('已保存，可以在主页的随笔区查看。内容保存在当前浏览器。');
  });
};
$('toggle').onclick = () => {
  const show = $('preview').hidden;
  prose($('preview'), $('body').value);
  $('preview').hidden = !show;
  $('body').hidden = show;
  $('toggle').textContent = show ? '继续编辑' : '预览';
};
$('remove').onclick = () => {
  if (!current || busy || !confirm('删除这篇本机随笔？建议先导出备份。')) return;
  run(async () => {
    const latest = readDrafts();
    const existing = latest.find(post => post.id === current.id);
    if (existing && existing.updatedAt !== current.updatedAt) throw Error('这篇随笔已在另一窗口修改，请重新选择后核对。');
    storeDrafts(latest.filter(item => item.id !== current.id));
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
  if (file.size > 5000000) throw Error('备份文件应小于 5 MB。');
  const items = JSON.parse(await file.text());
  if (!Array.isArray(items) || items.some(item => typeof item.title !== 'string' || item.title.length > 120 || typeof item.content !== 'string' || item.content.length > 30000 || !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) throw Error('备份格式不正确。');
  const imported = items.map(item => ({id: crypto.randomUUID(), title: item.title, content: item.content, date: item.date, category: typeof item.category === 'string' ? item.category.slice(0, 24) : '随笔', published: false, updatedAt: new Date().toISOString(), baseUpdatedAt: null}));
  storeDrafts([...readDrafts(), ...imported]);
  rebuildLibrary();
  status('已导入 ' + imported.length + ' 篇本机随笔，可在文章列表选择。');
});
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText('2651094755'); $('copy').textContent = 'QQ　2651094755　已复制'; }
  catch { $('copy').textContent = 'QQ　2651094755　请手动复制'; }
};
$('search').oninput = render;
$('filter').onchange = render;
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  try { drafts = readDrafts(); rebuildLibrary(); status('另一窗口更新了随笔。请核对后继续编辑。'); } catch (error) { status(error.message); }
});
try { drafts = readDrafts(); } catch (error) { status('浏览器随笔读取失败：' + error.message); }
rebuildLibrary();
if (location.hash.startsWith('#post-')) document.getElementById(location.hash.slice(1))?.scrollIntoView();
if (new URLSearchParams(location.search).has('edit')) openDrawer();
