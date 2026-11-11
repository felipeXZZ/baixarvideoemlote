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

    // Qualquer outra rota → index.html (sempre lido de novo, é só dar F5)
    const html = await readFile(path.join(PASTA, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erro no servidor local: ' + e.message);
  }
});

server.listen(PORTA, () => {
  console.log(`\n  Baixa em Lote rodando em  http://localhost:${PORTA}\n  Edite os arquivos e dê F5 no navegador. Ctrl+C para parar.\n`);
});
