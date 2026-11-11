// Busca os dados do vídeo (links sem marca d'água, capa, autor) para um link do TikTok.
export const config = { runtime: 'edge' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const abs = (u) => (!u ? null : u.startsWith('http') ? u : 'https://www.tikwm.com' + u);

function traduzir(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('limit')) return 'Muitas buscas seguidas, tentando de novo…';
  if (m.includes('parsing') || m.includes('url')) return 'Link não reconhecido. Confira se é de um vídeo do TikTok.';
  if (m.includes('private')) return 'Vídeo privado.';
  if (m.includes('not exist') || m.includes('removed') || m.includes('deleted')) return 'Vídeo removido ou indisponível.';
  return msg || 'Não foi possível buscar este vídeo.';
}

export default async function handler(req) {
  const url = new URL(req.url).searchParams.get('url') || '';
  if (!/^https?:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(url)) {
    return json({ ok: false, erro: 'Link inválido. Use um link do TikTok.' }, 400);
  }

  try {
    const r = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': UA,
        Accept: 'application/json',
      },
      body: new URLSearchParams({ url, hd: '1' }),
    });
    const j = await r.json();

    if (j.code !== 0 || !j.data) {
      return json({ ok: false, erro: traduzir(j.msg), limite: /limit/i.test(j.msg || '') });
    }

    const d = j.data;
    const imagens = (d.images || []).map(abs).filter(Boolean);
    return json({
      ok: true,
      id: String(d.id || ''),
      titulo: d.title || '',
      capa: abs(d.origin_cover || d.cover),
      duracao: d.duration || 0,
      data: d.create_time || 0,
      audio: abs(d.music || d.music_info?.play),
      autor: d.author?.unique_id || '',
      nome: d.author?.nickname || '',
      autorFoto: abs(d.author?.avatar),
      views: d.play_count || 0,
      comentarios: d.comment_count || 0,
      compartilhamentos: d.share_count || 0,
      tipo: imagens.length ? 'fotos' : 'video',
      video: imagens.length ? null : abs(d.play),
      videoHd: imagens.length ? null : abs(d.hdplay),
      tamanho: d.size || 0,
      tamanhoHd: d.hd_size || 0,
      imagens,
    });
  } catch (e) {
    return json({ ok: false, erro: 'O serviço de busca não respondeu. Tente de novo em instantes.', limite: true }, 502);
  }
}
