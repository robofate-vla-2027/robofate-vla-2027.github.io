try {
  document.documentElement.dataset.theme = localStorage.getItem('robofate-theme') === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
