// Área restrita de comentários: senha → puxa comentários de cada vídeo → filtra o ruído → classifica
// → monta o texto para colar no Claude.
(() => {
  const $ = (id) => document.getElementById(id);
  const telaLogin = $('tela-login'), telaApp = $('tela-app'), formLogin = $('form-login'), campoSenha = $('senha'), erroLogin = $('erro-login'), btnEntrar = $('entrar');
  const campo = $('links'), contador = $('contador'), btnPuxar = $('puxar'), aviso = $('aviso'), barra = $('barra');
  const nicho = $('nicho'), qtd = $('qtd'), lista = $('videos'), final = $('final'), resumo = $('resumo');
  const btnCopiar = $('copiar'), btnTxt = $('baixar-txt'), btnSair = $('sair');

  const RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*tiktok\.com\/[^\s"'<>,]+/gi;
  const ESPERA = 1150; // o serviço aceita ~1 busca por segundo
  const MAX_PROMPT = 60000; // caracteres de comentários no texto final (o Claude aguenta bem)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

  // =====================================================================
  // FILTRO DE RUÍDO
  // Ordem: autor do vídeo → spam → só emoji/figurinha → conversa de fã → elogio puro → palavra solta.
  // Nada aqui olha curtida: curtida só desempata depois que o comentário já passou e foi classificado.
  // =====================================================================

  // Deixa o texto comparável: minúsculo, sem acento, sem figurinha [Olhos de coração], sem @menção,
  // sem link, sem emoji, e com letras repetidas juntadas ("liiindooo" → "lindo").
  const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const FIGURINHA = /\[[^\]\n]{1,40}\]/g;
  function normal(t) {
    return semAcento(t.toLowerCase())
      .replace(FIGURINHA, ' ').replace(/@[\w.]+/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/#[\w]+/g, ' ')
      .replace(/[^\p{L}\p{N}?\s]/gu, ' ')
      .replace(/(\p{L})\1+/gu, '$1')
      .replace(/\s+/g, ' ').trim();
  }
  const juntar = (w) => semAcento(w).replace(/(\p{L})\1+/gu, '$1');

  // Palavras de elogio/reação e de "enchimento". Se um comentário só tem palavras daqui, é elogio puro.
  const ELOGIO = new Set(`
    lindo linda lindos lindas lindeza lindisimo lindisima lindao amei amo amando adorei adoro adoravel gostei
    perfeito perfeita perfeitos perfeitas perfeicao arasou arasa arasando araso lacrou lacrando uau wow uow
    nosa show top divino divina divinos divinas parabens maravilhoso maravilhosa maravilhosos maravilha maravilhas
    incrivel incriveis sensacional espetacular fantastico fantastica demais fofo fofa fofos fofura delicado delicada
    delicadeza chique chic luxo luxuoso luxuosa elegante encantador encantadora encantada encantado apaixonada
    apaixonado apaixonante sonho amor bom boa bonito bonita bonitos bonitas belo bela beleza capricho caprichado
    caprichada impecavel sucesso obra prima arte artista talento talentosa talentoso diva rainha mara
    love beautiful amazing cute nice omg wonderful gorgeous so very
    mds deus meu minha gente que q tao muito mt mto mais tudo ficou fica ficaram ficando sempre simplesmente isso
    e eh de da do das dos um uma o a os as coisa coisas bem ta esta ai aii cara caramba mano menina mulher amiga amg
    eu achei acho ja como trabalho resultado quero nao parar ver vendo olhar assistir tudinho por vc voce
  `.trim().split(/\s+/).map(juntar));

  const SPAM = /(trabalhamos com|nosso (site|perfil|insta|instagram|cat[áa]logo|whats|trabalho|ateli)|nossa (loja|empresa|p[áa]gina|equipe)|meu perfil|no meu insta|me (sigam|segue|seguir)|sigam|seguir (tb|tamb[ée]m)|segue (l[áa]|a gente)|d[áa] uma olhad|chama no (direct|privado|whats|pv)|link na bio|(n[ãa]o )?(se )?esque[çc]am de|encomend(e|em) (com|conosco|j[áa])|fa[çc]o sob encomenda|aceito encomenda|vendo (convite|kit|painel|pain[ée]is)|convites? digita(l|is)|www\.|https?:\/\/|\.com(\.br)?\b|wa\.me|whatsapp|\bpix\b|or[çc]amento no)/i;

  const FA = /((ela|voc[eê]|vc) (n[ãa]o erra|acerta|[ée] (demais|incr|a melhor|perfeit|maravilh|top)|arras|manda muito)|n[ãa]o erra (nenhuma|uma|nunca|nada)|acerta todas|(sua|essa|que) voz|voz (dela|sua|calma)|paz da sua|(pr[óo]xim[ao]|outr[ao]) (v[íi]deo|festa|perfil|post|conta)|postar a festa|ansios[ao] (pra|para|por|pela)|decora[çc][ãa]o dela|\bdela [ée] sempre|sou (sua )?f[ãa]|te amo|amo (voc[eê]|vc|seu trabalho|seus v[íi]deos|suas)|melhor (decoradora|perfil|conta)|me adota)/i;

  // =====================================================================
  // CLASSIFICAÇÃO (só do que sobrou)
  // =====================================================================
  const CONTRATAR = /(de onde (voc[eê]|vc|tu|ela) (é|e|s[ãa]o)|(voc[eê]|vc) (é|e) de onde|qual (a |sua |tua )?cidade|que cidade|qual estado|de qual (cidade|estado)|onde (voc[eê]|vc|ela) (mora|fica|atende)|atende (em|onde|a regi|na regi|fora|outra)|(faz|fazem|atendem?) (em|pra|para) (outr|fora|s[ãa]o paulo|sp|rj|bh)|onde fica (o |a |seu |sua )?(ateli|loja|espa)|quero contratar|como (fa[çc]o )?(pra|para) contratar|(manda|passa|qual) (o )?(whats|contato|n[uú]mero))/i;

  const CLASSES = [
    ['objeção', /(parece (sempre|mais|muito|meio|um pouco|coisa|tudo)|achei (muito |meio |bem |um pouco |ela )?(adult|exager|polu|feio|feia|car[oa]|escur|simples|vazi|estranh|sem gra|brega|pesad|carregad)|sempre (a|o) mesm|mesma coisa|n[ãa]o (gostei|curti|combina)|exagerad|polu[íi]d|cafona|brega|\bfei[oa]\b|muito (car[oa]|adult|escur|chei|simples|pesad|carregad)|caro demais|mais (pra|para) (adolescente|adulto|menin)|faltou|poderia ter|deveria ter|\bmas (achei|n[ãa]o|faltou))/i],
    ['dor', /(n[ãa]o consig|n[ãa]o sei (fazer|como|montar|onde)|dificuldade|tenho medo|vergonha|n[ãa]o aguento|sofr|frustr|desist|sem dinheiro|sem tempo|n[ãa]o tenho (dinheiro|tempo|espa[çc]o|condi|jeito)|j[áa] tentei|nunca (consegui|deu|fica)|sempre (d[áa] errado|fica (feio|torto|ruim))|perdi|preju[íi]zo|ningu[ée]m (compra|valoriza|contrata)|n[ãa]o vend|fica caro|muito caro|t[ãa]o caro|gastei|socorro|me ajud)/i],
    ['dúvida', /(\?|^(onde|qual|quais|quanto|quantos|quantas|como|quem|tem|vende|faz|fazem|aceita|serve|precisa|link|valor|pre[çc]o|medida|tamanho)\b|link d[aeo]s?|\bvalor\b|\bpre[çc]o\b|quanto (custa|cobr|sai|fica|gast|dinheiro)|onde (compr|ach|encontr|vend)|qual (o |a )?(nome|marca|loja|tamanho|medida|material|tecido|papel|cor))/i],
    ['desejo', /(queria|quero (fazer|um|uma|esse|essa|ter|aprender|muito)|gostaria|adoraria|amaria|meu sonho|sonho (de|em|fazer|ter)|vou fazer|vou copiar|preciso (fazer|de|aprender)|pensando em|t[ôo] pensando|quem dera|inspira[çc][ãa]o|pra (festa|anivers[áa]rio|ch[áa]|mesvers[áa]rio) d[aoe] (minha|meu))/i],
    ['relato', /(comecei|come[çc]ando|parei|recome[çc]|sou m[ãa]e|sou (decoradora|confeiteira|iniciante|nova)|trabalho com|eu fa[çc]o|j[áa] fiz|\bfiz\b|meu filho|minha filha|meu marido|na minha (festa|casa|cidade)|aqui em casa|tenho (uma|um) (loja|ateli|filh|neg)|minha (loja|cliente|festa))/i],
  ];
  const ORDEM = ['objeção', 'dor', 'dúvida', 'desejo', 'relato', 'outro'];

  // Devolve o motivo da remoção (texto) ou null se o comentário fica.
  function motivoRemocao(c, txt) {
    if (c.doAutor) return 'do próprio criador';
    const n = normal(txt);
    const temPergunta = n.includes('?');
    const palavras = n.replace(/\?/g, ' ').split(/\s+/).filter(Boolean);
    if (!palavras.length || palavras.join('').length < 2) return 'só emoji ou figurinha';
    if (SPAM.test(txt) && !temPergunta) return 'spam ou autopromoção';
    const util = CONTRATAR.test(txt) || CLASSES.some(([, re]) => re !== CLASSES[2][1] && re.test(txt));
    if (FA.test(txt) && !util) return 'conversa de fã';
    if (!temPergunta && !util && palavras.every((p) => ELOGIO.has(p))) return 'elogio puro';
    if (palavras.length === 1 && !temPergunta && !util) return 'palavra solta / algoritmo';
    return null;
  }
  function classificar(txt) {
    if (CONTRATAR.test(txt)) return 'contratar';
    for (const [nome, re] of CLASSES) if (re.test(txt)) return nome;
    return 'outro';
  }

  let senha = '';
  let videos = [];
  let rodando = false;

  // ---------- senha ----------
  async function api(corpo) {
    const r = await fetch('/api/comentarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, senha }) });
    let j = {};
    try { j = await r.json(); } catch (e) { j = { ok: false, erro: 'Resposta inválida do servidor.' }; }
    return j;
  }
  function abrir() { telaLogin.hidden = true; telaApp.hidden = false; campo.focus(); }
  function fechar() {
    senha = '';
    try { sessionStorage.removeItem('bel-senha'); } catch (e) {}
    telaApp.hidden = true; telaLogin.hidden = false; campoSenha.value = ''; campoSenha.focus();
  }

  formLogin.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erroLogin.hidden = true; btnEntrar.disabled = true;
    senha = campoSenha.value;
    const j = await api({ verificar: true }).catch(() => ({ ok: false, erro: 'Sem conexão.' }));
    btnEntrar.disabled = false;
    if (j.ok) {
      try { sessionStorage.setItem('bel-senha', senha); } catch (e) {}
      abrir();
    } else {
      senha = '';
      erroLogin.textContent = j.erro || 'Não deu para entrar.'; erroLogin.hidden = false;
      campoSenha.select();
    }
  });
  btnSair.addEventListener('click', fechar);

  // Mesma aba: não pede a senha de novo a cada F5 (some ao fechar a aba).
  try {
    const s = sessionStorage.getItem('bel-senha');
    if (s) { senha = s; api({ verificar: true }).then((j) => (j.ok ? abrir() : fechar())).catch(() => {}); }
    else campoSenha.focus();
  } catch (e) { campoSenha.focus(); }

  // ---------- links ----------
  function extrair(texto) {
    const vistos = new Set(), links = [];
    for (let m of texto.match(RE) || []) {
      m = m.replace(/[.;:)\]}!]+$/, '');
      if (!/^https?:\/\//i.test(m)) m = 'https://' + m;
      const k = m.split('?')[0].replace(/\/+$/, '').toLowerCase().replace(/^https?:\/\/(m\.|www\.)?/, '');
      if (!vistos.has(k)) { vistos.add(k); links.push(m); }
    }
    return links;
  }
  function contar() {
    const n = extrair(campo.value).length;
    contador.innerHTML = `<b>${n}</b> ${n === 1 ? 'link' : 'links'}`;
    btnPuxar.disabled = n === 0 || rodando;
  }
  campo.addEventListener('input', contar);
  campo.addEventListener('paste', (ev) => {
    // Colar sempre deixa cada link numa linha.
    const t = ev.clipboardData?.getData('text/plain');
    if (!t) return;
    ev.preventDefault();
    let txt = t.replace(/\r\n?/g, '\n').trim();
    const v = campo.value, ini = campo.selectionStart, fim = campo.selectionEnd;
    if (ini > 0 && v[ini - 1] !== '\n') txt = '\n' + txt;
    if (v[fim] !== '\n') txt += '\n';
    if (!document.execCommand('insertText', false, txt)) campo.setRangeText(txt, ini, fim, 'end');
    contar();
  });

  const limpar = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  // ---------- puxar ----------
  async function buscarInfo(url) {
    try {
      const r = await fetch('/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const j = await r.json();
      return j.ok ? j : null;
    } catch (e) { return null; }
  }

  async function puxarVideo(v, limite) {
    v.estado = 'Buscando dados do vídeo…'; desenhar();
    const info = await buscarInfo(v.url);
    if (info) Object.assign(v, { titulo: info.titulo, autor: info.autor, views: info.views, total: info.comentarios });
    await sleep(ESPERA);

    const vistos = new Set();
    let cursor = 0, tentativas = 0;
    while (v.coletados < limite) {
      v.estado = `Puxando comentários… ${v.coletados}`; desenhar();
      let j;
      try { j = await api({ url: v.url, cursor, autor: v.autor }); } catch (e) { j = { ok: false, erro: 'Sem conexão.', limite: true }; }
      if (j.senha === false) { fechar(); throw new Error('senha'); }
      if (!j.ok) {
        if (j.limite && tentativas < 5) { tentativas++; v.estado = 'Esperando o limite do serviço…'; desenhar(); await sleep(2500 * tentativas); continue; }
        v.erro = j.erro || 'Falhou.'; break;
      }
      tentativas = 0;
      if (!v.total) v.total = j.total;
      for (const c of j.comentarios) {
        const texto = limpar(c.texto);
        if (!texto) continue;
        v.coletados++;
        const k = normal(texto);
        if (k && vistos.has(k)) { contarRemovido(v, 'repetido', texto); continue; }
        vistos.add(k);
        const motivo = motivoRemocao(c, texto);
        if (motivo) { contarRemovido(v, motivo, texto); continue; }
        const classe = classificar(texto);
        (classe === 'contratar' ? v.contratar : v.mantidos).push({ texto, curtidas: c.curtidas || 0, classe });
      }
      if (!j.mais || !j.comentarios.length || j.cursor === cursor) break;
      cursor = j.cursor;
      await sleep(ESPERA);
    }
    // Primeiro a classe, depois a curtida (só desempata dentro da mesma classe).
    const porCurtida = (a, b) => b.curtidas - a.curtidas;
    v.mantidos.sort((a, b) => ORDEM.indexOf(a.classe) - ORDEM.indexOf(b.classe) || porCurtida(a, b));
    v.contratar.sort(porCurtida);
    v.estado = v.erro && !v.coletados ? '' : 'pronto';
  }
  function contarRemovido(v, motivo, texto) {
    v.removidos[motivo] = (v.removidos[motivo] || 0) + 1;
    if (v.exRemovidos.length < 150) v.exRemovidos.push({ motivo, texto });
  }

  btnPuxar.addEventListener('click', async () => {
    const links = extrair(campo.value);
    if (!links.length || rodando) return;
    rodando = true; btnPuxar.disabled = true; final.hidden = true; aviso.hidden = true;
    videos = links.map((url) => ({ url, titulo: '', autor: '', views: 0, total: 0, coletados: 0, mantidos: [], contratar: [], removidos: {}, exRemovidos: [], estado: 'Na fila', erro: '' }));
    barra.hidden = false; desenhar();
    const limite = Number(qtd.value) || 200;
    try {
      for (let i = 0; i < videos.length; i++) {
        barra.firstElementChild.style.width = `${(i / videos.length) * 100}%`;
        await puxarVideo(videos[i], limite);
        desenhar();
        if (i < videos.length - 1) await sleep(ESPERA);
      }
    } catch (e) {
      if (e.message === 'senha') { rodando = false; return; }
    }
    barra.firstElementChild.style.width = '100%';
    setTimeout(() => { barra.hidden = true; }, 600);
    rodando = false; contar();
    const t = totais();
    if (!t.mantidos && !t.contratar) { aviso.textContent = 'Nenhum comentário útil encontrado nesses vídeos.'; aviso.hidden = false; return; }
    resumo.innerHTML = `<b>${fmt(t.coletados)}</b> coletados · <b>${fmt(t.removidos)}</b> removidos como ruído · <b>${fmt(t.mantidos)}</b> mantidos` +
      (t.contratar ? ` · <b>${fmt(t.contratar)}</b> com intenção de contratar` : '');
    final.hidden = false;
    final.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  function totais() {
    const t = { coletados: 0, removidos: 0, mantidos: 0, contratar: 0, porMotivo: {}, porClasse: {} };
    for (const v of videos) {
      t.coletados += v.coletados; t.mantidos += v.mantidos.length; t.contratar += v.contratar.length;
      for (const [m, n] of Object.entries(v.removidos)) { t.removidos += n; t.porMotivo[m] = (t.porMotivo[m] || 0) + n; }
      for (const c of v.mantidos) t.porClasse[c.classe] = (t.porClasse[c.classe] || 0) + 1;
    }
    return t;
  }

  function desenhar() {
    lista.innerHTML = videos.map((v, i) => {
      const top = v.mantidos.filter((c) => c.classe !== 'outro').slice(0, 6);
      const nRem = Object.values(v.removidos).reduce((s, n) => s + n, 0);
      const estado = v.erro && !v.coletados
        ? `<span class="estado ruim">${esc(v.erro)}</span>`
        : v.estado === 'pronto'
          ? `<span class="estado ok">${fmt(v.coletados)} coletados · ${fmt(nRem)} removidos · ${fmt(v.mantidos.length)} mantidos${v.contratar.length ? ` · ${fmt(v.contratar.length)} querem contratar` : ''}${v.erro ? ' (parou antes: ' + esc(v.erro) + ')' : ''}</span>`
          : `<span class="estado">${esc(v.estado)}</span>`;
      const motivos = Object.entries(v.removidos).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${esc(m)}: ${n}`).join(' · ');
      return `<article class="video">
        <div class="topo-v"><span class="tit">${esc(v.titulo || `Vídeo ${i + 1}`)}</span>${v.total ? `<span class="num">${fmt(v.total)} coment.</span>` : ''}</div>
        ${v.autor ? `<span class="autor">@${esc(v.autor)}${v.views ? ` · ${fmt(v.views)} views` : ''}</span>` : ''}
        ${estado}
        ${top.length ? `<ul>${top.map((c) => `<li><span class="classe c-${esc(c.classe.normalize('NFD').replace(/[̀-ͯ]/g, ''))}">${esc(c.classe)}</span><span>${esc(c.texto)} <span class="cur">♥ ${fmt(c.curtidas)}</span></span></li>`).join('')}</ul>` : ''}
        ${v.estado === 'pronto' && nRem ? `<details class="removidos"><summary>Ver o que foi removido (${motivos})</summary><ul>${v.exRemovidos.map((r) => `<li><span class="classe">${esc(r.motivo)}</span><span>${esc(r.texto)}</span></li>`).join('')}</ul></details>` : ''}
      </article>`;
    }).join('');
  }

  // ---------- texto para o Claude ----------
  function montarTexto() {
    const prontos = videos.filter((v) => v.mantidos.length || v.contratar.length);
    const nichoTxt = limpar(nicho.value);
    const t = totais();
    const motivos = Object.entries(t.porMotivo).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}: ${n}`).join(', ');
    const classes = ORDEM.filter((c) => t.porClasse[c]).map((c) => `${c}: ${t.porClasse[c]}`).join(', ');

    let p = `Você é um estrategista de ofertas digitais lowticket (produtos de R$ 9 a R$ 47) para o mercado brasileiro, especialista em achar subnichos lucrativos e ângulos novos a partir da voz real do público.

Abaixo estão comentários reais de ${prontos.length} vídeo(s) do TikTok${nichoTxt ? `. Meu nicho / o que eu vendo: ${nichoTxt}` : ''}.

O site já fez um pré-filtro automático:
- Coletados: ${t.coletados}
- Removidos pelo site: ${t.removidos}${motivos ? ` (${motivos})` : ''}
- Mantidos: ${t.mantidos}${classes ? ` (${classes})` : ''}
- Intenção de contratar (bloco separado no final): ${t.contratar}

Cada comentário vem com uma etiqueta automática [classe · ♥ curtidas]. A etiqueta é um palpite do site e pode estar errada: corrija se precisar. Os comentários estão ordenados primeiro pela classe e só depois pelas curtidas.

ANTES DE ANALISAR, revise o filtro e remova o que ainda for ruído:
1. Elogio puro: só elogio/reação (lindo, amei, perfeito, arrasou, uau, show, divino, parabéns, maravilhoso e variações), sem pergunta, crítica, pedido ou relato pessoal.
2. Só emoji, figurinha, menção (@usuario) ou hashtag.
3. Uma palavra só, usada para algoritmo ou palavra-chave (fyp, "painel", "link" sozinho sem dizer de quê).
4. Spam e autopromoção: quem divulga o próprio serviço, loja, site ou perfil.
5. Comentários do próprio autor do vídeo.
6. Conversa de fã sobre o criador (elogio à pessoa, à voz, pedido de outro perfil, expectativa pelo próximo vídeo) e piadas sem relação com o tema.

MANTENHA sempre, mesmo se for curto:
- Perguntas (onde comprar, link de item específico, preço, medida, quantidade, como fazer).
- Críticas e objeções ("achei muito adulta", "parece sempre a mesma coisa").
- Relatos pessoais (comecei agora, parei, estou recomeçando, sou mãe, trabalho com isso).
- Desejos ("queria fazer", "quero esse tema").
- Elogio que vem junto de pergunta ou relato.

Classifique cada comentário (dor / dúvida / desejo / objeção / relato). Curtida só desempata dentro de cada classe: curtida sozinha nunca coloca um comentário na análise.

Depois faça a análise nesta ordem:

0. CONFERÊNCIA DO FILTRO
Total recebido, quantos você removeu a mais (por tipo) e total que sobrou para a análise.

1. RESUMO DO PÚBLICO
Quem está comentando, o que essas pessoas já tentaram, o que desejam de verdade e o nível de consciência predominante (inconsciente / consciente do problema / consciente da solução / pronto para comprar).

2. MAPA DE DORES
As 5 a 8 dores, dúvidas, desejos e objeções que mais se repetem. Para cada uma: o que é, intensidade (alta / média / baixa), frequência aproximada nos comentários e 2 ou 3 comentários literais como prova.

3. LINGUAGEM DO PÚBLICO
Palavras, gírias e expressões exatas que eles usam, para eu usar na copy e nos criativos.

4. INTENÇÃO DE CONTRATAR
O que o bloco "INTENÇÃO DE CONTRATAR" mostra (demanda por serviço, regiões, tipo de cliente) e se vale uma oferta de serviço ou de "faça você mesmo" para quem não acha profissional perto.

5. 5 IDEIAS DE OFERTA LOWTICKET
Cada oferta deve atacar um subnicho ou ângulo diferente (não quero 5 variações da mesma coisa). Para cada uma:
- Nome do produto
- Subnicho (o recorte específico do público)
- Avatar (quem compra, em uma frase)
- Ângulo / big idea (a perspectiva nova que faz isso parecer diferente de tudo que já existe)
- Mecanismo único (o "jeito" ou método, com nome próprio)
- Promessa principal (resultado + prazo, realista)
- Dor que resolve (ligada ao mapa de dores, citando o comentário que inspirou)
- Formato e entregáveis (ebook, planilha, mini-curso, templates, checklist, desafio de 7 dias, etc.)
- Preço sugerido e por quê
- Order bump e upsell
- 3 ganchos para os 3 primeiros segundos do criativo em vídeo
- Headline da página de vendas
- Principal objeção e como quebrar

6. QUAL TESTAR PRIMEIRO
Ranking das 5 ofertas por potencial (força da dor × facilidade de criar × facilidade de vender), com justificativa, e o primeiro passo prático para validar a melhor em 48 horas.

Baseie tudo nos comentários. Quando algo for suposição sua, diga que é suposição. Responda em português do Brasil.

`;
    // Divide o espaço entre os vídeos (quem tem mais comentários mantidos ganha mais espaço).
    let usado = 0;
    prontos.forEach((v, i) => {
      const cota = Math.max(4000, Math.floor((MAX_PROMPT * v.mantidos.length) / Math.max(1, t.mantidos)));
      p += `=== VÍDEO ${i + 1} ===\n`;
      if (v.titulo) p += `Legenda: ${limpar(v.titulo)}\n`;
      const meta = [v.autor && `@${v.autor}`, v.views && `${fmt(v.views)} views`, v.total && `${fmt(v.total)} comentários no total`].filter(Boolean);
      if (meta.length) p += `${meta.join(' · ')}\n`;
      p += `Comentários:\n`;
      let doVideo = 0;
      for (const c of v.mantidos) {
        const linha = `- [${c.classe} · ♥ ${c.curtidas}] ${c.texto}\n`;
        if (doVideo + linha.length > cota || usado + linha.length > MAX_PROMPT * 1.2) break;
        p += linha; doVideo += linha.length; usado += linha.length;
      }
      p += '\n';
    });
    const contratar = prontos.flatMap((v, i) => v.contratar.map((c) => `- [vídeo ${i + 1} · ♥ ${c.curtidas}] ${c.texto}`));
    if (contratar.length) p += `=== INTENÇÃO DE CONTRATAR ===\n${contratar.slice(0, 150).join('\n')}\n`;
    return p;
  }

  btnCopiar.addEventListener('click', async () => {
    const txt = montarTexto();
    let ok = false;
    try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) {
      // Plano B para navegadores que bloqueiam a área de transferência.
      const t = document.createElement('textarea');
      t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      t.remove();
    }
    const antes = 'Copiar texto para o Claude';
    btnCopiar.textContent = ok ? 'Copiado! Agora cole no Claude' : 'Não deu para copiar. Use o .txt';
    setTimeout(() => { btnCopiar.textContent = antes; }, 2500);
  });

  btnTxt.addEventListener('click', () => {
    const blob = new Blob([montarTexto()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `comentarios-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });

  // Para testar o filtro no console do navegador: __filtro("texto do comentário")
  window.__filtro = (t) => motivoRemocao({}, t) || classificar(t);
})();
