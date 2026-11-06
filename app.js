const $ = id => document.getElementById(id);
const repository = 'xmjlmm/xmjlmm.github.io';
const branch = 'main';
const storageKey = 'xu.github-pages.drafts.v1';
let token = '';
let posts = [];
let library = [];
let drafts = [];
let current = null;
let dirty = false;
let busy = false;
const status = message => $('status').textContent = message;

function readDrafts() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(saved)) throw Error('草稿格式有误，请先导出浏览器数据。');
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
async function refresh() {
  const response = await fetch('./posts.json', {cache: 'no-store'});
  if (!response.ok) throw Error('随笔加载失败，请刷新重试。');
  updatePosts(await response.json());
}
function rebuildLibrary() {
  const merged = new Map(posts.map(post => [post.id, post]));
  for (const draft of drafts) merged.set(draft.id, draft);
  library = sortPosts([...merged.values()]);
  $('library').replaceChildren(new Option('＋ 新建随笔', ''), ...library.map(post => new Option((drafts.some(draft => draft.id === post.id) ? '本地草稿' : '已发布') + ' · ' + post.title, post.id)));
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
  $('remove').textContent = posts.some(item => item.id === post?.id) ? '从主页撤回' : '删除草稿';
  status(post ? (drafts.some(item => item.id === post.id) ? '本地草稿，仅保存在当前浏览器。' : '已发布。编辑后可保存草稿或重新发布。') : '');
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
function encode(text) {
  return btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(''));
}
function decode(text) {
  return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), char => char.charCodeAt(0)));
}
async function github(path, options = {}, accessToken = token) {
  const response = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json', ...options.headers},
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? '令牌已失效，请重新连接 GitHub。' : response.status === 403 ? '没有写入权限或请求过于频繁，请检查令牌权限。' : response.status === 409 || response.status === 422 ? '文章已被其他窗口更新，请重新载入后合并修改。本地草稿已保留。' : 'GitHub 请求失败（' + response.status + '），草稿已保留。');
    error.code = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
