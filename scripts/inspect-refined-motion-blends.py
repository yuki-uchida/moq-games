"""Create inspectable Blender copies from the runtime candidates, never overwrite originals.
These are GLB reimports, not the missing original authoring scenes.
"""
import bpy,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'local-assets/refined-motions-v2/blender-reimports';out.mkdir(parents=True,exist_ok=True)
specs=[('archer','archer-walk-natural-v2.glb'),('runner','runner-walk-natural-v2.glb'),('tank','tank-walk-clearance-v2.glb'),('tank','tank-attack-candidate-combat-v2.glb'),('crystalSentinel','crystal-sentinel-combat-v2.glb'),('koboldLancer','amber-kobold-lancer-combat-v2.glb')]
reports=[]
for role,file in specs:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(root/'local-assets/refined-motions-v2/glb-candidates'/role/file))
 rigs=[o for o in bpy.data.objects if o.type=='ARMATURE']
 report={'role':role,'candidate':file,'blender':bpy.app.version_string,'sourceType':'reimported GLB derivative; original authoring blend unavailable','rigs':[{'name':o.name,'bones':[{'name':b.name,'length':b.length}for b in o.data.bones]}for o in rigs],'actions':[a.name for a in bpy.data.actions],'meshes':len([o for o in bpy.data.objects if o.type=='MESH'])}
 bpy.ops.wm.save_as_mainfile(filepath=str(out/(file+'.blend')))
 reports.append(report)
(out/'inventory.json').write_text(json.dumps(reports,indent=2))
