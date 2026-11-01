// Preserve every original mesh, skin, texture and non-attack animation byte.
import fs from 'node:fs';import crypto from 'node:crypto';
const target='public/tower-defense-art/models/clockworkPatchling/clockwork-patchling-animated.glb';
const baseline='local/patchling/original.glb';if(!fs.existsSync(baseline))fs.copyFileSync(target,baseline);
const originalHash=crypto.createHash('sha256').update(fs.readFileSync(baseline)).digest('hex');
if(originalHash!=='7b1a6f0d941d9a44eb4cb4bd15d83d8a8b44f2ffa353d6e8c95b7f1c44b03d98')throw Error('Materialize the preserved original GLB before merging');
function read(p){const b=fs.readFileSync(p);const n=b.readUInt32LE(12);return {j:JSON.parse(b.subarray(20,20+n).toString()),bin:b.subarray(28+n)}}
const original=read(baseline),candidate=read('local/patchling/attack-export.glb');
const j=original.j;let chunks=[original.bin],length=original.bin.length;
const attack=structuredClone(candidate.j.animations[0]);if(!attack)throw Error('Missing Blender attack');
const mapped=new Map();function copyAccessor(index){if(mapped.has(index))return mapped.get(index);const a=candidate.j.accessors[index],v=candidate.j.bufferViews[a.bufferView];const pad=(4-length%4)%4;chunks.push(Buffer.alloc(pad));length+=pad;const vi=j.bufferViews.length;j.bufferViews.push({...v,buffer:0,byteOffset:length});const data=candidate.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);chunks.push(data);length+=data.length;const ai=j.accessors.length;j.accessors.push({...a,bufferView:vi});mapped.set(index,ai);return ai;}
attack.name='attack';for(const s of attack.samplers){s.input=copyAccessor(s.input);s.output=copyAccessor(s.output)}
const bin=Buffer.concat(chunks);
for(const c of attack.channels){const name=candidate.j.nodes[c.target.node].name;const index=j.nodes.findIndex(n=>n.name===name);if(index<0)throw Error('Unknown bone '+name);c.target.node=index}
j.animations[j.animations.findIndex(a=>a.name==='attack')]=attack;j.buffers[0].byteLength=bin.length;
let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(target,Buffer.concat([header,json,bh,bin]));
console.log(JSON.stringify({bytes:fs.statSync(target).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),originalBytes:fs.statSync(baseline).size}));
