import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COR_PADRAO = 0x5865f2;
export function interpretarCor(valor: string): number | null {
  const hex = valor.trim();
  return /^#?[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.replace(/^#/, ''), 16) : null;
}
export function formatarCor(cor: number): string { return '#' + cor.toString(16).padStart(6, '0').toUpperCase(); }

export function criarConfiguracaoCores(arquivo = fileURLToPath(new URL('../../data/cores.json', import.meta.url))) {
  let dados: Record<string, number> = {};
  if (existsSync(arquivo)) {
    const carregado: unknown = JSON.parse(readFileSync(arquivo, 'utf8'));
    if (!carregado || typeof carregado !== 'object' || Array.isArray(carregado)) throw new Error('Arquivo de cores inválido.');
    for (const [id, cor] of Object.entries(carregado)) {
      if (!/^\d{17,20}$/.test(id) || typeof cor !== 'number' || !Number.isInteger(cor) || cor < 0 || cor > 0xffffff) throw new Error('Configuração de cor inválida: ' + id);
      dados[id] = cor;
    }
  }
  return {
    obter(guildId: string | null): number { return guildId ? dados[guildId] ?? COR_PADRAO : COR_PADRAO; },
    salvar(guildId: string, cor: number): void {
      if (!/^\d{17,20}$/.test(guildId) || !Number.isInteger(cor) || cor < 0 || cor > 0xffffff) throw new Error('Cor ou servidor inválido.');
      const novos = { ...dados, [guildId]: cor };
      mkdirSync(dirname(arquivo), { recursive: true });
      writeFileSync(arquivo + '.tmp', JSON.stringify(novos, null, 2), 'utf8');
      renameSync(arquivo + '.tmp', arquivo);
      dados = novos;
    },
  };
}
