import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {digest,groupedManifest,parseShare,shareLevel} from '../src/core/share';
import {searchKey} from '../src/level-catalog';
import {coverLimit,shareExtension,shareLimit,type ShareManifest,type SharedWork} from '../src/share-types';
import {initialize,type Database,type Objects,type Query} from './database';

const derive=promisify(scrypt);
const random=(length=16)=>randomBytes(length).toString('hex');
const json=(value:unknown,status=200,headers:HeadersInit={})=>Response.json(value,{status,headers:{'cache-control':'no-store',...headers}});
const maxStorage=850*1024*1024,maxTransfer=4*1024*1024*1024;
const inputError=(text:string,status=400)=>new HttpError(text,status);
class HttpError extends Error {constructor(message:string,readonly status:number){super(message);}}

async function secret(value:string,salt=random()){
  return salt+':'+(await derive(value,salt,64) as Buffer).toString('hex');
}
async function matches(value:string,stored:string){
  const expected=Buffer.from(stored),actual=Buffer.from(await secret(value,stored.split(':')[0]));
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function clean(value:unknown,max:number,label:string,empty=false){
  if(typeof value!=='string')throw inputError(label+'无效');
  const text=value.trim().normalize('NFC');
  if((!text&&!empty)||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw inputError(label+'无效');
  return text;
}
async function body(request:Request,maximum:number){
  if(Number(request.headers.get('content-length'))>maximum)throw inputError('文件大小超过上限',413);
  const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
  let size=0;const chunks:Uint8Array[]=[];
  try{
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maximum)throw inputError('文件大小超过上限',413);chunks.push(part.value);}
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return Buffer.concat(chunks,size);
}
async function jsonBody(request:Request){try{return JSON.parse((await body(request,4096)).toString());}catch(e){if(e instanceof HttpError)throw e;throw inputError('提交信息格式无效');}}
function checkImage(bytes:Buffer){
  if(bytes.length<30||bytes.toString('ascii',0,4)!=='RIFF'||bytes.readUInt32LE(4)!==bytes.length-8||bytes.toString('ascii',8,12)!=='WEBP')throw inputError('请选择 WebP 图片');
  const type=bytes.toString('ascii',12,16);let width=0,height=0;
  if(type==='VP8X'&&!(bytes[20]&2)){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);}
  if(type==='VP8 '&&bytes.readUIntLE(23,3)===0x2a019d){width=bytes.readUInt16LE(26)&0x3fff;height=bytes.readUInt16LE(28)&0x3fff;}
  if(type==='VP8L'&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);}
  if(width<1||height<1||width>640||height>360)throw inputError('图片尺寸上限为 640 × 360');
}
export const workSelect=`SELECT w.id,w.account,w.created,w.updated,w.active,r.id AS release,r.title,r.description,r.version,r.manifest,r.bytes,r.cover,r.previews,a.username
  FROM works w JOIN releases r ON r.id=w.latest JOIN accounts a ON a.id=w.account`;
type WorkRow={id:string;account:string;created:Date|string;updated:Date|string;active:boolean;release:string;title:string;description:string;version:string;manifest:ShareManifest;bytes:number;cover:string|null;previews:Record<string,string>;username:string};
function publicWork(row:WorkRow,account?:string):SharedWork {
  return {id:row.id,title:row.title,description:row.description,author:row.username,owner:row.account===account,version:row.version,
    updated:new Date(row.updated).toISOString(),created:new Date(row.created).toISOString(),manifest:row.manifest,cover:Boolean(row.cover),previews:Object.keys(row.previews),size:row.bytes};
}
async function takeQuota(db:Query,key:string,amount:number,limit:number){
  const updated=await db.query(`INSERT INTO limits (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=limits.value+$2,touched=now() WHERE limits.value+$2<=$3 RETURNING value`,[key,amount,limit]);
  if(!updated.rows.length)throw inputError('社区额度暂时不足，请稍后再试',429);
}

