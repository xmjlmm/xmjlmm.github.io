const copy = document.getElementById('copy');
copy.onclick = async () => {
  try {
    await navigator.clipboard.writeText('2651094755');
    copy.textContent = 'QQ　2651094755　已复制';
  } catch {
    copy.textContent = 'QQ　2651094755　请手动复制';
  }
};
// Preserve previously bookmarked note URLs after moving the journal.
if (location.hash.startsWith('#post-') || new URLSearchParams(location.search).has('edit')) {
  location.replace('./blog.html' + location.search + location.hash);
}

const projectFilters = [...document.querySelectorAll('[data-project-filter]')];
const projectCards = [...document.querySelectorAll('[data-project-category]')];
projectFilters.forEach(button => {
  button.onclick = () => {
    const category = button.dataset.projectFilter;
    projectFilters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
    let count = 0;
    projectCards.forEach(card => {
      card.hidden = category !== 'all' && card.dataset.projectCategory !== category;
      if (!card.hidden) count++;
    });
    document.getElementById('project-list-title').textContent = button.childNodes[0].textContent.trim();
    document.getElementById('project-result-count').textContent = count + ' 个项目';
  };
});
