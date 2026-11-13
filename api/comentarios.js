// Área restrita: puxa os comentários de um vídeo do TikTok (uma página de até 50 por vez).
// Só responde com a senha certa. A senha não fica escrita aqui: só o "resumo" (hash SHA-256) dela.
// Só aceita POST com tudo no corpo: nada de link no endereço da requisição. Nada aqui grava ou registra.
export const config = { runtime: 'edge' };

const SENHA_HASH = '348e90bb15297bf4f7e4fd0f4b07f3b8c31befd49f5664eb8f2e9ecca82486d4';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hash(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, erro: 'Método não permitido.' }, 405);
  let corpo = {};
  try { corpo = (await req.json()) || {}; } catch { corpo = {}; }

  const senha = String(corpo.senha || '').slice(0, 200);
  if (!iguais(await hash(senha), SENHA_HASH)) {
    await sleep(800); // atrasa quem tenta adivinhar a senha
    return json({ ok: false, erro: 'Senha errada.', senha: false }, 401);
  }
  if (corpo.verificar) return json({ ok: true });

  const url = String(corpo.url || '').slice(0, 2048);
  if (!/^https?:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(url)) {
    return json({ ok: false, erro: 'Link inválido. Use um link do TikTok.' }, 400);
  }
  const cursor = Math.max(0, Math.min(5000, Number(corpo.cursor) || 0));
  const autor = String(corpo.autor || '').toLowerCase().replace(/^@/, '').slice(0, 100);

  try {
    const r = await fetch('https://www.tikwm.com/api/comment/list/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': UA, Accept: 'application/json' },
      body: new URLSearchParams({ url, count: '50', cursor: String(cursor) }),
    });
    const j = await r.json();
    if (j.code !== 0 || !j.data) {
      const msg = j.msg || '';
      return json({ ok: false, erro: /limit/i.test(msg) ? 'Muitas buscas seguidas…' : msg || 'Não deu para puxar os comentários.', limite: /limit/i.test(msg) });
    }
    const d = j.data;
    return json({
      ok: true,
      total: d.total || 0,
      cursor: d.cursor || 0,
      mais: !!d.hasMore,
      // Só o texto e os números: nada de nome, foto ou perfil de quem comentou.
      // "doAutor" só diz se quem comentou é o dono do vídeo (para tirar da análise).
      comentarios: (d.comments || []).map((c) => ({
        texto: String(c.text || ''),
        curtidas: c.digg_count || 0,
        respostas: c.reply_total || 0,
        doAutor: !!autor && String(c.user?.unique_id || '').toLowerCase() === autor,
      })),
    });
  } catch (e) {
    return json({ ok: false, erro: 'O serviço de busca não respondeu. Tente de novo em instantes.', limite: true }, 502);
  }
}
