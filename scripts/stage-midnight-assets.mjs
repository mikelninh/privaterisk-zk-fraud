import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const managed = join(process.cwd(), 'contracts', 'midnight', 'managed', 'privaterisk');
const target = join(process.cwd(), 'public', 'zk');
const paramsSource = join(homedir(), '.compact', 'params');

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

const params = existsSync(paramsSource)
  ? readdirSync(paramsSource).filter((name) => /^params_\d+\.bin$/.test(name))
  : [];

if (params.length === 0) {
  throw new Error(`No Compact PLONK parameters found in ${paramsSource}`);
}

for (const name of params) {
  cpSync(join(paramsSource, name), join(target, 'params', name));
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
      params,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

console.log(`Staged Midnight browser proving assets (${params.length} parameter file(s)) in public/zk.`);
