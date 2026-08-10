import { readFile } from 'node:fs/promises';
import * as snarkjs from 'snarkjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const [, , wasmPath, zkeyPath, vkeyPath] = process.argv;
  if (!wasmPath || !zkeyPath || !vkeyPath) throw new Error('Proof artifact paths are required');
  const input = JSON.parse(await readStdin());
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const verificationKey = JSON.parse(await readFile(vkeyPath, 'utf8'));
  if (!(await snarkjs.groth16.verify(verificationKey, publicSignals, proof))) {
    throw new Error('Generated withdrawal proof failed local verification');
  }
  await new Promise((resolve) =>
    process.stdout.write(JSON.stringify({ proof, publicSignals }), resolve)
  );
  process.exit(0);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
