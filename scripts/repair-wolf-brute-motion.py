"""Blender 5.2: rebuild only wolf walk and brute walk/attack, preserving GLB mesh data.
Run from repo: Blender --background --python-exit-code 1 --python scripts/repair-wolf-brute-motion.py
Inputs are preserved under local-assets/locomotion-repair/*-original.glb.
The original runtime files must be copied there before the first run; never replace them.
"""
import bpy, json, math, struct, hashlib, copy
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
R=Path.cwd(); D=R/'local-assets/locomotion-repair'; D.mkdir(parents=True,exist_ok=True)
C=Matrix.Rotation(math.pi/2,4,'X'); CI=C.inverted()
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def pivot(p,axis,a):return Matrix.Translation(p)@Matrix.Rotation(a,4,axis)@Matrix.Translation(-p)
def between(a,b,c,d):return Matrix.Translation(c)@(b-a).rotation_difference(d-c).to_matrix().to_4x4()@Matrix.Translation(-a)
def ik(h,t,l1,l2,pole):
 dv=t-h;d=dv.length
 if not abs(l1-l2)+.002<d<l1+l2-.002:raise ValueError(('unreachable',d,l1,l2))
 u=dv/d;v=Vector(pole)-u*Vector(pole).dot(u);v.normalize();a=(l1*l1+d*d-l2*l2)/(2*d)
 return h+u*a+v*math.sqrt(max(0,l1*l1-a*a))
def parse(p):
 b=p.read_bytes();size=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+size]),bytearray(b[28+size:])
def accessor(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];ty={5126:'f',5123:'H',5121:'B'}[a['componentType']];stride=v.get('byteStride',struct.calcsize(ty)*w);off=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [list(struct.unpack_from('<'+ty*w,b,off+k*stride)) for k in range(a['count'])]
def add(j,b,rows,kind):
 while len(b)%4:b.append(0)
 off=len(b);flat=[x for row in rows for x in row];b.extend(struct.pack('<'+'f'*len(flat),*flat));vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(flat)*4});ai=len(j['accessors']);a={'bufferView':vi,'componentType':5126,'count':len(rows),'type':kind}
 if kind=='SCALAR':a.update(min=[min(flat)],max=[max(flat)])
 j['accessors'].append(a);return ai
def write(j,b,p):
 j['buffers'][0]['byteLength']=len(b)
 while len(b)%4:b.append(0)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b)
def node_world(j):
 local={}
 for i,n in enumerate(j['nodes']):
  q=n.get('rotation',[0,0,0,1]);local[i]=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
 parent={c:i for i,n in enumerate(j['nodes'])for c in n.get('children',[])};world={}
 def get(i):
  if i not in world:world[i]=(get(parent[i]) if i in parent else Matrix.Identity(4))@local[i]
  return world[i]
 for i in local:get(i)
 return world,parent