export function community(database:Database,objects:Objects){
  let ready:Promise<void>|undefined;
  let directoryMigration:Promise<void>|undefined;
  const month=()=>new Date().toISOString().slice(0,7);
  async function updateDirectory(row:{id:string;work:string;manifest:ShareManifest}){
    const bytes=await objects.get('design/'+row.work+'/'+row.id);
    if(!bytes)return row.manifest;
    let manifest;
    try{manifest=groupedManifest(row.manifest,parseShare(bytes).design);}
    catch{return row.manifest;}
    await database.query("UPDATE releases SET manifest=$2 WHERE id=$1 AND NOT manifest ? 'groups'",[row.id,JSON.stringify(manifest)]);
    return manifest;
  }
  async function migrateRecentDirectories(){
    return directoryMigration??=(async()=>{
      const {rows}=await database.query("SELECT r.id,r.work,r.manifest FROM works w JOIN releases r ON r.id=w.latest WHERE w.active AND NOT r.manifest ? 'groups' ORDER BY w.updated DESC LIMIT 12");
      for(const row of rows)await updateDirectory(row).catch(()=>{});
    })().finally(()=>{directoryMigration=undefined;});
  }
  async function find(id:string){
    const row=(await database.query(workSelect+' WHERE w.id=$1',[id])).rows[0] as WorkRow|undefined;
    if(row?.active&&!row.manifest.groups)row.manifest=await updateDirectory({id:row.release,work:id,manifest:row.manifest}).catch(()=>row.manifest);
    return row;
  }
  async function identify(request:Request){
    const authorization=request.headers.get('authorization');
    const token=authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]??request.headers.get('cookie')?.match(/(?:^|;\s*)sstar_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if(!token)return null;
    const key=digest(token),result=await database.query('SELECT s.account AS id,a.username FROM sessions s JOIN accounts a ON a.id=s.account WHERE s.token=$1 AND s.expires>now()',[key]);
    return result.rows[0]?{id:String(result.rows[0].id),username:String(result.rows[0].username),key}:null;
  }
  async function issue(request:Request,id:string,username:string,recovery?:string){
    const token=random(32);
    await database.query(`INSERT INTO sessions (token,account,expires) VALUES ($1,$2,now()+interval '7 days')`,[digest(token),id]);
    const desktop=request.headers.get('x-sstar-desktop')==='1'&&!request.headers.has('origin');
    const cookie=`sstar_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${new URL(request.url).protocol==='https:'?'; Secure':''}`;
    return json({username,recovery,...desktop?{token}:{}},200,desktop?{}:{'set-cookie':cookie});
  }
  async function account(action:string,request:Request,visitor:string){
    const current=await identify(request);
    if(action==='session'&&request.method==='GET')return json({username:current?.username??null});
    if(request.method!=='POST')throw inputError('请求方式无效',405);
    if(action==='logout'){if(current)await database.query('DELETE FROM sessions WHERE token=$1',[current.key]);return json({ok:true},200,{'set-cookie':'sstar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});}
    await takeQuota(database,`auth:${new Date().toISOString().slice(0,13)}:${visitor}`,1,35);
    const input=await jsonBody(request);
    const username=clean(input?.username,32,'用户名');
    if(!/^[\p{L}\p{N}_-]{2,32}$/u.test(username))throw inputError('用户名需为 2–32 个字母、数字、汉字、下划线或连字符');
    const login=username.normalize('NFKC').toLowerCase(),password=input?.password;
    if(typeof password!=='string'||password.length<10||password.length>128)throw inputError('密码长度应为 10–128 个字符');
    if(action==='signup'){
      await takeQuota(database,`signup:${new Date().toISOString().slice(0,10)}:${visitor}`,1,10);
      const id=random(),recovery=random(12);
      const result=await database.query('INSERT INTO accounts (id,username,login,password,recovery) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (login) DO NOTHING RETURNING id',[id,username,login,await secret(password),await secret(recovery)]);
      if(!result.rows.length)throw inputError('该用户名已使用',409);
      return issue(request,id,username,recovery);
    }
    const found=(await database.query('SELECT id,username,password,recovery FROM accounts WHERE login=$1',[login])).rows[0];
    if(action==='recover'){
      const recovery=clean(input.recovery,24,'恢复码');
      if(!await matches(recovery,found?.recovery??'00000000000000000000000000000000:'+ '0'.repeat(128))||!found)throw inputError('用户名或恢复码无效',401);
      const next=random(12),changed=await database.transaction(async db=>{
        const result=await db.query('UPDATE accounts SET password=$2,recovery=$3 WHERE id=$1 AND recovery=$4 RETURNING id',[found.id,await secret(password),await secret(next),found.recovery]);
        if(result.rows.length)await db.query('DELETE FROM sessions WHERE account=$1',[found.id]);
        return result.rows.length>0;
      });
      if(!changed)throw inputError('此恢复码已使用',401);
      return issue(request,found.id,found.username,next);
    }
    if(action!=='login')throw inputError('找不到请求入口',404);
    if(!await matches(password,found?.password??'00000000000000000000000000000000:'+ '0'.repeat(128))||!found)throw inputError('用户名或密码无效',401);
    return issue(request,found.id,found.username);
  }
  async function publish(request:Request,owner:string,existing?:WorkRow){
    await takeQuota(database,`publish:${new Date().toISOString().slice(0,10)}:${owner}`,1,20);
    let metadata;
    try{metadata=JSON.parse(Buffer.from(request.headers.get('x-work-meta')??'','base64').toString());}catch{throw inputError('缺少作品信息');}
    const title=clean(metadata?.title,100,'作品名称'),description=clean(metadata?.description,800,'简介',true),version=clean(metadata?.version,40,'版本');
    const bytes=await body(request,shareLimit);
    let manifest;
    try{const parsed=parseShare(bytes);manifest=groupedManifest(parsed.manifest,parsed.design);}catch(e){throw inputError((e as Error).message);}
    const id=existing?.id??random(),release=random(),key=`design/${id}/${release}`;
    try{
      await database.transaction(async db=>{
        await takeQuota(db,'storage',bytes.length,maxStorage);
        if(!existing)await db.query('INSERT INTO works (id,account,latest) VALUES ($1,$2,$3)',[id,owner,release]);
        else{
          const latest=(await db.query('SELECT latest,active FROM works WHERE id=$1 FOR UPDATE',[id])).rows[0];
          if(!latest?.active||latest.latest!==existing.release)throw inputError('作品已更新，请刷新后再试',409);
        }
        const inserted=await db.query(`INSERT INTO releases (id,work,version,title,description,manifest,bytes) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(work,version) DO NOTHING RETURNING id`,[release,id,version,title,description,JSON.stringify(manifest),bytes.length]);
        if(!inserted.rows.length)throw inputError('此版本已发布，请填写新版本号',409);
        await objects.put(key,bytes);
        await db.query('UPDATE works SET latest=$2,updated=now() WHERE id=$1',[id,release]);
      });
    }catch(e){await objects.remove(key).catch(()=>{});throw e;}
    return json({id},existing?200:201);
  }
  async function thumbnail(row:WorkRow,level:string|undefined,request:Request,owner?:string){
    const old=level?row.previews[level]:row.cover;
    if(request.method==='GET'){
      if(!old)throw inputError('该作品没有预览图',404);
      const bytes=await objects.get(old);if(!bytes)throw inputError('预览图丢失',404);
      await takeQuota(database,'transfer:'+month(),bytes.length,maxTransfer);
      return new Response(new Uint8Array(bytes),{headers:{'content-type':'image/webp','cache-control':'public,max-age=120','x-content-type-options':'nosniff'}});
    }
    if(request.method!=='POST'||owner!==row.account)throw inputError('只有作者可以修改预览图',403);
    if(level&&!row.manifest.levels.some(l=>l.id===level))throw inputError('找不到此关卡',404);
    if(level&&!old&&Object.keys(row.previews).length>=12)throw inputError('每个版本最多公开 12 张关卡预览');
    const bytes=await body(request,coverLimit);checkImage(bytes);
    const key=`image/${row.id}/${row.release}/${random()}`;
    try {
      await database.transaction(async db=>{
        await takeQuota(db,'storage',bytes.length,maxStorage);
        const locked=(await db.query('SELECT latest,active FROM works WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
        if(!locked?.active||locked.latest!==row.release)throw inputError('作品版本已切换，请刷新后再试',409);
        const current=(await db.query('SELECT cover,previews FROM releases WHERE id=$1 FOR UPDATE',[row.release])).rows[0];
        if((level?current.previews[level]:current.cover)!==old)throw inputError('预览图已修改，请刷新后再试',409);
        if(level&&!old&&Object.keys(current.previews).length>=12)throw inputError('每个版本最多公开 12 张关卡预览');
        await objects.put(key,bytes);
        if(level)await db.query('UPDATE releases SET previews=jsonb_set(previews,ARRAY[$2],to_jsonb($3::text)) WHERE id=$1',[row.release,level,key]);
        else await db.query('UPDATE releases SET cover=$2 WHERE id=$1',[row.release,key]);
      });
    }catch(e){await objects.remove(key).catch(()=>{});throw e;}
    if(old){const previous=await objects.get(old).catch(()=>null);await objects.remove(old).then(()=>previous?takeQuota(database,'storage',-previous.length,maxStorage):undefined).catch(()=>{});}
    return json({ok:true});
  }
  return async (request:Request,ip='local'):Promise<Response>=>{
    try{
      ready??=initialize(database).catch(e=>{ready=undefined;throw e;});await ready;
      const url=new URL(request.url),parts=url.pathname.split('/').slice(2),[area,id,action,level]=parts,method=request.method;
      if(!url.pathname.startsWith('/api/')||parts.length>4)throw inputError('找不到请求入口',404);
      const origin=request.headers.get('origin');
      if(method!=='GET'&&origin&&origin!==url.origin)throw inputError('请从本社区提交',403);
      const visitor=digest(ip).slice(0,32);
      if(area==='account'&&id&&!action)return await account(id,request,visitor);
      if(area!=='works')throw inputError('找不到请求入口',404);
      const current=await identify(request);
      if(!id){
        if(method==='POST'){if(!current)throw inputError('请先登录作者账号',401);return await publish(request,current.id);}
        if(method!=='GET')throw inputError('请求方式无效',405);
        const q=clean(url.searchParams.get('q')??'',100,'检索词',true),category=url.searchParams.get('type')??'',page=Number(url.searchParams.get('page')??0);
        if(!Number.isInteger(page)||page<0||page>500)throw inputError('页码无效');
        await migrateRecentDirectories().catch(()=>{});
        const words=searchKey(q).split(/\s+/).filter(Boolean);
        const root="concat_ws(' ',r.title,r.description,a.username,r.manifest->>'title')";
        const matches=(source:string)=>`NOT EXISTS (SELECT 1 FROM unnest($1::text[]) AS needle WHERE strpos(lower(normalize(${source}, NFKC)),needle)=0)`;
        const rows=await database.query(workSelect+` WHERE w.active AND (${matches(root)} OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(r.manifest->'levels') l
            LEFT JOIN LATERAL (SELECT g->>'title' AS title FROM jsonb_array_elements(COALESCE(r.manifest->'groups','[]'::jsonb)) g WHERE g->>'id'=l->>'groupId' LIMIT 1) grp ON TRUE
            WHERE ${matches(`concat_ws(' ',${root},l->>'title',l->>'id',coalesce(grp.title,'未分组'))`)}))
          AND ($2='' OR ($2='level' AND r.manifest->>'scope'='level') OR ($2='project' AND r.manifest->>'scope'<>'level')
            OR ($2='projects' AND r.manifest->>'scope'='project') OR ($2='library' AND r.manifest->>'scope' IN ('level','group'))) ORDER BY w.updated DESC,w.id DESC LIMIT 21 OFFSET $3`,[words,category,page*20]);
        return json({works:rows.rows.slice(0,20).map(row=>publicWork(row,current?.id)),more:rows.rows.length>20});
      }
      if(!/^[a-f0-9]{32}$/.test(id))throw inputError('找不到此作品',404);
      const row=await find(id);
      if(!row?.active)throw inputError('作品已下架或不存在',404);
      if(!action){
        if(method==='GET')return json(publicWork(row,current?.id));
        if(current?.id!==row.account)throw inputError('只有作者可以修改作品',403);
        if(method==='PATCH')return await publish(request,row.account,row);
        if(method==='DELETE'){await database.query('UPDATE works SET active=false WHERE id=$1',[id]);return json({ok:true});}
      }
      if(action==='cover'||action==='previews'&&level)return await thumbnail(row,level,request,current?.id);
      if(action==='report'&&method==='POST'){
        await takeQuota(database,`report:${new Date().toISOString().slice(0,10)}:${visitor}`,1,10);
        const reason=clean((await jsonBody(request))?.reason,500,'举报理由');
        await database.query('INSERT INTO reports (work,visitor,note) VALUES ($1,$2,$3) ON CONFLICT(work,visitor) DO UPDATE SET note=excluded.note,created=now()',[id,current?.id??visitor,reason]);
        return json({ok:true});
      }
      if(action==='download'&&method==='GET'){
        const stored=await objects.get(`design/${id}/${row.release}`);if(!stored)throw inputError('作品文件暂时不可用',503);
        const selected=url.searchParams.get('level');let bytes=stored,title=row.title;
        if(selected){
          const level=row.manifest.levels.find(l=>l.id===selected);if(!level)throw inputError('找不到此关卡',404);
          if(row.manifest.scope!=='level')bytes=shareLevel(parseShare(stored).design,row.manifest,selected).bytes;
          title=level.title;
        }
        await takeQuota(database,'transfer:'+month(),bytes.length,maxTransfer);
        return new Response(new Uint8Array(bytes),{headers:{'content-type':'application/gzip','cache-control':'no-store','x-content-type-options':'nosniff','x-design-sha256':digest(bytes),'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(title.replace(/[<>:"/\\|?*]/g,'_')+shareExtension)}`}});
      }
      throw inputError('找不到请求入口',404);
    }catch(e){
      if(e instanceof HttpError)return json({error:e.message},e.status);
      console.error('Community request failed',e instanceof Error?e.name:'Unknown');
      return json({error:'社区服务暂时不可用，请稍后重试'},503);
    }
  };
}
