export type ObjectCategory='character'|'monster'|'block'|'mechanism'|'terrain'|'world'|'decoration'|'advanced'|'internal'|'excluded';
export type NativeValue=number|boolean|string|number[]|string[];
export interface ObjectField {
  name:string;label:string;kind:'number'|'integer'|'boolean'|'string'|'enum'|'flags'|'reference'|'resource'|'array';
  size:number;index:number;notes:string[];access:'design'|'runtime'|'deprecated'|'internal';
  options?:{name:string;value:string}[];min?:number;max?:number;targets?:string[];description?:string;
}
export interface ObjectDefinition {type:string;label:string;category:ObjectCategory;description:string;fields:Record<string,string>;dependencies:string[];tests:string[];placement:'single'|'assembly'|'terrain'|'internal'|'excluded';}
export interface ObjectTypeView extends Omit<ObjectDefinition,'fields'> {fields:ObjectField[];instances:number;completeInstances:number;presetCount:number;}
export interface ObjectPreset {
  key:string;label:string;type:string;category:ObjectCategory;template:string;sourceId:number;mesh:string;materials:string[];
  signature:Record<string,NativeValue>;values:Record<string,NativeValue>;tags:string[];parsed:boolean;placement:ObjectDefinition['placement'];
  verification:'native-data'|'runtime-smoke';
}
export interface ObjectCatalog {
  version:1;schemaRevision:2;sourceHash:string;exeHash:string;build:string;generatedAt:string;types:ObjectTypeView[];presets:ObjectPreset[];
  totals:{levels:number;entities:number;types:number;meshes:number;textures:number;presets:number};
}
