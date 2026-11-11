// Tema claro/escuro. Carregado no <head> (sem defer) para aplicar o tema salvo antes da página aparecer.
// Primeira visita: segue o tema do aparelho. Depois que a pessoa toca no botão, guarda a escolha.
(() => {
  const CHAVE = 'bel-tema';
  const raiz = document.documentElement;
  const escuroSistema = window.matchMedia('(prefers-color-scheme: dark)');

  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE); } catch (e) {}
  if (salvo === 'dark' || salvo === 'light') raiz.dataset.theme = salvo;

  const atual = () => raiz.dataset.theme || (escuroSistema.matches ? 'dark' : 'light');

  function sincronizar() {
    const escuro = atual() === 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = escuro ? '#0E1016' : '#F3F4F7';
    document.querySelectorAll('[data-tema-btn]').forEach((b) => {
      const txt = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
      b.setAttribute('aria-label', txt); b.title = txt;
    });
  }

  escuroSistema.addEventListener?.('change', sincronizar);

  document.addEventListener('DOMContentLoaded', () => {
    sincronizar();
    document.querySelectorAll('[data-tema-btn]').forEach((b) => b.addEventListener('click', () => {
      const novo = atual() === 'dark' ? 'light' : 'dark';
      raiz.dataset.theme = novo;
      try { localStorage.setItem(CHAVE, novo); } catch (e) {}
      sincronizar();
    }));
    document.querySelectorAll('[data-ano]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  });
})();
