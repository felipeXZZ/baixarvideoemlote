// Repassa o arquivo (vídeo, foto ou áudio) pelo próprio site, para o download e o ZIP funcionarem.
// Só aceita POST com o endereço no corpo: nada de link no endereço da requisição (que vai para os logs).
// Nada aqui grava ou registra o que foi baixado.
export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Só repassa arquivos destes servidores (evita que o site vire proxy aberto).
const PERMITIDOS = ['tikwm.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokv.com', 'tiktokv.us', 'tiktok.com', 'muscdn.com', 'byteoversea.com', 'ibytedtos.com', 'ibyteimg.com'];
const permitido = (host) => PERMITIDOS.some((d) => host === d || host.endsWith('.' + d));

// Só repassa mídia; qualquer outra coisa (uma página HTML, por exemplo) vira download genérico.
const tipoSeguro = (t) => (/^(video|audio|image)\/[\w.+-]+$/i.test(t || '') ? t : 'application/octet-stream');

const erro = (msg, status) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

function validar(texto) {
  let u;
  try { u = new URL(texto); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  return permitido(u.hostname) ? u : null;
}

export default async function handler(req) {
  if (req.method !== 'POST') return erro('Método não permitido', 405);

  let alvo = '';
  try { alvo = String((await req.formData()).get('u') || '').slice(0, 4096); } catch { alvo = ''; }
  let u = validar(alvo);
  if (!u) return erro('Servidor não permitido', 403);

  try {
    // Segue os redirecionamentos na mão, conferindo cada destino contra a lista de servidores permitidos.
    let r;
    for (let saltos = 0; ; saltos++) {
      r = await fetch(u.toString(), {
        redirect: 'manual',
        headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/', Accept: '*/*' },
      });
      if (r.status < 300 || r.status >= 400) break;
      const proximo = r.headers.get('location');
      if (!proximo || saltos >= 5) return erro('Arquivo indisponível', 502);
      u = validar(new URL(proximo, u).toString());
      if (!u) return erro('Servidor não permitido', 403);
    }
    if (!r.ok || !r.body) return erro('Arquivo indisponível', 502);

    const headers = new Headers({
      'Content-Type': tipoSeguro(r.headers.get('content-type')),
      'Content-Disposition': 'attachment',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    const len = r.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    return new Response(r.body, { status: 200, headers });
  } catch (e) {
    return erro('Falha ao baixar o arquivo', 502);
  }
}
