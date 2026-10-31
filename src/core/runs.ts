import type{WorldProject,RunRequest}from'../shared';import{sha256}from'./package';import{newWorld}from'./world';
export function scopedWorld(w:WorldProject,r:RunRequest):WorldProject{
 if(!r||!['world','single','subset'].includes(r.mode)||!Array.isArray(r.levelIds))throw Error('试玩范围无效');if(r.mode==='world')return structuredClone(w);if(!r.levelIds.length||r.mode==='single'&&r.levelIds.length!==1||new Set(r.levelIds).size!==r.levelIds.length)throw Error('请选择有效的试玩关卡');
 const levels=w.levels.filter(l=>r.levelIds.includes(l.id));if(levels.length!==r.levelIds.length)throw Error('所选关卡已不存在');const result=newWorld(w.sourceHash,w.sourceBuild);result.version=3;result.id=sha256(w.id+':'+r.mode+':'+levels.map(l=>l.id).sort().join(',')).slice(0,12);result.name=w.name+' · '+(r.mode==='single'?'单关测试':'临时关卡组');result.levels=structuredClone(levels);
 const cols=Math.ceil(Math.sqrt(levels.length)),rows=Math.ceil(levels.length/cols),width=Math.max(10,cols*3+6),height=Math.max(10,rows*3+6);result.map={width,height,tiles:Array(width*height).fill(1),spawn:[2,2],entries:levels.map((l,i)=>({id:'entry_'+i,title:l.title,levelId:l.id,x:4+i%cols*3,y:4+Math.floor(i/cols)*3}))};return result;
}
