// Runtime adaptation: Three GLTFLoader splits multi-material source meshes into primitives.
// Count original authored mesh nodes while applying unchanged DQ to EVERY primitive.
// The unmodified packaged adapter is retained in ../source.
// Tank-only preserve-volume skinning. Install AFTER the blink material adapter.
// Requires Three.js standard skinning chunks; no geometry or weight modifications.
export function tankMultiplyMatrices(a,b) {
 const out=new Float64Array(16);
 for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];
 return out;
}
export function tankMatrixToDualQuaternion(e) {
  if(e.length!==16||!Array.from(e).every(Number.isFinite))throw Error('Tank skin matrix must be finite');
  const a=e[0],b=e[4],c=e[8],d=e[1],f=e[5],g=e[9],h=e[2],i=e[6],j=e[10];
  const cols=[[a,d,h],[b,f,i],[c,g,j]];
  const dot=(x,y)=>x.reduce((s,v,k)=>s+v*y[k],0);
  for(let x=0;x<3;x++)for(let y=0;y<3;y++)if(Math.abs(dot(cols[x],cols[y])-(x===y?1:0))>1e-4)throw Error('Tank DQ requires rigid skin matrices');
  if(a*(f*j-g*i)-b*(d*j-g*h)+c*(d*i-f*h)<0)throw Error('Tank DQ rejects reflections');
  let x,y,z,w,s;const tr=a+f+j;
  if(tr>0){s=2*Math.sqrt(tr+1);w=s/4;x=(i-g)/s;y=(c-h)/s;z=(d-b)/s;}
  else if(a>f&&a>j){s=2*Math.sqrt(1+a-f-j);w=(i-g)/s;x=s/4;y=(b+d)/s;z=(c+h)/s;}
  else if(f>j){s=2*Math.sqrt(1+f-a-j);w=(c-h)/s;x=(b+d)/s;y=s/4;z=(g+i)/s;}
  else{s=2*Math.sqrt(1+j-a-f);w=(d-b)/s;x=(c+h)/s;y=(g+i)/s;z=s/4;}
  const n=Math.hypot(x,y,z,w);x/=n;y/=n;z/=n;w/=n;
  const tx=e[12],ty=e[13],tz=e[14];
  return [[x,y,z,w],[(tx*w+ty*z-tz*y)/2,(-tx*z+ty*w+tz*x)/2,(tx*y-ty*x+tz*w)/2,(-tx*x-ty*y-tz*z)/2]];
}
export const tankDQGLSL = `
vec3 tankDQRotate(vec4 q, vec3 p) { return p + 2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p); }
void tankDQBlend(out vec4 qr, out vec4 qd) {
 int first=skinWeight.x>0.0?0:(skinWeight.y>0.0?1:(skinWeight.z>0.0?2:3));
 vec4 ref=tankDQReal[int(skinIndex[first])]; qr=vec4(0.0); qd=vec4(0.0);
 for(int k=0;k<4;k++) { int b=int(skinIndex[k]); float w=skinWeight[k];
  float signQ=dot(ref,tankDQReal[b])<0.0?-1.0:1.0;
  qr += w*signQ*tankDQReal[b]; qd += w*signQ*tankDQDual[b];
 }
 float n=length(qr); if(n<1e-8){qr=vec4(0,0,0,1);qd=vec4(0);}
 else {qr/=n;qd/=n;}
}
vec3 tankDQTranslate(vec4 qr,vec4 qd) {return 2.0*(qr.w*qd.xyz-qd.w*qr.xyz+cross(qr.xyz,qd.xyz));}
`;
export function installTankDQSkinningAdapter(root, {THREE} = {}) {
 const meshes=[];root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
 const authoredMeshes = new Set(meshes.map(mesh => mesh.parent?.name === 'Tank_Original_Weighted' ? mesh.parent : mesh));
 if(authoredMeshes.size!==1 || !meshes.length)throw Error('Tank DQ requires all original authored mesh nodes, including material-split primitives');
 const palettes=new Map(),bindings=[];let disposed=false; const scratchA=new Float64Array(16),scratchB=new Float64Array(16);
 for(const mesh of meshes){
  if(mesh.castShadow && !THREE)throw Error('Tank DQ shadow casters require {THREE} for depth/distance materials');
  const sk=mesh.skeleton,n=sk.bones.length;
  if(![12,14].includes(n))throw Error('Tank DQ expects accepted 12- or 14-bone skeleton');
  const weights=mesh.geometry.getAttribute('skinWeight'),indices=mesh.geometry.getAttribute('skinIndex');
  if(!weights||!indices||weights.itemSize!==4||indices.itemSize!==4)throw Error('Tank skin attributes missing');
  const getters=THREE?.BufferAttribute?.prototype,components=['getX','getY','getZ','getW'];
  const raw=a=>getters&&!a.normalized&&components.every(k=>a[k]===getters[k])?a.array:null,weightArray=raw(weights),indexArray=raw(indices);
  for(let v=0;v<weights.count;v++){let sum=0,nonzero=0;for(let k=0;k<4;k++){const w=weightArray?weightArray[v*4+k]:weights[['getX','getY','getZ','getW'][k]](v),b=indexArray?indexArray[v*4+k]:indices[['getX','getY','getZ','getW'][k]](v);if(!Number.isFinite(w)||w<0||!Number.isInteger(b)||b<0||b>=n)throw Error('Invalid Tank skin weights');sum+=w;if(w>0)nonzero++;}if(Math.abs(sum-1)>1e-5||nonzero>4)throw Error('Tank requires normalized original up-to-four-influence weights');}
  if(!mesh.bindMatrix?.elements||!mesh.bindMatrixInverse?.elements)throw Error('Tank bind matrices missing');
  palettes.set(mesh,{real:{value:new Float32Array(n*4)},dual:{value:new Float32Array(n*4)}});
 }
 for(const mesh of meshes){
  const original=mesh.material,pal=palettes.get(mesh),n=mesh.skeleton.bones.length;
  const adapt=source=>{const m=source.clone(),previous=source.onBeforeCompile,cache=source.customProgramCacheKey?.bind(source);
   m.onBeforeCompile=function(shader,renderer){previous?.call(this,shader,renderer);
    for(const marker of ['#include <skinning_pars_vertex>','#include <skinbase_vertex>','#include <skinning_vertex>'])if(!shader.vertexShader.includes(marker))throw Error('Unsupported Three Tank DQ chunk: '+marker);
    shader.uniforms.tankDQReal=pal.real;shader.uniforms.tankDQDual=pal.dual;
    shader.vertexShader=shader.vertexShader.replace('#include <skinning_pars_vertex>',`#include <skinning_pars_vertex>\nuniform vec4 tankDQReal[${n}];\nuniform vec4 tankDQDual[${n}];\n${tankDQGLSL}`)
     .replace('#include <skinbase_vertex>','vec4 tankQR,tankQD; tankDQBlend(tankQR,tankQD);')
     .replace('#include <skinnormal_vertex>',`objectNormal=tankDQRotate(tankQR,objectNormal);
#ifdef USE_TANGENT
objectTangent=tankDQRotate(tankQR,objectTangent);
#endif`)
     .replace('#include <skinning_vertex>','transformed=tankDQRotate(tankQR,transformed)+tankDQTranslate(tankQR,tankQD);');
   };m.customProgramCacheKey=()=>`${cache?.()||''}:tank-dq-v1-${n}`;m.needsUpdate=true;return m;};
  const adapted=Array.isArray(original)?original.map(adapt):adapt(original);
  const depth=mesh.customDepthMaterial,distance=mesh.customDistanceMaterial,frustumCulled=mesh.frustumCulled;
  let adaptedDepth,adaptedDistance;
  if(THREE){
   const depthBase=depth||new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
   const distanceBase=distance||new THREE.MeshDistanceMaterial();
   adaptedDepth=adapt(depthBase);adaptedDistance=adapt(distanceBase);
   if(!depth)depthBase.dispose();if(!distance)distanceBase.dispose();
   mesh.customDepthMaterial=adaptedDepth;mesh.customDistanceMaterial=adaptedDistance;
  }
  mesh.material=adapted;mesh.frustumCulled=false;
  bindings.push({mesh,original,adapted,depth,distance,adaptedDepth,adaptedDistance,frustumCulled});
 }
 return {update(){if(disposed)throw Error('Tank DQ disposed');root.updateMatrixWorld(true);const skeletons=new Set(meshes.map(m=>m.skeleton));for(const sk of skeletons)sk.update();for(const [mesh,p] of palettes){const sk=mesh.skeleton;for(let b=0;b<sk.bones.length;b++){multiplyInto(mesh.bindMatrixInverse.elements,sk.boneMatrices,b*16,scratchA);multiplyInto(scratchA,mesh.bindMatrix.elements,0,scratchB);writeDQ(scratchB,p.real.value,p.dual.value,b*4);}}},dispose(){if(disposed)return;for(const {mesh,original,adapted,depth,distance,adaptedDepth,adaptedDistance,frustumCulled} of bindings){if(mesh.material===adapted)mesh.material=original;if(mesh.customDepthMaterial===adaptedDepth)mesh.customDepthMaterial=depth;if(mesh.customDistanceMaterial===adaptedDistance)mesh.customDistanceMaterial=distance;mesh.frustumCulled=frustumCulled;for(const m of [...(Array.isArray(adapted)?adapted:[adapted]),adaptedDepth,adaptedDistance])m?.dispose();}disposed=true;}};
}

