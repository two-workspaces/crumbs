// Served instead of Crumbs when it can't start safely: the admin account could not be created
// (an open setup screen would hand the instance to the first visitor) or Crumbs exited right
// after starting, usually over a variable. It answers 200 on every path, the healthcheck
// included, so the deploy doesn't crash-loop; the deploy logs say what went wrong.
'use strict';
const http = require('http');

const reason = process.argv[2] || 'Crumbs could not start.';
const port = Number(process.env.PORT) || 3000;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Crumbs is not running</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#222}
code{background:#f3f0e8;padding:.1em .3em;border-radius:3px}</style></head><body>
<h1>Crumbs is not running</h1><p>${esc(reason)}</p>
<p>The service's deploy logs on Railway have the details. Fix the variable they name on the
Variables tab, and Railway redeploys with it. Your notes on the volume are untouched.</p>
</body></html>`;

http
	.createServer((req, res) => {
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
		res.end(page);
	})
	.listen(port, process.env.HOST || '::', () => console.log(`railway: serving a notice page on port ${port}: ${reason}`));
