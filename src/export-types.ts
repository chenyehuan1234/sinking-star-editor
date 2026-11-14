import type {RunRequest,WorldProject} from './shared';
import type {NativeWorldProject} from './v08-types';
export interface ExportRequest {project:WorldProject|NativeWorldProject;scope:RunRequest;format:'project'|'runtime'}
export interface ExportResult {path:string;files:number;hash?:string}
