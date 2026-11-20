export interface SharedGroup { id:string; title:string }
export interface SharedLevel { id: string; title: string; groupId?:string; requires?: string[] }
export interface ShareManifest {
  format: 'sstar-share'; version: 1; scope: 'level' | 'group' | 'project';
  title: string; sourceBuild: string; sourceHash: string; editorVersion: string;
  sha256: string; levels: SharedLevel[]; groups?:SharedGroup[]; primaryId?:string;
}
export interface SharedWork {
  id: string; title: string; description: string; author: string; owner: boolean;
  version: string; updated: string; created: string; manifest: ShareManifest;
  cover: boolean; previews: string[]; size: number;
  localSample?:boolean;
}
export interface ShareDraft {
  manifest: ShareManifest; size: number; cover?: string; previews: Record<string, string>;
}
export const shareExtension = '.sstar-share.gz';
export const shareLimit = 5 * 1024 * 1024;
export const shareExpandedLimit = 64 * 1024 * 1024;
export const coverLimit = 180 * 1024;