report={}
for role,file in [('wolf','wolf-walk-smooth.glb'),('brute','brute-motion-v2-candidate.glb')]:
 src=D/(role+'-original.glb');expected={'wolf':'1f09cff307266152e3ca9ceca61336cd60aa8d5c1d1e99a1b3546cbba7af447c','brute':'430eaae56165fdf26671a937782dce2c7f5a473824d41ecb2025a679ef018950'}
 if hashlib.sha256(src.read_bytes()).hexdigest()!=expected[role]:raise ValueError('Unexpected source; preserve it and inspect before regeneration')
 j,b=parse(src);original=copy.deepcopy(j);original_bin=bytes(b);world,parent=node_world(j)
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(src))
 rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.animation_data_clear();rig.animation_data_create()
 rest={bn.name:bn.matrix_local.copy() for bn in rig.data.bones};heads={bn.name:bn.head_local.copy() for bn in rig.data.bones};indices={n['name']:i for i,n in enumerate(j['nodes']) if n.get('name') in rest}
 def setbone(n,m):rig.pose.bones[n].matrix=m@rest[n];bpy.context.view_layer.update()
 def clear():
  for pb in rig.pose.bones:pb.rotation_mode='QUATERNION';pb.matrix_basis=Matrix.Identity(4)
  bpy.context.view_layer.update()
 def leg(upper,lower,foot,rootM,target,pole):
  h,e,a=[heads[n] for n in [upper,lower,foot]];hh=rootM@h;ee=ik(hh,target,(e-h).length,(a-e).length,pole)
  setbone(upper,between(h,e,hh,ee));setbone(lower,between(e,a,ee,target));setbone(foot,Matrix.Translation(target-a))
 def path(u,span,stance,lift):
  if u<stance:return -span/2+span*u/stance,0
  t=(u-stance)/(1-stance)
  # Matching touchdown/liftoff speed and zero vertical velocity at both ends.
  v=span*(1-stance)/stance;h=t*t*t*(10-15*t+6*t*t)
  return span/2+v*t+(-span-v)*h,lift*math.sin(math.pi*t)**2
 def pose(motion,t):
  clear();ph=math.tau*t
  if role=='wolf':
   shift=Vector((.012*math.sin(ph),0,-.16+.016*math.cos(2*ph)))
   pm=Matrix.Translation(shift)@pivot(heads['pelvis'],'X',.018*math.sin(2*ph))@pivot(heads['pelvis'],'Y',.025*math.sin(ph));setbone('pelvis',pm)
   cm=pm@pivot(heads['chest'],'X',-.025*math.sin(2*ph));setbone('chest',cm)
   nm=cm@pivot(heads['neck'],'X',.025*math.sin(2*ph));setbone('neck',nm);setbone('head',nm)
   setbone('tail',pm@pivot(heads['tail'],'Z',.09*math.sin(ph-.5)))
   for k,offset in [('FL',0),('FR',.5),('HL',.5),('HR',0)]:
    # Both pelvic limbs use the same anatomical bend plane despite asymmetric rest rig.
    u=(t+offset)%1;travel,lift=path(u,.60,.45,.15)
    h=heads['upper.'+k];a=heads['paw.'+k]
    target=Vector((a.x,h.y+travel,a.z+lift))
    leg('upper.'+k,'lower.'+k,'paw.'+k,cm if k[0]=='F' else pm,target,(0,1 if k[0]=='F' else -1,0))
  else:
   if motion=='walk':
    shift=Vector((.026*math.sin(ph),0,-.080+.012*math.cos(2*ph)));pitch=.025*math.sin(ph);arm=.25*math.sin(ph);bend=.10
   else:
    # 660 ms authored impact; slow overhead load, fast slam, deliberate recovery.
    keys=[(0,0,0,0),(0.18,.2,-.02,-.04),(.48,1,-.06,-.10),(.55,1,-.06,-.10),(.66,.18,-.08,.12),(.74,.10,-.06,.10),(.95,0,-.02,.02),(1.2,0,0,0)]
    for a,z in zip(keys,keys[1:]):
     if a[0]<=t<=z[0]:
      f=smooth((t-a[0])/(z[0]-a[0]));load,down,pitch=[x+(y-x)*f for x,y in zip(a[1:],z[1:])];break
    shift=Vector((0,0,-.035+down));arm=-2.15*load-.55*smooth((t-.55)/.11)*(1-smooth((t-.74)/.46));bend=.2+.32*load
   pm=Matrix.Translation(shift)@pivot(heads['pelvis'],'Y',.025*math.sin(ph) if motion=='walk' else 0);setbone('pelvis',pm)
   cm=pm@pivot(heads['chest'],'X',pitch);setbone('chest',cm);setbone('head',cm@pivot(heads['head'],'X',-pitch*.5))
   for side,offset in [('L',0),('R',.5)]:
    a=heads['foot.'+side];h=heads['thigh.'+side]
    travel,lift=path((t+offset)%1,.30,.54,.07) if motion=='walk' else (0,0)
    target=Vector((a.x,a.y+travel,a.z+lift));leg('thigh.'+side,'shin.'+side,'foot.'+side,pm,target,(0,-1,0))
    angle=arm*(1 if side=='L' else -1) if motion=='walk' else arm
    um=cm@pivot(heads['upper.'+side],'X',angle);setbone('upper.'+side,um)
    fm=um@pivot(heads['fore.'+side],'X',-bend);setbone('fore.'+side,fm);setbone('hand.'+side,fm)
 if role=='wolf':
  joints=j['skins'][0]['joints'];names=[j['nodes'][i]['name'] for i in joints]
  def reweight(p,weights):
   choices=[]
   for k in ['FL','FR','HL','HR']:
    h=heads['upper.'+k];e=heads['lower.'+k]
    if not e.z-.04<p.z<h.z:continue
    f=max(0,min(1,(p.z-h.z)/(e.z-h.z)));center=h.lerp(e,f);radius=.19 if k[0]=='F' else .21
    dist=math.hypot(p.x-center.x,p.y-center.y)
    desired=.92*smooth((h.z-p.z)/.17)*smooth((radius-dist)/(radius*.55))
    choices.append((desired,'upper.'+k,'chest' if k[0]=='F' else 'pelvis'))
   if not choices:return weights
   desired,upper,donor=max(choices);take=min(weights.get(donor,0),max(0,desired-weights.get(upper,0)))
   if take<.0001:return weights
   weights[donor]-=take;weights[upper]=weights.get(upper,0)+take
   out=sorted(weights.items(),key=lambda x:x[1],reverse=True)[:4];total=sum(w for n,w in out)
   return {n:w/total for n,w in out}
  changed=0
  for mesh in j['meshes']:
   for primitive in mesh['primitives']:
    attrs=primitive['attributes']
    if 'JOINTS_0' not in attrs:continue
    positions=accessor(j,b,attrs['POSITION']);js=accessor(j,b,attrs['JOINTS_0']);ws=accessor(j,b,attrs['WEIGHTS_0']);newj=[];neww=[]
    for p,ji,we in zip(positions,js,ws):
     weights={names[n]:w for n,w in zip(ji,we) if w>0};new=reweight(Vector((p[0],-p[2],p[1])),dict(weights));changed+=new!=weights
     pairs=list(new.items());pairs+=[('root',0)]*(4-len(pairs));newj.append([names.index(n) for n,w in pairs]);neww.append([w for n,w in pairs])
    # Append unsigned-short joints; all original data bytes remain recoverable.
    while len(b)%4:b.append(0)
    off=len(b);flat=[n for row in newj for n in row];b.extend(struct.pack('<'+'H'*len(flat),*flat));vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(flat)*2});ai=len(j['accessors']);j['accessors'].append({'bufferView':vi,'componentType':5123,'count':len(newj),'type':'VEC4'});attrs['JOINTS_0']=ai;attrs['WEIGHTS_0']=add(j,b,neww,'VEC4')
  for ob in bpy.data.objects:
   if ob.type!='MESH' or not ob.vertex_groups:continue
   for vertex in ob.data.vertices:
    old={ob.vertex_groups[g.group].name:g.weight for g in vertex.groups};new=reweight(vertex.co,dict(old))
    if new==old:continue
    for group in ob.vertex_groups:group.remove([vertex.index])
    for n,w in new.items():
     if w>0:ob.vertex_groups[n].add([vertex.index],w,'REPLACE')
  report['wolfWeights']={'verticesChanged':changed,'maxInfluences':4,'purpose':'extend proximal leg influence into chest/pelvis transition'}
 for motion,duration in ([('walk',1)] if role=='wolf' else [('walk',1),('attack',1.2)]):
  rig.animation_data.action=None;times=sorted(set([i/120 for i in range(round(duration*120)+1)]+([.66] if motion=='attack' else [])));values={i:{'translation':[],'rotation':[],'scale':[]} for i in indices.values()};last={}
  for t in times:
   pose(motion,t if t<duration or motion=='attack' else 0)
   posed={i:CI@(rig.pose.bones[n].matrix@rest[n].inverted())@C@world[i] for n,i in indices.items()}
   for n,i in indices.items():
    par=parent.get(i);m=(posed.get(par,world[par]).inverted() if par is not None else Matrix.Identity(4))@posed[i];p,q,s=m.decompose()
    if i in last and q.dot(last[i])<0:q.negate()
    last[i]=q.copy();values[i]['translation'].append(list(p));values[i]['rotation'].append([q.x,q.y,q.z,q.w]);values[i]['scale'].append(list(s))
   for pb in rig.pose.bones:
    for fld in ['location','rotation_quaternion','scale']:pb.keyframe_insert(fld,frame=1+t*120)
  bpy.context.scene.render.fps=120;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=1+round(duration*120);rig.animation_data.action.name=role+'-'+motion+'-proximal-v1'
  bpy.ops.wm.save_as_mainfile(filepath=str(D/f'{role}-{motion}-v1.blend'),compress=True)
  anim=next(a for a in j['animations'] if a['name']==motion);anim.setdefault('extras',{})['proximalMotionVersion']=1;removed=set(indices.values());anim['channels']=[c for c in anim['channels'] if c['target']['node'] not in removed]
  ti=add(j,b,[[t] for t in times],'SCALAR')
  for i,fields in values.items():
   for field,rows in fields.items():
    # Constant local translations/scales are restored exactly to bind values.
    if field in ['translation','scale'] and i!=indices['pelvis']:rows=[j['nodes'][i].get(field,[0,0,0] if field=='translation' else [1,1,1])]*len(times)
    ai=add(j,b,rows,'VEC4' if field=='rotation' else 'VEC3');si=len(anim['samplers']);anim['samplers'].append({'input':ti,'output':ai,'interpolation':'LINEAR'});anim['channels'].append({'sampler':si,'target':{'node':i,'path':field}})
  report[role+'/'+motion]={'samples':len(times),'duration':duration,'jointScales':'bind exact','localTranslations':'bind exact except pelvis weight shift'}
 # Original topology/materials/morphs/bind and unused animation bytes are retained.
 out=R/'public/tower-defense-art/models'/role/file;write(j,b,out)
 report[role]={'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'originalBinaryPrefixPreserved':bytes(b[:len(original_bin)])==original_bin,'nodesPreserved':j['nodes']==original['nodes'],'skinsPreserved':j['skins']==original['skins'],'meshesPreserved':j['meshes']==original['meshes']}
(D/'generation-report.json').write_text(json.dumps(report,indent=2))
