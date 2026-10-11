"""Export the approved Runner spear+10% packed scenes, without modifying them.

Usage: blender -b -t 2 --python scripts/export-runner-model.py -- --source-dir ../real3d-inputs/runner-source/attempt-01
The derivative uses exact source geometry/weights, dense evaluated rig/control
samples, authored blink morphs, and a source-graph-compiled material adapter.
No gameplay clocks or source files are changed.
"""
import argparse, hashlib, json, math, struct, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix

REPO = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--source-dir',type=Path,required=True)
parser.add_argument('--output-dir',type=Path,default=REPO/'public/tower-defense-art/models/runner')
parser.add_argument('--evidence-dir',type=Path,default=REPO/'.generated/runner-model-evidence')
parser.add_argument('--motion',choices=['idle','walk','attack','all'],default='all')
parser.add_argument('--validate',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ASSETS=args.output_dir.resolve(); ASSETS.mkdir(parents=True,exist_ok=True)
OUT=args.evidence_dir.resolve(); OUT.mkdir(parents=True,exist_ok=True)
SPECS={
 'idle':('runner-spear-length-idle-walk-v1.blend','83e6039dcabc7740652095d3b348d1b248f1a766b1c4fbe128c1b1c0830083e1',1,73,3.0),
 'walk':('runner-spear-length-idle-walk-v1.blend','83e6039dcabc7740652095d3b348d1b248f1a766b1c4fbe128c1b1c0830083e1',101,125,1.0),
 'attack':('runner-spear-length-attack-v1.blend','83bd1677fe8e5ca9dd39ab0f327c5704f006ce8fc4ddb54e8521b84fa9f59f28',1,41,.64),
}
ADAPTERS=REPO/'examples/games/tower_diffence_with_jev/src/rendering/models/adapters'

def extract_graph(mat):
 graph={'nodes':[],'links':[]}
 for n in mat.node_tree.nodes:
  graph['nodes'].append({'name':n.name,'type':n.type,'operation':getattr(n,'operation',None),'use_clamp':getattr(n,'use_clamp',False),'blend_type':getattr(n,'blend_type',None),'attribute_name':getattr(n,'attribute_name',None),'inputs':[list(i.default_value) if hasattr(i.default_value,'__len__') else i.default_value for i in n.inputs if hasattr(i,'default_value')],'outputs':[list(i.default_value) if hasattr(i.default_value,'__len__') else i.default_value for i in n.outputs if hasattr(i,'default_value')]})
 for l in mat.node_tree.links:graph['links'].append([l.from_node.name,list(l.from_node.outputs).index(l.from_socket),l.to_node.name,list(l.to_node.inputs).index(l.to_socket)])
 return graph

def compile_adapter(graph):
 # The graph compiler is role-independent; all arithmetic/constants below come
 # from Runner_Blink_Surface, never another role's generated material.
 nodes={n['name']:n for n in graph['nodes']};links={(c,d):(a,b) for a,b,c,d in graph['links']}
 def val(x):return 'vec3('+', '.join(val(v) for v in x[:3])+')' if isinstance(x,list) else repr(float(x))
 class Compiler:
  def __init__(self,bindings=None):self.lines=[];self.done=dict(bindings or {});self.emitted=[]
  def socket(self,name,i):return self.expr(*links[name,i]) if (name,i) in links else val(nodes[name]['inputs'][i])
  def expr(self,name,i=0):
   if (name,i) in self.done:return self.done[name,i]
   n=nodes[name];t=n['type'];dtype='float'
   if t=='ATTRIBUTE':
    assert n['attribute_name']=='BlinkRestPosition' and i==1;return 'runnerRest'
   if t=='SEPXYZ':return '('+self.socket(name,0)+').'+'xyz'[i]
   if t=='VALUE':assert name=='BlinkAmount';return 'runnerBlink'
   if t=='MIX_RGB':
    assert n['blend_type']=='MIX';dtype='vec3';code=f'mix({self.socket(name,1)}, {self.socket(name,2)}, clamp({self.socket(name,0)}, 0.0, 1.0))'
   elif t=='MATH':
    a=self.socket(name,0);b=self.socket(name,1);op=n['operation']
    if op in ['ADD','SUBTRACT','MULTIPLY']:code=f'(({a}) {dict(ADD="+",SUBTRACT="-",MULTIPLY="*")[op]} ({b}))'
    elif op=='DIVIDE':code=f'(({b}) == 0.0 ? 0.0 : ({a}) / ({b}))'
    elif op in ['LESS_THAN','GREATER_THAN']:code=f'(({a}) {"<" if op=="LESS_THAN" else ">"} ({b}) ? 1.0 : 0.0)'
    elif op=='MINIMUM':code=f'min({a}, {b})'
    elif op=='MAXIMUM':code=f'max({a}, {b})'
    elif op=='SQRT':code=f'sqrt(max({a}, 0.0))'
    elif op=='ABSOLUTE':code=f'abs({a})'
    else:raise ValueError((name,op))
   else:raise ValueError((name,t))
   if n.get('use_clamp'):code=f'clamp({code}, 0.0, 1.0)'
   var='runnerN'+str(len(self.lines));self.lines.append(f'  {dtype} {var} = {code}; // {name}');self.emitted.append(name);self.done[name,i]=var;return var
 c=Compiler();cover=c.expr('Math.142');line=c.expr('Math.167')
 blink='RunnerBlinkData runnerEvaluateBlink(vec3 runnerRest, float runnerBlink) {\n'+'\n'.join(c.lines)+f'\n  return RunnerBlinkData(vec2({cover}, {line}));\n}}'
 bindings={('Math.142',0):'blinkData.masks.x',('Math.167',0):'blinkData.masks.y'}
 compilers=[c]
 def fn(name,signature,dtype,source,extra=None):
  compiler=Compiler({**bindings,**(extra or {})});value=compiler.expr(*source) if isinstance(source,tuple) else val(source);compilers.append(compiler)
  return dtype+' '+name+'('+signature+') {\n'+'\n'.join(compiler.lines)+f'\n  return {value};\n}}'
 functions=[blink,
 fn('runnerApplyBaseColor','vec3 textureBaseColor, RunnerBlinkData blinkData','vec3',links['Principled BSDF',0],{('Image Texture',0):'textureBaseColor'}),
 fn('runnerApplyRoughness','float textureRoughness, RunnerBlinkData blinkData','float',links['Principled BSDF',2],{('Separate Color',1):'textureRoughness'}),
 fn('runnerNormalStrength','RunnerBlinkData blinkData','float',links['Normal Map',0]),
 fn('runnerSpecularIORLevel','RunnerBlinkData blinkData','float',links.get(('Principled BSDF',13),nodes['Principled BSDF']['inputs'][13])),
 fn('runnerApplySurfaceNormal','vec3 mappedNormal, vec3 geometryTrueNormal, RunnerBlinkData blinkData','vec3',links['Principled BSDF',5],{('Normal Map',0):'mappedNormal'})]
 emitted=set(n for c in compilers for n in c.emitted);arithmetic={n['name'] for n in graph['nodes'] if n['type'] in ['MATH','MIX_RGB']};assert emitted==arithmetic
 glsl='// Compiled exactly from the approved Runner_Blink_Surface. Blender rest coordinates.\nstruct RunnerBlinkData { vec2 masks; };\nvec3 runnerSafeNormalize(vec3 v) { float m = length(v); return m > 0.0 ? v / m : vec3(0.0); }\n'+'\n'.join(functions)
 # Reuse the already-verified generic Three material lifecycle/shader boundary.
 template=(ADAPTERS/'source/ranger-material-adapter.js').read_text().split('export const rangerSourceIOR = ',1)[1]
 template=template[template.index(';')+1:]
 template=template.replace('Ranger','Runner').replace('ranger','runner')
 ior=nodes['Principled BSDF']['inputs'][3]
 (ADAPTERS/'RunnerMaterial.js').write_text('// Generated by scripts/export-runner-model.py from the approved Runner graph.\nexport const runnerBlinkGLSL = `'+glsl+'`;\nexport const runnerSourceIOR = '+str(ior)+';\n'+template)
 (OUT/'runner-blink-graph.json').write_text(json.dumps(graph,indent=2))
 (OUT/'runner-blink.glsl').write_text(glsl)
 (OUT/'runner-shader-generation.json').write_text(json.dumps({'sourceArithmeticNodes':len(arithmetic),'compiledArithmeticNodes':len(emitted),'allArithmeticNodesCovered':True,'sourceIOR':ior},indent=2))

def load_glb(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),bytearray(raw[28+n:])

def patch_export(rawpath,motion,samples,duration,source_sha):
 j,data=load_glb(rawpath)
 def read(ai):
  a=j['accessors'][ai];v=j['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];return np.frombuffer(data,dtype='<f4',count=a['count']*dim,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).copy().reshape(-1,dim)
 # Sampling was uniform at Blender FPS 192. Replace only animation time axes;
 # all pose, morph, geometry, weight and texture bytes remain unchanged.
 a=j['animations'][0];a['name']=motion;times=np.linspace(0,duration,len(samples),dtype='<f4');inputs={sm['input'] for sm in a['samplers']}
 for ai in inputs:
  ts=read(ai).ravel();assert len(ts)==len(samples),(motion,len(ts),len(samples));acc=j['accessors'][ai];v=j['bufferViews'][acc['bufferView']];off=v.get('byteOffset',0)+acc.get('byteOffset',0);data[off:off+times.nbytes]=times.tobytes();acc.update(min=[0.0],max=[duration])
 a['extras']={'durationMs':duration*1000,'sourceFrameRange':[samples[0]['frame'],samples[-1]['frame']],'blinkAmountSamples':[[float(t),s['blinkAmount']] for t,s in zip(times,samples)],'sourceSHA256':source_sha}
 if motion=='attack':a['extras']['hitMs']=320
 j['animations']=[a]
 # Packed authored custom object notes are irrelevant runtime data. Keep only
 # animation extras above; originals and audit evidence remain in source archive.
 for collection in ['nodes','meshes','materials']:
  for item in j.get(collection,[]):item.pop('extras',None)
 j.pop('extras',None)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*(-len(js)%4);data+=b'\0'*(-len(data)%4);out=ASSETS/f'runner-{motion}-current.glb';out.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data)
 return {'file':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'durationMs':duration*1000,'sampleCount':len(samples),'sourceSHA256':source_sha,'meshCount':len(j['meshes']),'jointCount':len(j['skins'][0]['joints'])}

def export(motion):
 filename,sha,start,end,duration=SPECS[motion];source=args.source_dir/filename;assert hashlib.sha256(source.read_bytes()).hexdigest()==sha
 bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False);sc=bpy.context.scene;rig=bpy.data.objects['Runner_Rig'];body=bpy.data.objects['Runner_Body_Original_Repaired'];mat=bpy.data.materials.get('Runner_Blink_Surface');controls=[bpy.data.objects['Spear_Rigid_Control']]
 if mat:compile_adapter(extract_graph(mat))
 meshes=[o for o in sc.objects if o.type=='MESH'];morphs=[o for o in meshes if o.data.shape_keys];samples=[]
 for o in meshes:
  assert max((len([g for g in v.groups if g.weight>0]) for v in o.data.vertices),default=0)<=4
  assert not any(m.type=='ARMATURE' and m.use_deform_preserve_volume for m in o.modifiers)
 for f in np.linspace(start,end,(end-start)*8+1):
  sc.frame_set(math.floor(f),subframe=f%1);deps=bpy.context.evaluated_depsgraph_get();er=rig.evaluated_get(deps);poses={}
  for p in er.pose.bones:
   kw={'parent_matrix':p.parent.matrix,'parent_matrix_local':p.parent.bone.matrix_local} if p.parent else {};poses[p.name]=[list(v) for v in p.bone.convert_local_to_pose(p.matrix,p.bone.matrix_local,invert=True,**kw)]
  samples.append({'frame':float(f),'bones':poses,'controls':{o.name:[list(v) for v in o.evaluated_get(deps).matrix_basis] for o in controls},'morphs':{o.name:{k.name:k.value for k in list(o.data.shape_keys.key_blocks)[1:]} for o in morphs},'blinkAmount':mat.node_tree.nodes['BlinkAmount'].outputs[0].default_value if mat else 0})
 for o in [rig,*controls]:
  o.animation_data_clear()
  for c in list(o.constraints):o.constraints.remove(c)
 for p in rig.pose.bones:
  for c in list(p.constraints):p.constraints.remove(c)
 for o in morphs:o.data.shape_keys.animation_data_clear()
 for o in meshes:
  attr=o.data.attributes.get('BlinkRestPosition')
  if attr:attr.name='_BLINKRESTPOSITION'
 if mat:
  nt=mat.node_tree;n=nt.nodes;nt.links.new(n['Image Texture'].outputs['Color'],n['Principled BSDF'].inputs['Base Color']);nt.links.new(n['Separate Color'].outputs['Green'],n['Principled BSDF'].inputs['Roughness'])
  for l in list(n['Normal Map'].inputs['Strength'].links):nt.links.remove(l)
  n['Normal Map'].inputs['Strength'].default_value=1
 for idx,sample in enumerate(samples):
  frame=idx+1
  for name,values in sample['bones'].items():
   p=rig.pose.bones[name];p.rotation_mode='QUATERNION';p.matrix_basis=Matrix(values)
   for path in ['location','rotation_quaternion','scale']:p.keyframe_insert(path,frame=frame)
  for o in controls:
   o.rotation_mode='QUATERNION';o.matrix_basis=Matrix(sample['controls'][o.name])
   for path in ['location','rotation_quaternion','scale']:o.keyframe_insert(path,frame=frame)
  for o in morphs:
   for name,value in sample['morphs'][o.name].items():
    k=o.data.shape_keys.key_blocks[name];k.value=value;k.keyframe_insert('value',frame=frame)
 for o in [rig,*controls,*[o.data.shape_keys for o in morphs]]:
  action=o.animation_data.action
  for fc in action.fcurves:
   for key in fc.keyframe_points:key.interpolation='LINEAR'
  groups={}
  for fc in action.fcurves:
   if fc.data_path.endswith('rotation_quaternion'):groups.setdefault(fc.data_path,{})[fc.array_index]=fc
  for qs in groups.values():
   prev=None
   for i in range(len(qs[0].keyframe_points)):
    q=[qs[k].keyframe_points[i].co.y for k in range(4)]
    if prev and sum(x*y for x,y in zip(q,prev))<0:
     q=[-v for v in q]
     for k in range(4):qs[k].keyframe_points[i].co.y=q[k]
    prev=q
 sc.frame_start=1;sc.frame_end=len(samples);sc.render.fps=192;sc.render.fps_base=1;sc.frame_set(1)
 bpy.ops.object.select_all(action='DESELECT')
 for o in [rig,*controls,*meshes]:o.select_set(True)
 raw=OUT/f'runner-{motion}-raw.glb'
 bpy.ops.export_scene.gltf(filepath=str(raw),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='SCENE',export_anim_scene_split_object=False,export_frame_range=True,export_anim_slide_to_zero=True,export_force_sampling=True,export_optimize_animation_size=False,export_morph=True,export_morph_animation=True,export_all_influences=True,export_extras=False,export_attributes=True)
 result=patch_export(raw,motion,samples,duration,sha)
 (OUT/f'{motion}-source-samples.json').write_text(json.dumps(samples))
 assert hashlib.sha256(source.read_bytes()).hexdigest()==sha
 print('EXPORTED',json.dumps(result),flush=True);return result

