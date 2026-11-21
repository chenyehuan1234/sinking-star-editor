import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {digest,groupedManifest,parseShare,shareLevel} from '../src/core/share';
import {searchKey} from '../src/level-catalog';
import {coverLimit,shareExtension,shareLimit,type ShareManifest,type SharedWork} from '../src/share-types';
import type {Database, Objects, Statement} from './database';

const derive=promisify(scrypt);
const random=(length=16)=>randomBytes(length).toString('hex');
const json=(value:unknown,status=200,headers:HeadersInit={})=>Response.json(value,{status,headers:{'cache-control':'no-store',...headers}});
const maxTransfer=4*1024*1024*1024;
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
const workSelect=`SELECT w.id,w.account,w.created,w.updated,w.active,r.id AS release,r.title,r.description,r.version,r.manifest,r.bytes,r.cover,r.previews,a.username
  FROM works w JOIN releases r ON r.id=w.latest JOIN accounts a ON a.id=w.account`;
type WorkRecord={id:string;account:string;created:string;updated:string;active:number;release:string;title:string;description:string;version:string;manifest:string;bytes:number;cover:string|null;previews:string;username:string};
type WorkRow=Omit<WorkRecord,'manifest'|'previews'>&{manifest:ShareManifest;previews:Record<string,string>};
const readWork=(row:WorkRecord):WorkRow=>({...row,manifest:JSON.parse(row.manifest),previews:JSON.parse(row.previews)});
function publicWork(row:WorkRow,account?:string):SharedWork {
  return {id:row.id,title:row.title,description:row.description,author:row.username,owner:row.account===account,version:row.version,
    updated:new Date(row.updated).toISOString(),created:new Date(row.created).toISOString(),manifest:row.manifest,cover:Boolean(row.cover),previews:Object.keys(row.previews),size:row.bytes};
}
async function takeQuota(db:Database,key:string,amount:number,limit:number){
  const updated=await db.query(`INSERT INTO limits (key,value) SELECT ?,? WHERE ?<=?
    ON CONFLICT (key) DO UPDATE SET value=limits.value+excluded.value
    WHERE limits.value+excluded.value<=? RETURNING value`,[key,amount,amount,limit,limit]);
  if(!updated.length)throw inputError('社区额度暂时不足，请稍后再试',429);
}

export function searchFields(title:string,description:string,username:string,manifest:ShareManifest){
  const groups=new Map(manifest.groups?.map(group=>[group.id,group.title]));
  return [
    searchKey([title,description,username,manifest.title].join(' ')),
    JSON.stringify(manifest.levels.map(level=>searchKey([level.title,level.id,groups.get(level.groupId??'')??'未分组'].join(' ')))),
  ] as const;
}
const matchWords=(text:string)=>`NOT EXISTS (SELECT 1 FROM json_each(filters.words) word WHERE instr(${text},word.value)=0)`;
const searchWorks='WITH filters(words, category) AS (VALUES(?,?)) '+workSelect+` CROSS JOIN filters
    WHERE w.active=1 AND (${matchWords('r.search_root')} OR EXISTS (
      SELECT 1 FROM json_each(r.search_levels) stage WHERE ${matchWords("r.search_root || ' ' || stage.value")}))
    AND (filters.category='' OR (filters.category='level' AND r.scope='level') OR (filters.category='project' AND r.scope<>'level')
      OR (filters.category='projects' AND r.scope='project') OR (filters.category='library' AND r.scope IN ('level','group')))
    ORDER BY w.updated DESC,w.id DESC LIMIT 21 OFFSET ?`;

