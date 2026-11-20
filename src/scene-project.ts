import type {EditorProject,WorldProject} from './shared';

export function mapProject(world:WorldProject):EditorProject{
 return {
  format:'sinking-star-project',version:3,sourceHash:world.sourceHash,sourceBuild:world.sourceBuild,sourceEvidence:world.sourceEvidence,
  template:world.native?'overworld':'mirror_1',name:'overworld',operations:world.map.objects??[],
  camera:world.native?world.native.camera:world.map.camera,topology:world.native?.topology
 };
}

export function sceneProject(world:WorldProject,scene:string){
 return scene==='world'?mapProject(world):world.levels.find(level=>level.id===scene)?.project;
}
