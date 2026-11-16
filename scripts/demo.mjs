import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.demo');
const req = createRequire(path.join(root, 'backend/package.json'));
const dotenv = createRequire(req.resolve('@nestjs/config'))('dotenv');
const command = process.argv[2];
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const read = file => dotenv.parse(fs.readFileSync(file));
const saveEnv = (file, values) => fs.writeFileSync(file, Object.entries(values).map(([key, value]) => {
  const raw = String(value), quote = ["'", '"', '`'].find(candidate => !raw.includes(candidate));
  if (!quote) fail(`Nao foi possivel serializar ${key}; confira a configuracao privada.`);
  const line = `${key}=${quote}${raw}${quote}`;
  if (dotenv.parse(line)[key] !== raw) fail(`Formato de ${key} nao suportado; confira a configuracao privada.`);
  return line;
}).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
const secret = () => randomBytes(48).toString('base64url');
const backendFile = path.join(dir, 'backend.env'), aiFile = path.join(dir, 'ai.env');
const runtimeFile = path.join(dir, 'runtime.json');
const bin = path.join(root, '.tools/cloudflared.exe');
const fail = message => { throw new Error(message); };

function settings() {
  if (!fs.existsSync(backendFile) || !fs.existsSync(aiFile)) fail('Execute init antes e preencha os arquivos privados em .demo.');
  return { backend: read(backendFile), ai: read(aiFile) };
}
function validate(backend, ai) {
  const db = new URL(backend.DATABASE_URL || 'invalid:');
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname.endsWith('.render.com') || db.searchParams.get('sslmode') !== 'require') fail('Use a External Database URL do Render com ?sslmode=require em .demo/backend.env.');
  if (backend.NODE_ENV !== 'production' || backend.HOST !== '127.0.0.1' || backend.PORT !== '4301' || backend.FRONTEND_URL !== 'https://burnoutsense.online') fail('Confira NODE_ENV, HOST, PORT e FRONTEND_URL do modo banca.');
  for (const key of ['JWT_ACCESS_SECRET', 'CSRF_SECRET', 'DEMO_GATEWAY_SECRET']) if ((backend[key]?.length ?? 0) < 32) fail(`Preencha ${key} no ambiente privado.`);
  if (new Set([backend.JWT_ACCESS_SECRET, backend.CSRF_SECRET, backend.DEMO_GATEWAY_SECRET]).size !== 3) fail('JWT, CSRF e gateway precisam usar segredos independentes.');
  if (backend.AI_SERVICE_API_KEY !== ai.BURNOUTSENSE_API_KEY || !ai.BURNOUTSENSE_API_KEY) fail('As chaves privadas da IA precisam coincidir.');
  if (backend.DAILY_CONTEXT_EVOLUTION_ENABLED !== 'true' || backend.ESBEU_ASSESSMENTS_ENABLED !== 'true') fail('O fluxo diario deve permanecer habilitado.');
  if (backend.AI_SERVICE_URL !== 'http://127.0.0.1:4800') fail('A IA do modo banca deve usar a porta local 4800.');
  if (!fs.existsSync(ai.PYTHON_EXE || '') || !fs.existsSync(ai.BURNOUTSENSE_MODEL_DIR || '')) fail('Confira o Python e o pacote RF/A no ambiente privado da IA.');
  const versions = spawnSync(ai.PYTHON_EXE, ['-c', 'import sys,sklearn,joblib; print(str(sys.version_info.major)+"."+str(sys.version_info.minor)+"|"+sklearn.__version__+"|"+joblib.__version__)'], { encoding: 'utf8', windowsHide: true });
  if (versions.status !== 0 || versions.stdout.trim() !== '3.12|1.5.1|1.4.2') fail('Use Python 3.12, scikit-learn 1.5.1 e joblib 1.4.2. Nao altere o treinamento.');
}