async function remotePosts() {
  const file = await github('/repos/' + repository + '/contents/posts.json?ref=' + branch);
  return {sha: file.sha, items: JSON.parse(decode(file.content))};
}
function publicPost(post) {
  return {id: post.id, title: post.title, content: post.content, date: post.date, category: post.category, published: true, updatedAt: post.updatedAt};
}
async function publish(post, withdraw = false) {
  if (!token) {
    $('connection').open = true;
    $('password').focus();
    throw Error('草稿已保存。连接 GitHub 后即可发布或撤回。');
  }
  const remote = await remotePosts();
  const existing = remote.items.find(item => item.id === post.id);
  // Compare the article revision as well as the file SHA to protect concurrent edits.
  if ((existing?.updatedAt || null) !== (post.baseUpdatedAt ?? null)) {
    throw Error('这篇文章的线上版本已有变化。请先导出备份，再刷新页面核对。本地草稿已保留。');
  }
  const next = remote.items.filter(item => item.id !== post.id);
  if (!withdraw) next.push(publicPost(post));
  await github('/repos/' + repository + '/contents/posts.json', {
    method: 'PUT',
    body: JSON.stringify({message: (withdraw ? 'Withdraw: ' : 'Publish: ') + post.title, content: encode(JSON.stringify(sortPosts(next), null, 2) + '\n'), sha: remote.sha, branch})
  });
  updatePosts(next);
  if (withdraw) {
    post.baseUpdatedAt = null;
    post.published = false;
    saveLocal(post);
  } else {
    // Mark the committed revision before local cleanup so a storage failure stays recoverable.
    post.baseUpdatedAt = post.updatedAt;
    current = publicPost(post);
    storeDrafts(drafts.filter(item => item.id !== post.id));
  }
  rebuildLibrary();
  select(current);
  status(withdraw ? '已提交撤回，草稿保留在本机。网站更新通常需要几分钟。' : '已提交发布。当前页面已更新，其他访客将在 GitHub Pages 部署完成后看到文章。');
}
async function run(action) {
  if (busy) return;
  busy = true;
  const controls = [...$('drawer').querySelectorAll('button, input, select, textarea')];
  const disabledStates = controls.map(control => control.disabled);
  controls.forEach(control => control.disabled = true);
  try { await action(); }
  catch (error) { status(error.name === 'TimeoutError' || error instanceof TypeError ? '网络连接失败或超时，请重试。已保存的本地草稿可继续编辑。' : error.message); }
  finally {
    busy = false;
    controls.forEach((control, index) => control.disabled = disabledStates[index]);
  }
}
function capture() {
  const local = drafts.find(item => item.id === current?.id);
  return {
    id: current?.id || crypto.randomUUID(),
    title: $('title').value.trim(), content: $('body').value,
    date: $('date').value, category: $('category').value.trim() || '随笔',
    published: false, updatedAt: new Date().toISOString(),
    baseUpdatedAt: local ? local.baseUpdatedAt : current?.updatedAt || null
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
  const publishing = event.submitter?.value === 'publish';
  run(async () => {
    const post = capture();
    if (!post.title || !post.date || publishing && !post.content.trim()) throw Error('请填写标题、日期和正文后再发布。');
    saveLocal(post);
    rebuildLibrary();
    if (publishing) await publish(post);
    else status('草稿已保存到当前浏览器。可导出备份，换电脑后导入继续写。');
    $('remove').hidden = false;
  });
};
$('login').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const candidate = $('password').value.trim();
    $('password').value = '';
    const account = await github('/user', {}, candidate);
    if (account.login.toLowerCase() !== 'xmjlmm') throw Error('请使用主页所属账号 xmjlmm 的令牌。');
    const repo = await github('/repos/' + repository, {}, candidate);
    if (!repo.permissions?.push) throw Error('这个令牌没有仓库写入权限。');
    token = candidate;
    const remote = await remotePosts();
    updatePosts(remote.items);
    rebuildLibrary();
    $('connection-label').textContent = '已连接 xmjlmm';
    $('connection').open = false;
    $('logout').hidden = false;
    status('已连接。现在可以直接发布文章。刷新或关闭页面后需要重新连接。');
  });
};
$('logout').onclick = () => {
  token = '';
  $('password').value = '';
  $('logout').hidden = true;
  $('connection-label').textContent = '连接 GitHub 以发布';
  status('已断开 GitHub，仍可在本机写作并保存草稿。');
};
$('toggle').onclick = () => {
  const show = $('preview').hidden;
  prose($('preview'), $('body').value);
  $('preview').hidden = !show;
  $('body').hidden = show;
  $('toggle').textContent = show ? '继续编辑' : '预览';
};
$('remove').onclick = () => {
  if (!current || busy) return;
  const published = posts.some(item => item.id === current.id);
  if (!confirm(published ? '将文章从主页撤回，并保留本机草稿？' : '删除这篇本机草稿？')) return;
  run(async () => {
    if (published) {
      const post = capture();
      saveLocal(post);
      await publish(post, true);
    } else {
      storeDrafts(drafts.filter(item => item.id !== current.id));
      current = null;
      rebuildLibrary();
      select(null);
      status('草稿已删除。');
    }
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
  storeDrafts([...drafts, ...imported]);
  rebuildLibrary();
  status('已导入 ' + imported.length + ' 篇本机草稿，可在文章列表选择。');
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
  try { drafts = readDrafts(); rebuildLibrary(); status('另一窗口更新了草稿。请核对后继续编辑。'); } catch (error) { status(error.message); }
});
try { drafts = readDrafts(); } catch (error) { status('浏览器草稿读取失败：' + error.message); }
refresh().then(() => {
  rebuildLibrary();
  if (location.hash.startsWith('#post-')) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}).catch(error => { $('entries').textContent = error.message; });
if (new URLSearchParams(location.search).has('edit')) openDrawer();
