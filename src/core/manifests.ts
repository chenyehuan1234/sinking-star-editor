export function mergeManifests(texts:string[],extras:string[]=[]):Buffer{
  const textures=new Set<string>(),meshes=new Set<string>(extras);for(const text of texts){let target=textures;for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(/;+\s*meshes/i.test(line)){target=meshes;continue;}if(/;+\s*textures/i.test(line)){target=textures;continue;}if(!line||line.startsWith('[')||line.startsWith(';')||line.startsWith('#'))continue;target.add(line);}}
  return Buffer.from(`[1]\n;;;;; textures\n${[...textures].join('\n')}\n;;;;; meshes\n${[...meshes].join('\n')}\n`);
}
