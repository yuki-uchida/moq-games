"""Blender 5.2: author spring-loaded double punch, preserving imported rig."""
import bpy, math, os
from mathutils import Vector,Quaternion
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'local/patchling');os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'public/tower-defense-art/models/clockworkPatchling/clockwork-patchling-animated.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=0;scene.frame_end=36
# Original clips remain in the preserved GLB. Only the new attack is exported here.
rig.animation_data_clear()
a=bpy.data.actions.new('spring_punch');rig.animation_data_create();rig.animation_data.action=a
for p in rig.pose.bones:p.rotation_mode='QUATERNION'
def orient(name,direction):
 p=rig.pose.bones[name]; rest=p.bone.matrix_local.to_quaternion()
 world=Vector(p.bone.tail_local-p.bone.head_local).rotation_difference(Vector(direction))
 # Parent body tilt is composed separately by the rig hierarchy.
 bpy.context.view_layer.update()
 parent_delta=p.parent.matrix.to_quaternion()@p.parent.bone.matrix_local.to_quaternion().inverted() if p.parent else Quaternion()
 p.rotation_quaternion=rest.inverted()@parent_delta.inverted()@world@rest
# t, upper-arm forward amount, forearm forward amount, body tilt degrees
poses=[(0,0,0,0),(0.18,-.18,.18,-4),(0.48,-.50,.65,-12),(0.68,-.50,.85,-14),(0.80,1,1,13),(0.87,.90,1,16),(0.97,.60,.85,6),(1.2,0,0,0)]
for t,u,f,lean in poses:
 for p in rig.pose.bones:p.rotation_quaternion=Quaternion();p.location=(0,0,0);p.scale=(1,1,1)
 p=rig.pose.bones['body'];rest=p.bone.matrix_local.to_quaternion();p.rotation_quaternion=rest.inverted()@Quaternion((1,0,0),math.radians(lean))@rest
 for side,sgn in [('L',1),('R',-1)]:
  # Broad paired gauntlets cock beside the chest, then shoot toward the target.
  orient('upper_arm.'+side,(sgn*(.18-.15*max(u,0)),-u*.92,-.25+.25*max(u,0)))
  orient('forearm.'+side,(-sgn*.05,-f*.9,-.22+.50*f if u<0 else -.22+.22*f))
 for p in rig.pose.bones:
  p.keyframe_insert(data_path='rotation_quaternion',frame=t*30,group=p.name)
for layer in a.layers:
 for strip in layer.strips:
  for bag in strip.channelbags:
   for fc in bag.fcurves:
    for k in fc.keyframe_points:k.interpolation='LINEAR'
# Rendering camera uses source front (-Y), a shallow elevated game-like orthographic view.
scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100
scene.world.color=(.25,.25,.25)
scene.view_settings.view_transform='Standard'
def camera(name,pos):
 d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.95))-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=2.7;return o
cam=camera('ReviewCamera',(3,-6,4));scene.camera=cam
for name,pos,power,size in [('Key',(2,-4,5),450,4),('Fill',(-3,-1,3),220,3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'spring-punch-v2.blend'))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in scene.objects:
 if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'attack-export.glb'),use_selection=True,export_format='GLB',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_force_sampling=True)
for label,pos in [('front',(0,-6,3)),('side',(6,0,3)),('game',(3,-6,4)),('back',(0,6,3))]:
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler()
 for f in [0,14,20,24,26,30,36]:
  scene.frame_set(f);scene.render.filepath=os.path.join(OUT,f'{label}-{f:02}.png');bpy.ops.render.render(write_still=True)
