// Servidor local para testar o site sem precisar da Vercel.
// Uso: npm run dev  →  abre em http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const PASTA = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT) || 3000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  try {
    // Rotas /api/info e /api/video → mesmas funções que rodam na Vercel
    const rota = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/i);
    if (rota) {
      const arquivo = path.join(PASTA, 'api', rota[1] + '.js');
      // ?v= força recarregar o arquivo, assim suas edições valem sem reiniciar
      const mod = await import(pathToFileURL(arquivo).href + '?v=' + Date.now());
      const resposta = await mod.default(new Request(url, { method: req.method, headers: req.headers }));
      res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
      if (resposta.body) Readable.fromWeb(resposta.body).pipe(res);
      else res.end();
      return;
    }

    // Arquivos do site (estilo.css, tema.js, privacidade.html, og.png...). Sempre lidos de novo, é só dar F5.
    // Endereço que não existe → index.html, como antes.
    const TIPOS = {
      '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
    };
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let arquivo = path.join(PASTA, rel);
    let conteudo = null;
    if (arquivo.startsWith(PASTA + path.sep)) {
      try { conteudo = await readFile(arquivo); } catch { conteudo = null; }
    }
    if (!conteudo) { arquivo = path.join(PASTA, 'index.html'); conteudo = await readFile(arquivo); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(conteudo);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro no servidor local: ' + e.message);
  }
});

server.listen(PORTA, () => {
  console.log(`\n  Baixa em Lote rodando em  http://localhost:${PORTA}\n  Edite os arquivos e dê F5 no navegador. Ctrl+C para parar.\n`);
});
