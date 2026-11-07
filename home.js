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
