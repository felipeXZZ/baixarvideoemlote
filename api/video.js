// Repassa o arquivo (vídeo ou foto) pelo próprio site, para o download funcionar
// direto e o ZIP conseguir juntar tudo.
export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Só repassa arquivos destes servidores (evita que o site vire proxy aberto).
const PERMITIDOS = ['tikwm.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokv.com', 'tiktokv.us', 'tiktok.com', 'muscdn.com', 'byteoversea.com', 'ibytedtos.com', 'ibyteimg.com'];

const permitido = (host) => PERMITIDOS.some((d) => host === d || host.endsWith('.' + d));

export default async function handler(req) {
  const params = new URL(req.url).searchParams;
  const alvo = params.get('u') || '';
  const nome = (params.get('n') || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim();

  let u;
  try { u = new URL(alvo); } catch { return new Response('Endereço inválido', { status: 400 }); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return new Response('Endereço inválido', { status: 400 });
  if (!permitido(u.hostname)) return new Response('Servidor não permitido', { status: 403 });

  try {
    const r = await fetch(u.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/', Accept: '*/*' },
    });
    if (!r.ok || !r.body) return new Response('Arquivo indisponível', { status: 502 });

    const headers = new Headers({
      'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'private, max-age=600',
    });
    const len = r.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    if (nome) {
      const ascii = nome.replace(/[^\x20-\x7E]/g, '_');
      headers.set('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    }
    return new Response(r.body, { status: 200, headers });
  } catch (e) {
    return new Response('Falha ao baixar o arquivo', { status: 502 });
  }
}
