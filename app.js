// Lógica da página: lê os links, busca cada vídeo, monta a fila e faz os downloads.
(() => {
  const $ = (id) => document.getElementById(id);
  const campo = $('links'), contador = $('contador'), btnBuscar = $('buscar'), chkHd = $('hd'), btnColar = $('colar'), dica = $('dica');
  const resultado = $('resultado'), resumo = $('resumo'), barra = $('barra'), lista = $('lista'), btnVerFila = $('verfila');
  const btnZip = $('zip'), zipTxt = $('zip-txt'), btnUm = $('umporum'), btnMp3 = $('zipmp3'), mp3Txt = $('mp3-txt'), btnRefazer = $('refazer');
  const btnMais = $('mais'), btnNovo = $('novo');

  const RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*tiktok\.com\/[^\s"'<>,]+/gi;
  const ESPERA_ENTRE_BUSCAS = 1150; // o serviço aceita ~1 busca por segundo
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chave = (u) => u.split('?')[0].replace(/\/+$/, '').toLowerCase().replace(/^https?:\/\/(m\.|www\.)?/, '');
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  let itens = [];
  let buscando = false, baixandoTudo = false, seq = 0;

  try { const v = localStorage.getItem('bel-hd'); if (v !== null) chkHd.checked = v === '1'; } catch (e) {}
  chkHd.addEventListener('change', () => { try { localStorage.setItem('bel-hd', chkHd.checked ? '1' : '0'); } catch (e) {} itens.forEach(atualizar); atualizarPainel(); });

  // ---------- leitura dos links ----------
  // Devolve os links únicos e quantos vieram repetidos no texto colado.
  function extrair(texto) {
    const vistos = new Set(), links = [];
    let repetidos = 0;
    for (let m of texto.match(RE) || []) {
      m = m.replace(/[.;:)\]}!]+$/, '');
      if (!/^https?:\/\//i.test(m)) m = 'https://' + m;
      const k = chave(m);
      if (vistos.has(k)) { repetidos++; continue; }
      vistos.add(k); links.push(m);
    }
    return { links, repetidos };
  }

  function analisar() {
    const { links, repetidos } = extrair(campo.value);
    const naFila = new Set(itens.map((i) => chave(i.url)));
    const novos = links.filter((u) => !naFila.has(chave(u)));
    return { novos, repetidos, jaNaFila: links.length - novos.length };
  }

  function contar() {
    const { novos, repetidos, jaNaFila } = analisar();
    const extras = [];
    if (repetidos) extras.push(plural(repetidos, 'duplicado ignorado', 'duplicados ignorados'));
    if (jaNaFila) extras.push(`${jaNaFila} já na fila`);
    contador.innerHTML = `<b>${novos.length}</b> ${novos.length === 1 ? 'link novo' : 'links novos'}${extras.map((t) => ` · ${t}`).join('')}`;
    btnBuscar.disabled = novos.length === 0;
  }
  campo.addEventListener('input', () => { dica.hidden = true; contar(); });

  // Colar sempre deixa o texto numa linha própria e o cursor na linha de baixo, pronto para o próximo link.
  function colarTexto(t) {
    let txt = t.replace(/\r\n?/g, '\n').trim();
    if (!txt) return;
    const v = campo.value;
    let ini = campo.selectionStart, fim = campo.selectionEnd;
    // Cursor no meio de uma linha (sem nada selecionado): cola no fim dela, para não partir um link ao meio.
    if (ini === fim && v[fim] !== undefined && v[fim] !== '\n') {
      const quebra = v.indexOf('\n', fim);
      ini = fim = quebra === -1 ? v.length : quebra;
      campo.setSelectionRange(ini, fim);
    }
    if (ini > 0 && v[ini - 1] !== '\n') txt = '\n' + txt;
    if (v[fim] !== '\n') txt += '\n';
    campo.focus();
    // insertText mantém o Ctrl+Z funcionando; setRangeText é o plano B.
    if (!document.execCommand('insertText', false, txt)) campo.setRangeText(txt, ini, fim, 'end');
    contar();
  }
  campo.addEventListener('paste', (ev) => {
    const t = ev.clipboardData?.getData('text');
    if (!t) return;
    ev.preventDefault();
    colarTexto(t);
  });

  function mostrarDica(txt) { dica.textContent = txt; dica.hidden = false; }

  btnColar.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error('sem suporte');
      const t = await navigator.clipboard.readText();
      if (!t.trim()) { mostrarDica('Não há nada copiado. Copie os links no TikTok e toque em Colar de novo.'); return; }
      campo.setSelectionRange(campo.value.length, campo.value.length);
      colarTexto(t);
      dica.hidden = true;
      contar();
      if (!analisar().novos.length) mostrarDica('O texto colado não tem nenhum link novo do TikTok.');
    } catch (e) {
      campo.focus();
      mostrarDica('Seu navegador não liberou o botão Colar. Toque e segure dentro da caixa e escolha “Colar”.');
    }
  });

  btnBuscar.addEventListener('click', () => {
    const { novos } = analisar();
    campo.value = ''; contar();
    if (!novos.length) return;
    novos.forEach((url) => { const item = { uid: ++seq, url, status: 'fila', dados: null, erro: '', prog: 0 }; itens.push(item); criarCard(item); });
    atualizarPainel();
    mostrarResultado();
    processar();
  });

  // ---------- troca de tela: início ⇄ resultado ----------
  // A tela de resultado entra no histórico, então o "voltar" do celular retorna para o início.
  const naTelaResultado = () => document.body.classList.contains('tela-resultado');

  function mostrarResultado(empilhar = true) {
    if (!itens.length) return;
    if (empilhar && !naTelaResultado()) history.pushState({ tela: 'resultado' }, '');
    document.body.classList.add('tela-resultado');
    resultado.hidden = false;
    window.scrollTo(0, 0);
  }

  function mostrarInicio() {
    document.body.classList.remove('tela-resultado');
    resultado.hidden = true;
    const n = itens.length;
    btnVerFila.hidden = n === 0;
    btnVerFila.textContent = `Ver sua fila (${plural(n, 'vídeo', 'vídeos')}) →`;
  }

  // Sai da tela de resultado; se ela estiver no histórico, volta uma página para não deixar entrada sobrando.
  function voltarAoInicio() {
    if (history.state?.tela === 'resultado') history.back();
    mostrarInicio();
  }

  window.addEventListener('popstate', (ev) => {
    if (ev.state?.tela === 'resultado' && itens.length) mostrarResultado(false); else mostrarInicio();
  });

  // Links do menu (#como-usar, #perguntas…) precisam das seções do início visíveis.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (a && naTelaResultado()) { mostrarInicio(); history.replaceState(null, ''); }
  });

  btnVerFila.addEventListener('click', () => mostrarResultado());
  btnMais.addEventListener('click', () => { voltarAoInicio(); window.scrollTo(0, 0); campo.focus({ preventScroll: true }); });
  // Limpar lista: com mais de um vídeo, o primeiro toque pede confirmação (some sozinho depois de 4 s).
  const novoTxt = $('novo-txt');
  let confirmarTimer = null;
  function desarmarLimpar() { clearTimeout(confirmarTimer); btnNovo.classList.remove('confirmar'); novoTxt.textContent = 'Limpar lista'; }
  btnNovo.addEventListener('click', () => {
    if (baixandoTudo) return;
    if (itens.length > 1 && !btnNovo.classList.contains('confirmar')) {
      btnNovo.classList.add('confirmar');
      novoTxt.textContent = `Toque de novo para apagar ${itens.length} vídeos`;
      confirmarTimer = setTimeout(desarmarLimpar, 4000);
      return;
    }
    desarmarLimpar();
    itens = []; lista.replaceChildren();
    atualizarPainel(); contar();
    voltarAoInicio(); window.scrollTo(0, 0); campo.focus({ preventScroll: true });
  });

  async function processar() {
    if (buscando) return;
    buscando = true;
    let item;
    while ((item = itens.find((i) => i.status === 'fila'))) {
      await buscar(item);
      if (itens.some((i) => i.status === 'fila')) await sleep(ESPERA_ENTRE_BUSCAS);
    }
    buscando = false;
    atualizarPainel();
  }

  async function buscar(item) {
    item.status = 'buscando'; item.erro = ''; atualizar(item); atualizarPainel();
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      try {
        // POST: o link vai no corpo da requisição, nunca no endereço (endereços ficam em logs e histórico).
        const r = await fetch('/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: item.url }) });
        const j = await r.json();
        if (j.ok) { item.dados = j; item.status = 'pronto'; break; }
        if (j.limite && tentativa < 4) { await sleep(1600 + tentativa * 800); continue; }
        item.status = 'erro'; item.erro = j.erro || 'Não foi possível buscar este vídeo.'; break;
      } catch (e) {
        if (tentativa < 4) { await sleep(1500); continue; }
        item.status = 'erro'; item.erro = 'Sem conexão com o servidor do site.';
      }
    }
    if (item.status === 'buscando') { item.status = 'erro'; item.erro = 'Não foi possível buscar este vídeo.'; }
    atualizar(item); ordenar(); atualizarPainel();
  }

  // Mais visualizados no topo. Quem ainda não tem dados (na fila, buscando ou com erro) fica embaixo, na ordem colada.
  function ordenar() {
    itens.sort((a, b) => {
      if (!!a.dados !== !!b.dados) return a.dados ? -1 : 1;
      if (a.dados) return (b.dados.views || 0) - (a.dados.views || 0) || a.uid - b.uid;
      return a.uid - b.uid;
    });
    itens.forEach((i) => { const el = $('item-' + i.uid); if (el) lista.appendChild(el); });
  }

  // ---------- nomes e links de download ----------
  // Nome do arquivo: "@perfil - AAAA-MM-DD - id", para a pasta ficar organizada por perfil e data.
  const limpa = (s) => String(s).replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const dataIso = (ts) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function base(item) {
    const d = item.dados;
    return limpa([`@${d.autor || 'tiktok'}`, dataIso(d.data), d.id || item.uid].filter(Boolean).join(' - '));
  }
  function arquivos(item, modo = 'video') {
    const d = item.dados; if (!d) return [];
    const b = base(item);
    if (modo === 'mp3') return d.audio ? [{ src: d.audio, nome: `${b}.mp3` }] : [];
    if (d.tipo === 'fotos') {
      return d.imagens.map((src, k) => ({ src, nome: `${b} - foto ${String(k + 1).padStart(2, '0')}.jpg` }));
    }
    const src = (chkHd.checked && d.videoHd) ? d.videoHd : (d.video || d.videoHd);
    return src ? [{ src, nome: `${b}.mp4` }] : [];
  }
  const mb = (bytes) => bytes ? (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB' : '';
  const tempo = (s) => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';

  // ---------- cards ----------
  const ROTULO = { fila: 'Na fila', buscando: 'Buscando', pronto: 'Pronto', baixando: 'Baixando', baixado: 'Baixado', erro: 'Erro' };

  const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const ICO = {
    play: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6Z" fill="currentColor"/></svg>',
    views: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6Z" fill="currentColor"/></svg>',
    coment: '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.5c0-2.8 2.5-4.8 5.5-4.8s5.5 2 5.5 4.8-2.5 4.8-5.5 4.8c-.8 0-1.5-.1-2.2-.4L3 13l.6-2.4a4.4 4.4 0 0 1-1.1-3.1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    compart: '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 3l5 4.5L9 12V9.5c-3.5 0-5.5 1-7 3.5.5-3.5 2.5-6 7-6.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  };

  function criarCard(item) {
    const el = document.createElement('article');
    el.className = 'item'; el.id = 'item-' + item.uid;
    lista.appendChild(el);
    atualizar(item);
  }

  function atualizar(item) {
    const el = $('item-' + item.uid); if (!el) return;
    const d = item.dados;
    const capa = d && d.capa ? `style="background-image:url('${esc(d.capa)}')"` : '';
    const capaTxt = d ? '' : (item.status === 'erro' ? '!' : '···');
    let meta = `<span class="chip ${item.status}">${ROTULO[item.status]}</span>`;
    if (d) {
      const partes = [];
      if (d.tipo === 'fotos') partes.push(`${d.imagens.length} fotos`);
      else {
        const hd = chkHd.checked && d.videoHd;
        const tam = hd ? (d.tamanhoHd || d.tamanho) : d.tamanho;
        partes.push(tempo(d.duracao), mb(tam), hd ? 'HD' : '');
      }
      if (d.data) partes.push(dataIso(d.data).split('-').reverse().join('/'));
      meta += partes.filter(Boolean).map((t) => `<span>${t}</span>`).join('<span aria-hidden="true">·</span>');
    }
    let topo = `<div class="url">${esc(item.url.replace(/^https?:\/\//, ''))}</div>`;
    if (d) {
      const titulo = d.titulo || (d.tipo === 'fotos' ? 'Carrossel de fotos' : 'Vídeo sem legenda');
      const stats = [
        d.views ? `<span title="Visualizações">${ICO.views}${compacto.format(d.views)}</span>` : '',
        d.comentarios ? `<span title="Comentários">${ICO.coment}${compacto.format(d.comentarios)}</span>` : '',
        d.compartilhamentos ? `<span title="Compartilhamentos">${ICO.compart}${compacto.format(d.compartilhamentos)}</span>` : '',
      ].join('');
      topo = `<div class="titulo">${esc(titulo)}</div>
        <div class="autor">${d.autorFoto ? `<img src="${esc(d.autorFoto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>@${esc(d.autor || 'tiktok')}</span></div>
        ${stats ? `<div class="stats">${stats}</div>` : ''}`;
    }
    const erro = item.status === 'erro' ? `<div class="msg-erro">${esc(item.erro)}</div>` : '';
    const mini = item.status === 'baixando'
      ? `<div class="mini${item.prog === null ? ' indef' : ''}" role="progressbar" aria-label="Progresso do download"><i style="width:${Math.round((item.prog || 0) * 100)}%"></i></div>`
      : '';

    let lado = '';
    if (d) {
      const arqs = arquivos(item);
      if (arqs.length) lado = `<button data-acao="baixar" data-modo="video" data-uid="${item.uid}">${d.tipo === 'fotos' ? 'Baixar fotos' : 'Baixar'}</button>`;
      if (arquivos(item, 'mp3').length) lado += `<button class="mp3" data-acao="baixar" data-modo="mp3" data-uid="${item.uid}" title="Baixar só o áudio">MP3</button>`;
    } else if (item.status === 'erro') {
      lado = `<button data-acao="tentar" data-uid="${item.uid}">Tentar de novo</button>`;
    }
    lado += `<button class="discreto" data-acao="remover" data-uid="${item.uid}" aria-label="Remover da lista" title="Remover">✕</button>`;

    const capaHtml = d
      ? `<a class="capa" href="${esc(item.url)}" target="_blank" rel="noopener" ${capa} aria-label="Ver no TikTok" title="Ver no TikTok"><span class="play">${ICO.play}</span></a>`
      : `<div class="capa">${capaTxt}</div>`;
    el.innerHTML = `${capaHtml}
      <div class="info">${topo}<div class="meta">${meta}</div>${mini}${erro}</div>
      <div class="lado">${lado}</div>`;
  }

  // Atualiza só a barrinha do card (sem redesenhar o card inteiro a cada pedaço baixado).
  function progresso(item, p) {
    item.prog = p;
    const el = document.querySelector(`#item-${item.uid} .mini`); if (!el) return;
    el.classList.toggle('indef', p === null);
    el.firstElementChild.style.width = Math.round((p || 0) * 100) + '%';
  }

  lista.addEventListener('click', async (ev) => {
    const alvo = ev.target.closest('[data-acao]'); if (!alvo) return;
    const item = itens.find((i) => i.uid === Number(alvo.dataset.uid)); if (!item) return;
    const acao = alvo.dataset.acao;
    if (acao === 'baixar' && !baixandoTudo) baixarDireto(item, alvo.dataset.modo);
    if (acao === 'tentar') { item.status = 'fila'; atualizar(item); processar(); }
    if (acao === 'remover') {
      itens = itens.filter((i) => i !== item); $('item-' + item.uid)?.remove();
      atualizarPainel(); contar();
      if (!itens.length) voltarAoInicio();
    }
  });

  // ---------- painel ----------
  function atualizarPainel() {
    const total = itens.length;
    const prontos = itens.filter((i) => i.dados).length;
    const comAudio = itens.filter((i) => i.dados?.audio).length;
    const erros = itens.filter((i) => i.status === 'erro').length;
    const fila = itens.filter((i) => i.status === 'fila' || i.status === 'buscando').length;
    const resolvidos = prontos + itens.filter((i) => i.status === 'erro' && !i.dados).length;
    if (!baixandoTudo) {
      resumo.innerHTML = `<span class="grande">${prontos} de ${total}</span>
        <span>${prontos === 1 ? 'vídeo pronto' : 'vídeos prontos'}</span>
        ${fila ? `<span>· buscando ${fila}…</span>` : ''}
        ${erros ? `<span style="color:var(--err)">· ${erros} com erro</span>` : ''}`;
      barra.style.width = total ? (resolvidos / total * 100) + '%' : '0';
    }
    // Com um vídeo só, os botões baixam direto (sem ZIP), como num site de download comum.
    const sozinho = total === 1;
    const fotos = sozinho && itens[0].dados?.tipo === 'fotos';
    zipTxt.textContent = sozinho ? (fotos ? 'Baixar fotos (sem marca d\'água)' : 'Baixar sem marca d\'água') : `Baixar todos em ZIP (${prontos})`;
    mp3Txt.textContent = sozinho ? 'Baixar só o MP3' : 'Só os MP3 (ZIP)';
    btnUm.hidden = sozinho;
    lista.classList.toggle('sozinho', sozinho);
    btnZip.disabled = baixandoTudo || prontos === 0;
    btnUm.disabled = baixandoTudo || prontos === 0;
    btnMp3.disabled = baixandoTudo || comAudio === 0;
    btnRefazer.hidden = erros === 0 || buscando || baixandoTudo;
    btnNovo.disabled = baixandoTudo;
  }

  // Baixa os arquivos de um item e entrega cada um como download, com progresso no card.
  async function salvarItem(item, modo) {
    const arqs = arquivos(item, modo);
    item.status = 'baixando'; item.prog = 0; atualizar(item);
    try {
      for (const [k, a] of arqs.entries()) {
        const blob = await baixarBlob(a, (p) => progresso(item, p === null ? null : (k + p) / arqs.length));
        salvar(blob, a.nome);
        if (k < arqs.length - 1) await sleep(600);
      }
      item.status = 'baixado';
    } catch (e) {
      item.status = 'erro'; item.erro = 'Falhou ao baixar o arquivo. Tente de novo.';
    }
    atualizar(item);
    return item.status === 'baixado';
  }

  function salvar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = nome;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function baixarDireto(item, modo) {
    baixandoTudo = true; atualizarPainel();
    resumo.innerHTML = `<span class="grande">Baixando…</span><span>O arquivo vai para a pasta de downloads.</span>`;
    await salvarItem(item, modo);
    baixandoTudo = false; atualizarPainel();
  }

  btnUm.addEventListener('click', async () => {
    const lote = itens.filter((i) => arquivos(i).length);
    baixandoTudo = true; atualizarPainel();
    let n = 0;
    for (const item of lote) {
      n++;
      resumo.innerHTML = `<span class="grande">Baixando ${n} de ${lote.length}</span><span>Se o navegador perguntar, permita vários downloads.</span>`;
      barra.style.width = ((n - 1) / lote.length * 100) + '%';
      await salvarItem(item, 'video');
      await sleep(600);
    }
    barra.style.width = '100%';
    baixandoTudo = false; atualizarPainel();
  });

  // Baixa um arquivo lendo aos pedaços, para mostrar o progresso (null = tamanho desconhecido).
  async function baixarBlob(a, aoAvancar) {
    const r = await fetch('/api/video', { method: 'POST', body: new URLSearchParams({ u: a.src }) });
    if (!r.ok) throw new Error(r.status);
    const total = Number(r.headers.get('content-length')) || 0;
    if (!r.body?.getReader) return r.blob();
    const leitor = r.body.getReader(), partes = [];
    let recebido = 0;
    aoAvancar(total ? 0 : null);
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value); recebido += value.length;
      aoAvancar(total ? Math.min(recebido / total, 1) : null);
    }
    return new Blob(partes, { type: r.headers.get('content-type') || '' });
  }

  async function gerarZip(modo) {
    if (!window.JSZip) { alert('Não foi possível carregar o gerador de ZIP. Recarregue a página.'); return; }
    const lote = itens.filter((i) => arquivos(i, modo).length);
    if (!lote.length) return;
    baixandoTudo = true; atualizarPainel();
    const zip = new JSZip();
    const nomes = new Set();
    let feitos = 0, falhas = 0;
    for (const item of lote) {
      item.status = 'baixando'; item.prog = 0; atualizar(item);
      resumo.innerHTML = `<span class="grande">Juntando ${feitos + 1} de ${lote.length}</span><span>Não feche a página.</span>`;
      const arqs = arquivos(item, modo);
      let ok = true;
      for (const [k, a] of arqs.entries()) {
        try {
          const blob = await baixarBlob(a, (p) => {
            const doItem = p === null ? null : (k + p) / arqs.length;
            progresso(item, doItem);
            barra.style.width = ((feitos + (doItem ?? 0)) / lote.length * 100) + '%';
          });
          let nome = a.nome;
          for (let n = 2; nomes.has(nome); n++) nome = a.nome.replace(/(\.\w+)$/, ` (${n})$1`);
          nomes.add(nome);
          zip.file(nome, blob, { binary: true });
        } catch (e) { ok = false; }
      }
      feitos++;
      if (ok) { item.status = 'baixado'; } else { falhas++; item.status = 'erro'; item.erro = 'Falhou ao baixar o arquivo. Tente de novo.'; }
      atualizar(item);
      barra.style.width = (feitos / lote.length * 100) + '%';
    }
    resumo.innerHTML = `<span class="grande">Gerando o ZIP…</span>`;
    try {
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const nome = `baixaemlote-${modo === 'mp3' ? 'audios-tiktok' : 'tiktoks'}-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}h${p2(d.getMinutes())}.zip`;
      salvar(blob, nome);
    } catch (e) {
      alert('Não deu para gerar o ZIP (talvez falte memória com tantos arquivos). Use "Baixar um por um".');
    }
    baixandoTudo = false; atualizarPainel();
    if (falhas) resumo.insertAdjacentHTML('beforeend', `<span style="color:var(--err)">· ${plural(falhas, 'ficou', 'ficaram')} fora do ZIP</span>`);
  }

  const umSo = (modo) => (itens.length === 1 && arquivos(itens[0], modo).length ? itens[0] : null);
  btnZip.addEventListener('click', () => { const i = umSo('video'); i ? baixarDireto(i, 'video') : gerarZip('video'); });
  btnMp3.addEventListener('click', () => { const i = umSo('mp3'); i ? baixarDireto(i, 'mp3') : gerarZip('mp3'); });

  btnRefazer.addEventListener('click', () => {
    itens.filter((i) => i.status === 'erro').forEach((i) => { i.status = i.dados ? 'pronto' : 'fila'; i.erro = ''; atualizar(i); });
    atualizarPainel(); processar();
  });

  // FAQ: abrir uma pergunta fecha as outras (reforço para navegadores sem suporte a <details name>).
  const perguntas = document.querySelectorAll('.faq details');
  perguntas.forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) perguntas.forEach((o) => { if (o !== d) o.open = false; });
  }));

  contar();
})();
