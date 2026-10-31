import fs from 'node:fs';
import {materializeExample}from'../src/core/examples';
import{sha256,type GamePackage}from'../src/core/package';
import type{PropertyCodec}from'../src/core/properties';
import type{WorldProject}from'../src/shared';
import{upgradeWorld}from'../src/core/migrate';

export function exampleFixture(name:string,pkg:GamePackage|null,c:PropertyCodec|null):WorldProject{
 const recipe=JSON.parse(fs.readFileSync(`examples/${name}.recipe.json`,'utf8'));
 if(pkg&&c)return materializeExample(recipe,pkg,c,sha256(pkg.buffer),'native-test');
 // Recovery/store tests need authored metadata only, not an installed game.
 const w=structuredClone(recipe.world)as WorldProject;w.sourceHash='a'.repeat(64);w.sourceBuild='fixture';
 for(const l of w.levels){l.project.sourceHash=w.sourceHash;l.project.sourceBuild=w.sourceBuild;}
 return upgradeWorld(w);
}
