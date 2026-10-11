// Preserve original fifth toe-helper influence. No reweighting or rest-pose changes.
// Install after material adapter. Dispose in reverse order.
export function installCannonExtraSkinning(root) {
 const bindings=[];
 root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const a=mesh.geometry.getAttribute('_cannonweights0');if(!a)return;
  for(const name of ['_cannonweights0','_cannonweights1','_cannonjoints1']){
   const attr=mesh.geometry.getAttribute(name);if(!attr||attr.itemSize!==4||attr.count!==a.count)throw Error('Cannon extra skin attributes missing');
  }
  const original=mesh.material,materials=Array.isArray(original)?original:[original];
  const clones=materials.map(m=>{const c=m.clone(),before=m.onBeforeCompile,key=m.customProgramCacheKey?.bind(m);
   c.onBeforeCompile=function(shader,renderer){before?.call(this,shader,renderer);
    for(const marker of ['#include <skinbase_vertex>','#include <skinnormal_vertex>','#include <skinning_vertex>'])if(!shader.vertexShader.includes(marker))throw Error('Unsupported Cannon skinning chunk '+marker);
    shader.vertexShader='attribute vec4 _cannonweights0;\nattribute vec4 _cannonweights1;\nattribute vec4 _cannonjoints1;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <skinbase_vertex>',`#include <skinbase_vertex>
mat4 cannonSkinMatrix = _cannonweights0.x * boneMatX + _cannonweights0.y * boneMatY + _cannonweights0.z * boneMatZ + _cannonweights0.w * boneMatW
 + _cannonweights1.x * getBoneMatrix(_cannonjoints1.x) + _cannonweights1.y * getBoneMatrix(_cannonjoints1.y) + _cannonweights1.z * getBoneMatrix(_cannonjoints1.z) + _cannonweights1.w * getBoneMatrix(_cannonjoints1.w);
mat4 cannonBoundSkin = bindMatrixInverse * cannonSkinMatrix * bindMatrix;`)
    .replace('#include <skinnormal_vertex>',`objectNormal = vec4(cannonBoundSkin * vec4(objectNormal,0.0)).xyz;
#ifdef USE_TANGENT
objectTangent = vec4(cannonBoundSkin * vec4(objectTangent,0.0)).xyz;
#endif`)
    .replace('#include <skinning_vertex>','transformed = (cannonBoundSkin * vec4(transformed,1.0)).xyz;');
   };c.customProgramCacheKey=()=>`${key?.()??''}|cannon-source-eight-influence-v1`;c.needsUpdate=true;return c;});
  mesh.material=Array.isArray(original)?clones:clones[0];bindings.push({mesh,original,clones});
 });
 if(!bindings.length)throw Error('Cannon extra-influence mesh missing');let disposed=false;
 return {dispose(){if(disposed)return;disposed=true;for(const b of bindings){b.mesh.material=b.original;for(const c of b.clones)c.dispose();}}};
}
