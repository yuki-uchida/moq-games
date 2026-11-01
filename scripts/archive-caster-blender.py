"""Import final, byte-preserving GLB derivatives for editable Blender review.
The procedural source is refine-caster-motions.mjs; imported sources are explicitly
reconstructed from runtime GLBs, not the unavailable original production scenes.
blender -b -t 2 --python scripts/archive-caster-blender.py
"""
from pathlib import Path
import bpy,json
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'scripts/caster-v3-provenance.json').read_text())
for record in manifest:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(root/record['output']))
 report={'role':record['role'],'blender':bpy.app.version_string,'objects':[{ 'name':o.name,'type':o.type,'bones':len(o.data.bones) if o.type=='ARMATURE' else None,'vertices':len(o.data.vertices) if o.type=='MESH' else None}for o in bpy.context.scene.objects],'actions':[{'name':a.name,'range':list(a.frame_range)}for a in bpy.data.actions]}
 out=root/'local-assets/caster-v3'/record['role'];out.mkdir(parents=True,exist_ok=True)
 (out/'blender-inventory.json').write_text(json.dumps(report,indent=2))
 bpy.ops.file.pack_all()
 bpy.ops.wm.save_as_mainfile(filepath=str(out/(record['role']+'-v3-review.blend')))
 print('SAVED',record['role'],flush=True)
