import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const managed = join(process.cwd(), 'contracts', 'midnight', 'managed', 'privaterisk');
const target = join(process.cwd(), 'public', 'zk');
const srsHost = 'https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com/';
const srsPowers = Array.from({ length: 8 }, (_, index) => index + 9); // k = 9..16

if (!existsSync(managed)) {
  throw new Error('Missing compiled Midnight artifacts. Run npm run midnight:compile first.');
}

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, 'keys'), { recursive: true });
mkdirSync(join(target, 'zkir'), { recursive: true });
mkdirSync(join(target, 'params'), { recursive: true });

for (const suffix of ['prover', 'verifier']) {
  cpSync(
    join(managed, 'keys', `proveBalanceForTransfer.${suffix}`),
    join(target, 'keys', `proveBalanceForTransfer.${suffix}`),
  );
}

cpSync(
  join(managed, 'zkir', 'proveBalanceForTransfer.bzkir'),
  join(target, 'zkir', 'proveBalanceForTransfer.bzkir'),
);

const params = [];
for (const k of srsPowers) {
  const name = `bls_midnight_2p${k}`;
  const response = await fetch(`${srsHost}${name}`);
  if (!response.ok) throw new Error(`Unable to stage Midnight SRS ${name}: HTTP ${response.status}`);
  writeFileSync(join(target, 'params', name), Buffer.from(await response.arrayBuffer()));
  params.push(name);
  console.log(`↓ ${name}`);
}

writeFileSync(
  join(target, 'manifest.json'),
  JSON.stringify(
    {
      version: '0.3.0',
      compiler: '0.31.1',
      runtime: '0.16.0',
      prover: '@midnight-ntwrk/zkir-v2@2.1.0',
      circuit: 'proveBalanceForTransfer',
      srsSource: srsHost,
      params,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

console.log(`Staged Midnight browser proving assets (${params.length} SRS slice(s)) in public/zk.`);