async function init() {
  if (fs.existsSync(backendFile) || fs.existsSync(aiFile)) fail('Configuracao privada ja existe; nao foi sobrescrita. Edite-a no VS Code.');
  const source = option('--ai-env');
  if (!source || !fs.existsSync(source)) fail('Informe --ai-env com o arquivo privado do RF/A que ja funciona localmente.');
  const ai = read(source), previous = read(path.join(root, 'backend/.env'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const key = secret();
  saveEnv(aiFile, { ...ai, PYTHON_EXE: path.join(root, 'ai-service/.venv/Scripts/python.exe'),
    BURNOUTSENSE_API_KEY: key, BURNOUTSENSE_ENVIRONMENT: 'production', BURNOUTSENSE_EXPERIMENTAL_MODEL: 'true',
    BURNOUTSENSE_TRUST_LOCAL_MODEL: 'true', BURNOUTSENSE_SHADOW_RIDGE_ENABLED: 'false' });
  saveEnv(backendFile, { ...previous, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '4301', DATABASE_URL: '',
    FRONTEND_URL: 'https://burnoutsense.online', TRUST_PROXY_HOPS: '', JWT_ACCESS_SECRET: secret(), CSRF_SECRET: secret(),
    DEMO_GATEWAY_SECRET: secret(), AI_SERVICE_URL: 'http://127.0.0.1:4800', AI_SERVICE_API_KEY: key,
    DAILY_CONTEXT_EVOLUTION_ENABLED: 'true', ESBEU_ASSESSMENTS_ENABLED: 'true', DAILY_REMINDER_ENABLED: 'false',
    DAILY_REMINDER_HOUR: '12', DAILY_REMINDER_MINUTE: '0', DAILY_REMINDER_TIMEZONE: 'America/Sao_Paulo',
    SMTP_HOST: 'smtp.hostinger.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'lembrete@burnoutsense.online',
    SMTP_FROM: 'BurnoutSense <lembrete@burnoutsense.online>', SMTP_PASS: previous.SMTP_USER === 'lembrete@burnoutsense.online' ? previous.SMTP_PASS ?? '' : '' });
  console.log('Arquivos privados criados em .demo/backend.env e .demo/ai.env. Preencha DATABASE_URL e SMTP_PASS no VS Code; nao envie esses arquivos ao Git.');
}

async function install() {
  if (process.platform !== 'win32' || process.arch !== 'x64') fail('Instale cloudflared pelo guia oficial para seu sistema.');
  if (fs.existsSync(bin)) { console.log('cloudflared ja esta em .tools.'); return; }
  const response = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest');
  if (!response.ok) fail('Nao foi possivel consultar a versao oficial do cloudflared.');
  const release = await response.json(), asset = release.assets.find(item => item.name === 'cloudflared-windows-amd64.exe');
  if (!asset?.digest?.startsWith('sha256:')) fail('Digest oficial ausente; a instalacao automatica foi interrompida.');
  const download = await fetch(asset.browser_download_url);
  if (!download.ok) fail('Falha no download oficial.');
  const bytes = Buffer.from(await download.arrayBuffer());
  if ('sha256:' + createHash('sha256').update(bytes).digest('hex') !== asset.digest) fail('Integridade do cloudflared invalida.');
  fs.mkdirSync(path.dirname(bin), { recursive: true }); fs.writeFileSync(bin, bytes, { flag: 'wx' });
  console.log(`cloudflared ${release.tag_name} instalado em .tools; SHA-256 conferido com o release oficial.`);
}

async function migrate() {
  if (!process.argv.includes('--confirm')) fail('Confira o banco escolhido e execute migrate --confirm. Nao ha reset ou db push.');
  const { backend, ai } = settings(); validate(backend, ai);
  const result = spawnSync(process.execPath, [req.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.join(root, 'backend'), env: { ...process.env, ...backend }, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) fail('A migracao falhou. Configuracao privada omitida; confira conexao, SSL e autorizacao do IP no Render.');
  console.log('Migracoes aplicadas ao banco selecionado; nenhum reset foi executado.');
}
async function freePort(port) {
  await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', () => reject(new Error(`Porta ${port} ocupada. Nao encerrei processos existentes.`))); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
}
async function waitReady(url, headers) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(url, { headers, signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  fail('Um servico nao ficou pronto. Consulte os logs privados em .demo/logs.');
}
async function check() {
  const { backend, ai } = settings(); validate(backend, ai);
  await waitReady('http://127.0.0.1:4800/ready', { 'X-API-Key': ai.BURNOUTSENSE_API_KEY });
  await waitReady('http://127.0.0.1:4301/health', { 'X-Demo-Gateway': backend.DEMO_GATEWAY_SECRET });
  console.log('IA real pronta e backend conectado ao banco.');
  reminderStatus(backend);
  console.log('Confira autenticacao SMTP com: node scripts/demo.mjs check-email. Aceite SMTP nao garante caixa de entrada.');
}
function reminderStatus(backend) {
  const enabled = backend.DAILY_REMINDER_ENABLED === 'true';
  const configured = Boolean(backend.SMTP_HOST && backend.SMTP_USER && backend.SMTP_PASS);
  const number = (value, fallback, max) => value?.trim() && Number.isInteger(Number(value)) ? Math.min(max, Math.max(0, Number(value))) : fallback;
  const hour = number(backend.DAILY_REMINDER_HOUR, 12, 23), minute = number(backend.DAILY_REMINDER_MINUTE, 0, 59);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  console.log(`Lembrete diario: ${enabled ? 'ATIVO' : 'DESLIGADO'} em .demo/backend.env; ${time} (${backend.DAILY_REMINDER_TIMEZONE || 'America/Sao_Paulo'}).`);
  console.log(`SMTP: ${configured ? 'credenciais preenchidas (ainda precisam ser verificadas)' : 'configuracao incompleta'}.`);
  if (!enabled) console.log('A preferencia no perfil nao liga o agendador. Para envio automatico, habilite DAILY_REMINDER_ENABLED e reinicie o backend.');
  if (enabled && !configured) console.log('ATENCAO: o agendador esta habilitado, mas falta configuracao SMTP.');
  console.log('O PC e o backend precisam estar ativos entre 12h e 12h10 para o horario padrao. Nao ha envio retroativo apos essa janela.');
}
async function checkEmail() {
  const { backend } = settings();
  reminderStatus(backend);
  if (!backend.SMTP_HOST || !backend.SMTP_USER || !backend.SMTP_PASS) fail('Preencha SMTP_HOST, SMTP_USER e SMTP_PASS em .demo/backend.env.');
  const smtp = req('nodemailer').createTransport({ host: backend.SMTP_HOST, port: Number(backend.SMTP_PORT || 587),
    secure: backend.SMTP_SECURE === 'true', connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000,
    auth: { user: backend.SMTP_USER, pass: backend.SMTP_PASS } });
  try { await smtp.verify(); console.log('Conexao TLS e autenticacao SMTP confirmadas. Nenhum e-mail foi enviado.'); }
  catch { fail('Nao foi possivel autenticar no SMTP. Confira servidor, porta, TLS e senha da caixa postal; detalhes privados omitidos.'); }
  finally { smtp.close(); }
}
function vercelEnv(backend, url) {
  if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url)) fail('Endereco do tunel invalido.');
  const file = path.join(dir, 'vercel.env');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  saveEnv(file, { NEXT_PUBLIC_API_URL: '/api', BACKEND_PROXY_URL: url,
    DEMO_APP_ORIGIN: backend.FRONTEND_URL, DEMO_GATEWAY_SECRET: backend.DEMO_GATEWAY_SECRET });
}
async function run() {
  const { backend, ai } = settings(); validate(backend, ai);
  reminderStatus(backend);
  if (!fs.existsSync(bin)) fail('Execute install antes.');
  if (!fs.existsSync(path.join(root, 'backend/dist/main.js'))) fail('Compile o backend antes de iniciar.');
  await freePort(4301); await freePort(4800);
  fs.rmSync(path.join(dir, 'tunnel-url.txt'), { force: true });
  fs.rmSync(runtimeFile, { force: true });
  const logs = path.join(dir, 'logs'); fs.mkdirSync(logs, { recursive: true });
  const children = []; let closing = false;
  const instance = option('--instance') ?? randomUUID();
  const stop = () => {
    if (closing) return; closing = true;
    for (const child of children) if (child.exitCode === null) child.kill();
    fs.rmSync(runtimeFile, { force: true });
    fs.rmSync(path.join(dir, 'tunnel-url.txt'), { force: true });
  };
  const start = (name, executable, args, env, cwd) => {
    const out = fs.openSync(path.join(logs, name + '.log'), 'a'), err = fs.openSync(path.join(logs, name + '.error.log'), 'a');
    const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', out, name === 'tunnel' ? 'pipe' : err] });
    fs.closeSync(out); fs.closeSync(err); children.push(child);
    child.on('error', () => { console.error(`Nao foi possivel iniciar ${name}.`); stop(); process.exitCode = 1; });
    child.on('exit', () => { if (!closing) { console.error(`${name} encerrou. A demonstracao foi parada; confira os logs e reinicie.`); stop(); process.exitCode = 1; } });
    return child;
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    start('ai', ai.PYTHON_EXE, ['-B', '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '4800', '--no-access-log'], ai, path.join(root, 'ai-service'));
    await waitReady('http://127.0.0.1:4800/ready', { 'X-API-Key': ai.BURNOUTSENSE_API_KEY });
    start('backend', process.execPath, [path.join(root, 'backend/dist/main.js')], backend, path.join(root, 'backend'));
    await waitReady('http://127.0.0.1:4301/health', { 'X-Demo-Gateway': backend.DEMO_GATEWAY_SECRET });
    const tunnel = start('tunnel', bin, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4301'], {}, root);
    let buffer = '';
    tunnel.stderr.on('data', chunk => {
      fs.appendFileSync(path.join(logs, 'tunnel.error.log'), chunk);
      buffer = (buffer + chunk.toString()).slice(-16000);
      const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (url && !fs.existsSync(path.join(dir, 'tunnel-url.txt'))) {
        fs.writeFileSync(path.join(dir, 'tunnel-url.txt'), url + '\n');
        vercelEnv(backend, url);
        console.log(`BACKEND_PROXY_URL=${url}`);
        console.log('Na Vercel: NEXT_PUBLIC_API_URL=/api, DEMO_APP_ORIGIN=https://burnoutsense.online e a chave DEMO_GATEWAY_SECRET do arquivo privado. Nao feche este processo.');
      }
    });
    fs.writeFileSync(runtimeFile, JSON.stringify({ pid: process.pid, instance, startedAt: new Date().toISOString() }));
    console.log('IA e backend prontos. Aguardando o endereco HTTPS do tunel...');
  } catch (error) { stop(); throw error; }
}
function stopBackground() {
  if (!fs.existsSync(runtimeFile)) fail('Nenhuma execucao registrada. Se estiver em um terminal, use Ctrl+C.');
  const record = JSON.parse(fs.readFileSync(runtimeFile));
  if (!Number.isInteger(record.pid) || !/^[a-f0-9-]{36}$/.test(record.instance)) fail('Registro de processo invalido.');
  const check = spawnSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${record.pid}"; if ($p -and $p.CommandLine.Contains('${record.instance}') -and $p.CommandLine.Contains('demo.mjs')) { exit 0 }; exit 1`], { windowsHide: true });
  if (check.status !== 0) fail('A identidade do processo nao confere. Use Ctrl+C no terminal original; nenhum processo foi encerrado.');
  spawnSync('taskkill.exe', ['/PID', String(record.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  fs.rmSync(runtimeFile, { force: true }); fs.rmSync(path.join(dir, 'tunnel-url.txt'), { force: true });
  console.log('Somente a arvore de processos da demonstracao foi encerrada.');
}
try {
  if (command === 'init') await init();
  else if (command === 'install') await install();
  else if (command === 'migrate') await migrate();
  else if (command === 'run') await run();
  else if (command === 'check') await check();
  else if (command === 'check-email') await checkEmail();
  else if (command === 'vercel-env') { const { backend } = settings(); vercelEnv(backend, fs.readFileSync(path.join(dir, 'tunnel-url.txt'), 'utf8').trim()); console.log('Arquivo privado .demo/vercel.env atualizado. Nao o envie ao Git.'); }
  else if (command === 'stop') stopBackground();
  else console.log('Uso: node scripts/demo.mjs init --ai-env CAMINHO | install | migrate --confirm | run | check | check-email | stop');
} catch (error) { console.error(error.code ? 'Falha ao preparar a demonstracao. Confira os arquivos privados, dependencias e conexao.' : error.message); process.exitCode = 1; }