export function community(database:Database,objects:Objects){
  const month=()=>new Date().toISOString().slice(0,7);
  async function find(id:string){
    const [row]=await database.query<WorkRecord>(workSelect+' WHERE w.id=?',[id]);
    return row?readWork(row):undefined;
  }
  async function writeObject(key:string,bytes:Buffer,commit:()=>Promise<void>,references:()=>Promise<boolean>){
    await objects.put(key,bytes);
    try{await commit();}
    catch(error){
      // A timed-out write may already have committed. Keep the object if D1 cannot confirm rollback.
      if(await references().then(found=>!found,()=>false))await objects.remove(key).catch(()=>{});
      const reason=String(error);
      if(reason.includes('community_storage_limit'))throw inputError('社区存储额度不足，暂时无法发布',429);
      if(reason.includes('community_stale_release'))throw inputError('作品已更新，请刷新后再试',409);
      if(reason.includes('community_duplicate_version'))throw inputError('此版本已发布，请填写新版本号',409);
      throw error;
    }
  }
  async function identify(request:Request){
    const authorization=request.headers.get('authorization');
    const token=authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]??request.headers.get('cookie')?.match(/(?:^|;\s*)sstar_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if(!token)return null;
    const key=digest(token),[result]=await database.query<{id:string;username:string}>(
      'SELECT s.account AS id,a.username FROM sessions s JOIN accounts a ON a.id=s.account WHERE s.token=? AND s.expires>?',[key,new Date().toISOString()]);
    return result?{...result,key}:null;
  }
  async function issue(request:Request,id:string,username:string,passwordHash:string,recovery?:string){
    const token=random(32);
    const expires=new Date(Date.now()+604800000).toISOString();
    const inserted=await database.query('INSERT INTO sessions (token,account,expires) SELECT ?,id,? FROM accounts WHERE id=? AND password=? RETURNING token',
      [digest(token),expires,id,passwordHash]);
    if(!inserted.length)throw inputError('账号凭据已更新，请重新登录',409);
    const desktop=request.headers.get('x-sstar-desktop')==='1'&&!request.headers.has('origin');
    const cookie=`sstar_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${new URL(request.url).protocol==='https:'?'; Secure':''}`;
    return json({username,recovery,...desktop?{token}:{}},200,desktop?{}:{'set-cookie':cookie});
  }
  async function account(action:string,request:Request,visitor:string){
    const current=await identify(request);
    if(action==='session'&&request.method==='GET')return json({username:current?.username??null});
    if(request.method!=='POST')throw inputError('请求方式无效',405);
    if(action==='logout'){if(current)await database.query('DELETE FROM sessions WHERE token=?',[current.key]);return json({ok:true},200,{'set-cookie':'sstar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});}
    await takeQuota(database,`auth:${new Date().toISOString().slice(0,13)}:${visitor}`,1,35);
    const input=await jsonBody(request);
    const username=clean(input?.username,32,'用户名');
    if(!/^[\p{L}\p{N}_-]{2,32}$/u.test(username))throw inputError('用户名需为 2–32 个字母、数字、汉字、下划线或连字符');
    const login=username.normalize('NFKC').toLowerCase(),password=input?.password;
    if(typeof password!=='string'||password.length<10||password.length>128)throw inputError('密码长度应为 10–128 个字符');
    if(action==='signup'){
      await takeQuota(database,`signup:${new Date().toISOString().slice(0,10)}:${visitor}`,1,10);
      const id=random(),recovery=random(12),passwordHash=await secret(password);
      const result=await database.query('INSERT INTO accounts (id,username,login,password,recovery) VALUES (?,?,?,?,?) ON CONFLICT (login) DO NOTHING RETURNING id',[id,username,login,passwordHash,await secret(recovery)]);
      if(!result.length)throw inputError('该用户名已使用',409);
      return issue(request,id,username,passwordHash,recovery);
    }
    const [found]=await database.query<{id:string;username:string;password:string;recovery:string}>('SELECT id,username,password,recovery FROM accounts WHERE login=?',[login]);
    if(action==='recover'){
      const recovery=clean(input.recovery,24,'恢复码');
      if(!await matches(recovery,found?.recovery??'00000000000000000000000000000000:'+ '0'.repeat(128))||!found)throw inputError('用户名或恢复码无效',401);
      const next=random(12),passwordHash=await secret(password);
      const changed=await database.query('UPDATE accounts SET password=?,recovery=? WHERE id=? AND recovery=? RETURNING id',
        [passwordHash,await secret(next),found.id,found.recovery]);
      if(!changed.length)throw inputError('此恢复码已使用',401);
      return issue(request,found.id,found.username,passwordHash,next);
    }
    if(action!=='login')throw inputError('找不到请求入口',404);
    if(!await matches(password,found?.password??'00000000000000000000000000000000:'+ '0'.repeat(128))||!found)throw inputError('用户名或密码无效',401);
    return issue(request,found.id,found.username,found.password);
  }
  async function publish(request:Request,author:{id:string;username:string},existing?:WorkRow){
    await takeQuota(database,`publish:${new Date().toISOString().slice(0,10)}:${author.id}`,1,20);
    let metadata;
    try{metadata=JSON.parse(Buffer.from(request.headers.get('x-work-meta')??'','base64').toString());}catch{throw inputError('缺少作品信息');}
    const title=clean(metadata?.title,100,'作品名称'),description=clean(metadata?.description,800,'简介',true),version=clean(metadata?.version,40,'版本');
    const bytes=await body(request,shareLimit);
    let manifest;
    try{const parsed=parseShare(bytes);manifest=groupedManifest(parsed.manifest,parsed.design);}catch(e){throw inputError((e as Error).message);}
    const id=existing?.id??random(),release=random(),key=`design/${id}/${release}`;
    const [root,stages]=searchFields(title,description,author.username,manifest);
    const statements:Statement[]=[];
    if(!existing)statements.push({sql:'INSERT INTO works (id,account) VALUES (?,?)',args:[id,author.id]});
    statements.push({
      sql:`INSERT INTO releases (id,work,previous,version,title,description,manifest,search_root,search_levels,scope,bytes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args:[release,id,existing?.release??null,version,title,description,JSON.stringify(manifest),root,stages,manifest.scope,bytes.length],
    });
    await writeObject(key,bytes,()=>database.batch(statements),
      async()=>Boolean((await database.query('SELECT id FROM releases WHERE id=?',[release])).length));
    return json({id},existing?200:201);
  }
  async function thumbnail(row:WorkRow,level:string|undefined,request:Request,owner?:string){
    const old=level?(Object.hasOwn(row.previews,level)?row.previews[level]:null):row.cover;
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
    const previous=old?await objects.size(old)??0:0;
    const previewPath=level?'$.'+JSON.stringify(level):'';
    const update=level?'previews=json_set(previews,?,?)':'cover=?';
    const unchanged=level?`json_extract(previews,?) IS ? AND
      (? IS NOT NULL OR (SELECT count(*) FROM json_each(previews))<12)`:'cover IS ?';
    await writeObject(key,bytes,async()=>{
      const changed=await database.query(`UPDATE releases SET ${update},image_bytes=image_bytes+?
        WHERE id=? AND ${unchanged} AND EXISTS (
          SELECT 1 FROM works WHERE id=? AND latest=? AND active=1
        ) RETURNING id`,
        [...level?[previewPath,key]:[key],bytes.length-previous,row.release,
          ...level?[previewPath,old??null,old??null]:[row.cover],row.id,row.release]);
      if(!changed.length)throw inputError('作品版本或预览图已修改，请刷新后再试',409);
    },async()=>{
      const [release]=await database.query<{cover:string|null;previews:string}>('SELECT cover,previews FROM releases WHERE id=?',[row.release]);
      return Boolean(release&&(release.cover===key||Object.values(JSON.parse(release.previews)).includes(key)));
    });
    if(old)await objects.remove(old).catch(()=>{});
    return json({ok:true});
  }
  return async (request:Request,ip='local'):Promise<Response>=>{
    try{
      const url=new URL(request.url),parts=url.pathname.split('/').slice(2),[area,id,action,level]=parts,method=request.method;
      if(!url.pathname.startsWith('/api/')||parts.length>4)throw inputError('找不到请求入口',404);
      const origin=request.headers.get('origin');
      if(method!=='GET'&&origin&&origin!==url.origin)throw inputError('请从本社区提交',403);
      const visitor=digest(ip).slice(0,32);
      if(area==='account'&&id&&!action)return await account(id,request,visitor);
      if(area!=='works')throw inputError('找不到请求入口',404);
      const current=await identify(request);
      if(!id){
        if(method==='POST'){if(!current)throw inputError('请先登录作者账号',401);return await publish(request,current);}
        if(method!=='GET')throw inputError('请求方式无效',405);
        const q=clean(url.searchParams.get('q')??'',100,'检索词',true),category=url.searchParams.get('type')??'',page=Number(url.searchParams.get('page')??0);
        if(!Number.isInteger(page)||page<0||page>500)throw inputError('页码无效');
        const words=searchKey(q).split(/\s+/).filter(Boolean);
        const rows=await database.query<WorkRecord>(searchWorks,[JSON.stringify(words),category,page*20]);
        return json({works:rows.slice(0,20).map(row=>publicWork(readWork(row),current?.id)),more:rows.length>20});
      }
      if(!/^[a-f0-9]{32}$/.test(id))throw inputError('找不到此作品',404);
      const row=await find(id);
      if(!row?.active)throw inputError('作品已下架或不存在',404);
      if(!action){
        if(method==='GET')return json(publicWork(row,current?.id));
        if(current?.id!==row.account)throw inputError('只有作者可以修改作品',403);
        if(method==='PATCH')return await publish(request,current,row);
        if(method==='DELETE'){await database.query('UPDATE works SET active=0 WHERE id=?',[id]);return json({ok:true});}
      }
      if(action==='cover'||action==='previews'&&level)return await thumbnail(row,level,request,current?.id);
      if(action==='report'&&method==='POST'){
        await takeQuota(database,`report:${new Date().toISOString().slice(0,10)}:${visitor}`,1,10);
        const reason=clean((await jsonBody(request))?.reason,500,'举报理由');
        await database.query('INSERT INTO reports (work,visitor,note) VALUES (?,?,?) ON CONFLICT(work,visitor) DO UPDATE SET note=excluded.note,created=excluded.created',[id,current?.id??visitor,reason]);
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
