/*
 * generate-icons.mjs — Automação de Ícones "Um Toque"
 * 
 * Descrição: Lê todos os arquivos .svg na pasta /icons, extrai seus caminhos internos
 * e atualiza o dicionário centralizado ICON_PATHS dentro de ds.js.
 * 
 * Uso: node scripts/generate-icons.mjs
 */

import fs from 'fs';
import path from 'path';

const WORKSPACE_DIR = 'c:/Users/kenio/study-planner';
const ICONS_DIR = path.join(WORKSPACE_DIR, 'icons');
const DS_JS_PATH = path.join(WORKSPACE_DIR, 'ds.js');

function extractSvgPaths(svgContent) {
  // Remove quebras de linha e espaços extras
  const flatContent = svgContent.replace(/\r?\n|\r/g, ' ').trim();
  // Regex para capturar tudo dentro das tags <svg ...>...</svg>
  const match = flatContent.match(/<svg[^>]*>(.*?)<\/svg>/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, ' ');
}

async function main() {
  console.log('🔍 Escaneando ícones SVG em:', ICONS_DIR);
  
  if (!fs.existsSync(ICONS_DIR)) {
    console.error('❌ Pasta de ícones não encontrada.');
    process.exit(1);
  }

  const files = fs.readdirSync(ICONS_DIR).filter(f => f.endsWith('.svg'));
  console.log(`📂 Encontrados ${files.length} arquivos SVG.`);

  const newIconPaths = {};
  for (const file of files) {
    const iconName = path.basename(file, '.svg');
    const content = fs.readFileSync(path.join(ICONS_DIR, file), 'utf8');
    const paths = extractSvgPaths(content);
    if (paths) {
      newIconPaths[iconName] = paths;
      console.log(`  ✨ Ícone processado: "${iconName}"`);
    } else {
      console.warn(`  ⚠️ Falha ao extrair caminhos do SVG: "${file}"`);
    }
  }

  // Ler o ds.js original
  if (!fs.existsSync(DS_JS_PATH)) {
    console.error('❌ Arquivo ds.js não encontrado em:', DS_JS_PATH);
    process.exit(1);
  }

  let dsContent = fs.readFileSync(DS_JS_PATH, 'utf8');

  // Localizar o dicionário ICON_PATHS no ds.js
  const dictStartMarker = 'const ICON_PATHS = {';
  const dictEndMarker = '};';

  const startIndex = dsContent.indexOf(dictStartMarker);
  if (startIndex === -1) {
    console.error('❌ Não foi possível encontrar a variável ICON_PATHS no ds.js');
    process.exit(1);
  }

  // Encontrar o fechamento correspondente
  const startContentIndex = startIndex + dictStartMarker.length;
  const endIndex = dsContent.indexOf(dictEndMarker, startContentIndex);
  if (endIndex === -1) {
    console.error('❌ Não foi possível encontrar o fechamento da variável ICON_PATHS no ds.js');
    process.exit(1);
  }

  // Ler os ícones já existentes no ds.js para mesclagem
  const currentDictBlock = dsContent.slice(startContentIndex, endIndex);
  const existingIcons = {};
  
  // Regex para extrair pares chave/valor: key: 'value',
  const entryRegex = /([a-zA-Z0-9\-_']+)\s*:\s*(['"`])(.*?)\2/g;
  let match;
  while ((match = entryRegex.exec(currentDictBlock)) !== null) {
    const key = match[1].replace(/['"]/g, '');
    const val = match[3];
    existingIcons[key] = val;
  }

  // Mesclar ícones: novos ícones de arquivos SVG sobrescrevem ou estendem
  const mergedIcons = { ...existingIcons, ...newIconPaths };

  // Formatar o novo bloco de dicionário
  const formattedEntries = Object.entries(mergedIcons)
    .map(([key, val]) => `    ${key.includes('-') ? `'${key}'` : key}: ${JSON.stringify(val)},`)
    .join('\n');

  const newDictBlock = `\n${formattedEntries}\n  `;

  // Substituir o bloco antigo pelo novo
  const updatedDsContent = 
    dsContent.slice(0, startContentIndex) + 
    newDictBlock + 
    dsContent.slice(endIndex);

  fs.writeFileSync(DS_JS_PATH, updatedDsContent, 'utf8');
  console.log('✅ Arquivo ds.js atualizado com sucesso com todos os ícones!');
}

main().catch(err => {
  console.error('💥 Ocorreu um erro no processamento:', err);
});
