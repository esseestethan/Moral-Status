import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const chunksDir = path.resolve('src/chunks');
const files = (await readdir(chunksDir))
  .filter((name) => name.endsWith('.part'))
  .sort();

if (files.length === 0) {
  throw new Error('No source chunks found in src/chunks.');
}

const parts = await Promise.all(
  files.map((name) => readFile(path.join(chunksDir, name), 'utf8')),
);

const bootstrap = `\n\nimport { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(<MoralStatusMap />);\n`;

await mkdir(path.resolve('src'), { recursive: true });
await writeFile(path.resolve('src/main.jsx'), parts.join('') + bootstrap, 'utf8');
console.log(`Assembled ${files.length} chunks into src/main.jsx`);
