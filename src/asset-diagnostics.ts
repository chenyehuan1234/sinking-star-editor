import type {MaterialAsset, MeshAsset, TextureAsset} from './asset-types';

export type AssetKind = 'mesh' | 'texture' | 'pose' | 'material';
export type AssetProfileRequest = {kind:AssetKind; name:string; detail?:number};
export type AssetValue<K extends AssetKind> = K extends 'texture' ? TextureAsset : K extends 'material' ? MaterialAsset : MeshAsset;
export type AssetSource = 'renderer' | 'memory' | 'pending' | 'disk' | 'source' | 'package' | 'unavailable';

export interface AssetTimings {
  source:AssetSource;
  mainMs:number;
  diskMs?:number;
  readMs?:number;
  decodeMs?:number;
  cacheWriteMs?:number;
  workerBoundaryMs?:number;
}

export interface ProfiledAsset<K extends AssetKind> {
  value:AssetValue<K>;
  timings:AssetTimings;
}
