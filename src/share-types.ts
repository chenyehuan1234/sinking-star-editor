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
  tags?:string[];
  localSample?:boolean;
  scenePreview?:boolean;
  fullImagePreview?:boolean;
}
export interface ShareDraft {
  id: string; manifest: ShareManifest; size: number; cover?: string; previews: Record<string, string>; fullImages?:Record<string,string>;
}
export type CommunityPreviewSource='scene'|'standalone'|'stage'|'local';
export interface CommunityImage {thumbnail:string;full?:string}
export const shareExtension = '.sstar-share.gz';
export const shareLimit = 5 * 1024 * 1024;
export const shareExpandedLimit = 64 * 1024 * 1024;
export const coverLimit = 180 * 1024;
export const fullImageLimit = 1024 * 1024;
export const fullImageSize = {width:1920,height:1080} as const;
export const scenePreviewLimit = 512 * 1024;
export const previewImagesLimit = 16 * 1024 * 1024;
export const tagLimit = 6;
export const tagLength = 24;
export type CommunitySort='newest'|'oldest'|'updated';
