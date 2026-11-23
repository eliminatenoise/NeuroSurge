// Open the shared game over loopback so modules and verified mesh packs can load offline.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--no-browser')) {
  console.error('Run node lite/launch.mjs [--no-browser] from the extracted NeuroSurge folder.');
  process.exit(2);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const hosts = new Set();
const server = createServer(createHandler({root, allowedHosts:hosts}));
server.on('error', error => {
  console.error(`NeuroSurge Lite could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen({host:HOST, port:0, exclusive:true}, () => {
  const {port} = server.address();
  hosts.add(`${HOST}:${port}`);
  hosts.add(`localhost:${port}`);
  const url = `http://${HOST}:${port}/lite/`;
  console.log(`Open ${url}`);
  console.log('Leave this window open during play. Press Ctrl+C here to stop the server.');
  if (args.includes('--no-browser')) return;
  const command = process.platform === 'win32' ? ['rundll32.exe', 'url.dll,FileProtocolHandler'] :
    process.platform === 'darwin' ? ['open'] : ['xdg-open'];
  const opener = spawn(command[0], [...command.slice(1), url], {detached:true, stdio:'ignore'});
  opener.once('error', () => console.log('Copy the local address above into your browser.'));
  opener.once('exit', code => { if (code) console.log('Copy the local address above into your browser.'); });
  opener.unref();
});

for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close());
