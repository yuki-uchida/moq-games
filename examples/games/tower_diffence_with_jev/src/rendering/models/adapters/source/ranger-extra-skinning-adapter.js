// Preserve original fifth toe-helper influence. No reweighting or rest-pose changes.
// Install after material adapter. Dispose in reverse order.
export function installRangerExtraSkinning(root) {
 const bindings=[];
 root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const a=mesh.geometry.getAttribute('_rangerweights0');if(!a)return;
  for(const name of ['_rangerweights0','_rangerweights1','_rangerjoints1']){
   const attr=mesh.geometry.getAttribute(name);if(!attr||attr.itemSize!==4||attr.count!==a.count)throw Error('Ranger extra skin attributes missing');
  }
  const original=mesh.material,materials=Array.isArray(original)?original:[original];
  const clones=materials.map(m=>{const c=m.clone(),before=m.onBeforeCompile,key=m.customProgramCacheKey?.bind(m);
   c.onBeforeCompile=function(shader,renderer){before?.call(this,shader,renderer);
    for(const marker of ['#include <skinbase_vertex>','#include <skinnormal_vertex>','#include <skinning_vertex>'])if(!shader.vertexShader.includes(marker))throw Error('Unsupported Ranger skinning chunk '+marker);
    shader.vertexShader='attribute vec4 _rangerweights0;\nattribute vec4 _rangerweights1;\nattribute vec4 _rangerjoints1;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <skinbase_vertex>',`#include <skinbase_vertex>
mat4 rangerSkinMatrix = _rangerweights0.x * boneMatX + _rangerweights0.y * boneMatY + _rangerweights0.z * boneMatZ + _rangerweights0.w * boneMatW
 + _rangerweights1.x * getBoneMatrix(_rangerjoints1.x) + _rangerweights1.y * getBoneMatrix(_rangerjoints1.y) + _rangerweights1.z * getBoneMatrix(_rangerjoints1.z) + _rangerweights1.w * getBoneMatrix(_rangerjoints1.w);
mat4 rangerBoundSkin = bindMatrixInverse * rangerSkinMatrix * bindMatrix;`)
    .replace('#include <skinnormal_vertex>',`objectNormal = vec4(rangerBoundSkin * vec4(objectNormal,0.0)).xyz;
#ifdef USE_TANGENT
objectTangent = vec4(rangerBoundSkin * vec4(objectTangent,0.0)).xyz;
#endif`)
    .replace('#include <skinning_vertex>','transformed = (rangerBoundSkin * vec4(transformed,1.0)).xyz;');
   };c.customProgramCacheKey=()=>`${key?.()??''}|ranger-source-eight-influence-v1`;c.needsUpdate=true;return c;});
  mesh.material=Array.isArray(original)?clones:clones[0];bindings.push({mesh,original,clones});
 });
 if(!bindings.length)throw Error('Ranger extra-influence mesh missing');let disposed=false;
 return {dispose(){if(disposed)return;disposed=true;for(const b of bindings){b.mesh.material=b.original;for(const c of b.clones)c.dispose();}}};
}