motions=list(SPECS) if args.motion=='all' else [args.motion]
if not args.validate:
 results=[export(m) for m in motions]
 (OUT/'export-manifest.json').write_text(json.dumps({'models':results,'nativeCamera':{'orthoScale':3.88,'rootPivotBlender':[-.05999999865889549,.20000000298023224,-.95166015625]},'catalog':{'scale':128/3.88,'origin':[-.05999999865889549,-.95166015625,-.20000000298023224],'yaw':0},'skinning':'Standard linear blend, exact source weights, maximum 3 influences; no DQ or extra influences required.','sourcePreserved':True,'attackClock':'Source 640ms/hit320ms. Gameplay timing is deliberately not edited by this exporter.'},indent=2))

if args.validate:
 from mathutils import Vector
 from scipy.spatial import cKDTree
 from PIL import Image, ImageDraw
 results=[];panels=[]
 def capture(sc,frame):
  sc.frame_set(math.floor(frame),subframe=frame%1);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();out={}
  for o in sc.objects:
   if o.type=='MESH' and not o.hide_render:
    e=o.evaluated_get(deps);me=e.to_mesh();used=sorted({i for face in me.polygons for i in face.vertices});out[o.name]=np.array([e.matrix_world@me.vertices[i].co for i in used]);e.to_mesh_clear()
  return out
 for motion in motions:
  filename,sha,start,end,duration=SPECS[motion];source=args.source_dir/filename
  assert hashlib.sha256(source.read_bytes()).hexdigest()==sha
  bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False);sc=bpy.context.scene
  sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=16;sc.cycles.use_denoising=False;sc.render.resolution_x=384;sc.render.resolution_y=336;sc.render.resolution_percentage=100;sc.render.threads_mode='FIXED';sc.render.threads=2;sc.render.film_transparent=True
  sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA'
  target=Vector((-.05999999865889549,.20000000298023224,.2889472246170044));sc.camera.data.ortho_scale=3.88
  samples=json.loads((OUT/f'{motion}-source-samples.json').read_text());blinkframe=max(samples,key=lambda x:x['blinkAmount'])['frame']
  frames=sorted(set([float(f) for f in range(start,end+1)]+[start+.0625+(end-start)*i/10 for i in range(10)]+[blinkframe]))
  originals=[capture(sc,f) for f in frames]
  keys={'idle':[start,blinkframe],'walk':[start+6,start+18],'attack':[start,start+20]}[motion]
  renderkeys=[(f,d) for f in keys for d in ['e','se']]
  def render(frame,direction,path):
   sc.frame_set(math.floor(frame),subframe=frame%1);bpy.context.view_layer.update();offset=Vector((-5,0,2) if direction=='e' else (-1.740776538848877,-4.6871843338012695,2));sc.camera.location=target+offset;sc.camera.rotation_euler=(target-sc.camera.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(path);bpy.ops.render.render(write_still=True)
  for i,(frame,d) in enumerate(renderkeys):render(frame,d,OUT/f'{motion}-source-{i}.png')
  mat=bpy.data.materials.get('Runner_Blink_Surface');retained=mat.copy() if mat else None
  if retained:
   retained.name='Runner verification source graph';retained.node_tree.animation_data_clear()
  for o in list(sc.objects):
   if o.type in ['MESH','ARMATURE','EMPTY','CURVE']:bpy.data.objects.remove(o,do_unlink=True)
  for collection in [bpy.data.meshes,bpy.data.armatures,bpy.data.materials]:
   for d in list(collection):
    if d.users==0 and d!=retained:collection.remove(d)
  sc.render.fps=192;sc.render.fps_base=1
  bpy.ops.import_scene.gltf(filepath=str(ASSETS/f'runner-{motion}-current.glb'))
  if retained:
   retained.node_tree.nodes['Attribute'].attribute_name='_BLINKRESTPOSITION'
   for o in sc.objects:
    if o.type=='MESH':
     for slot in o.material_slots:
      if slot.material and slot.material.name.startswith('Runner_Blink_Surface'):slot.material=retained
  for o in sc.objects:
   for owner in [o]+([o.data.shape_keys] if o.type=='MESH' and o.data.shape_keys else []):
    ad=owner.animation_data
    if not ad:continue
    for tr in ad.nla_tracks:
     tr.mute=True
     if tr.name==motion:ad.action=tr.strips[0].action
  rows=[]
  def update_blink(frame):
   if retained:retained.node_tree.nodes['BlinkAmount'].outputs[0].default_value=float(np.interp(frame,[s['frame'] for s in samples],[s['blinkAmount'] for s in samples]))
  for f,orig in zip(frames,originals):
   update_blink(f);seconds=(f-start)/(end-start)*duration;imported=capture(sc,seconds*192);row={'sourceFrame':f,'seconds':seconds,'meshes':{}}
   for name,points in orig.items():
    candidate=imported.get(name)
    if candidate is None:
     mapping={'Runner_Body_Original_Repaired':'Mesh_0','Runner_Gripping_Hand_L':'Mesh_0.002','Runner_Gripping_Hand_R':'Mesh_0.003','Spear_Rigid':'Mesh_0.001'};candidate=imported.get(mapping[name])
    assert candidate is not None,(name,list(imported))
    err=cKDTree(candidate).query(points)[0];reverse=cKDTree(points).query(candidate)[0];row['meshes'][name]={'maxError':float(max(err.max(),reverse.max())),'meanError':float(err.mean()),'sourceVertices':len(points),'importedVertices':len(candidate)}
   rows.append(row)
  for i,(f,d) in enumerate(renderkeys):
   update_blink(f);render((f-start)/(end-start)*duration*192,d,OUT/f'{motion}-imported-{i}.png');panels.append((motion,f,d,OUT/f'{motion}-source-{i}.png',OUT/f'{motion}-imported-{i}.png'))
  maximum=max(v['maxError'] for row in rows for v in row['meshes'].values());result={'motion':motion,'sampleCount':len(frames),'maximumGeometryError':maximum,'rows':rows};results.append(result);(OUT/f'{motion}-geometry-validation.json').write_text(json.dumps(result,indent=2));print('VALIDATED',motion,maximum,flush=True)
 # Source/source-graph reconstructed GLB renders share identical camera/light
 # settings. This verifies glTF material transport; Three BRDF still differs.
 sheet=Image.new('RGB',(768,len(panels)*360),(30,30,30));draw=ImageDraw.Draw(sheet);pixels=[]
 for i,(motion,f,d,source,imp) in enumerate(panels):
  aa=np.array(Image.open(source).convert('RGBA')).astype(float);bb=np.array(Image.open(imp).convert('RGBA')).astype(float);mask=np.maximum(aa[:,:,3],bb[:,:,3])>8
  pixels.append({'motion':motion,'sourceFrame':f,'direction':d,'maskedMeanAbsoluteError':float(abs(aa-bb)[mask].mean()),'alphaMeanAbsoluteError':float(abs(aa[:,:,3]-bb[:,:,3]).mean())})
  draw.text((8,i*360+4),f'{motion}, source frame {f}, {d}: approved source | GLB reimport + exact source lid graph',fill='white')
  for x,path in [(0,source),(384,imp)]:
   im=Image.open(path).convert('RGBA');sheet.paste(im,(x,i*360+24),im)
 sheet.save(OUT/'runner-source-glb-comparison.png')
 (OUT/'validation-summary.json').write_text(json.dumps({'geometry':[{'motion':r['motion'],'samples':r['sampleCount'],'maxError':r['maximumGeometryError']} for r in results],'renderComparisons':pixels,'allMeshesPreserved':True,'originalSourceHashesUnchanged':all(hashlib.sha256((args.source_dir/s[0]).read_bytes()).hexdigest()==s[1] for s in SPECS.values()),'limitations':['GLB material reimport checked with exact reconstructed Blender eyelid graph; runtime Three material uses the separately generated shader.','Three/browser visual parity is not established by Blender renders. Lighting/BRDF can differ.','Dense source pose samples interpolate between 1/8 authoring-frame boundaries; source curves themselves remain unchanged.']},indent=2))