function writeDQ(e, real, dual, offset) {
  if(e.length!==16||!finiteMatrix(e))throw Error('Tank skin matrix must be finite');
  const a=e[0],b=e[4],c=e[8],d=e[1],f=e[5],g=e[9],h=e[2],i=e[6],j=e[10];
  for(let x=0;x<3;x++)for(let y=0;y<3;y++){
   let dot=0;for(let k=0;k<3;k++)dot+=e[x*4+k]*e[y*4+k];
   if(Math.abs(dot-(x===y?1:0))>1e-4)throw Error('Tank DQ requires rigid skin matrices');
  }
  if(a*(f*j-g*i)-b*(d*j-g*h)+c*(d*i-f*h)<0)throw Error('Tank DQ rejects reflections');
  let x,y,z,w,s;const tr=a+f+j;
  if(tr>0){s=2*Math.sqrt(tr+1);w=s/4;x=(i-g)/s;y=(c-h)/s;z=(d-b)/s;}
  else if(a>f&&a>j){s=2*Math.sqrt(1+a-f-j);w=(i-g)/s;x=s/4;y=(b+d)/s;z=(c+h)/s;}
  else if(f>j){s=2*Math.sqrt(1+f-a-j);w=(c-h)/s;x=(b+d)/s;y=s/4;z=(g+i)/s;}
  else{s=2*Math.sqrt(1+j-a-f);w=(d-b)/s;x=(c+h)/s;y=(g+i)/s;z=s/4;}
  const n=Math.hypot(x,y,z,w);x/=n;y/=n;z/=n;w/=n;
  const tx=e[12],ty=e[13],tz=e[14];
  real[offset]=x;real[offset+1]=y;real[offset+2]=z;real[offset+3]=w;
  dual[offset]=(tx*w+ty*z-tz*y)/2;dual[offset+1]=(-tx*z+ty*w+tz*x)/2;dual[offset+2]=(tx*y-ty*x+tz*w)/2;dual[offset+3]=(-tx*x-ty*y-tz*z)/2;
}
function finiteMatrix(e){for(let i=0;i<16;i++)if(!Number.isFinite(e[i]))return false;return true;}
function multiplyInto(a,b,offset,out){out.fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[offset+c*4+k];}
