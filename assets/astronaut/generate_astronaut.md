```python
"""Build the Sol Check EVA suit in Blender 4.x/5.x without external assets.

Paste into Blender's Text Editor and click Run Script. The GLB is written
beside the saved .blend, the source .py, or in the home folder for an unsaved
text block. The command line also supports:

    blender -b --python generate_astronaut.py -- --output-dir ./assets --save-blend --render
"""
import argparse
from math import cos, pi, radians, sin, sqrt, tau
from pathlib import Path
import sys

import bpy
from mathutils import Euler, Matrix, Vector
import numpy as np


NAME = "Sol Check EVA"
BASENAME = "astronaut_sol_check"
GENERATED = "sol_check_generated"
FRONT = Vector((0, -1, 0))
UP = Vector((0, 0, 1))
HOTSPOTS = (
    ("Hotspot_Head", (-.038, 1.991), "Mind & Mood", "behavioral"),
    ("Hotspot_Visor", (0, 1.862), "Sleep & Circadian", "sleep"),
    ("Hotspot_Chest_Heart", (.103, 1.488), "Cardiovascular & Heart Rate", "cardiovascular"),
    ("Hotspot_Torso_Temp", (0, 1.296), "Core Body Temperature", "temperature"),
    ("Hotspot_Abdomen_Metabolic", (0, 1.116), "Blood Glucose & Nutrition", "metabolic"),
    ("Hotspot_Limbs_Symptoms", (.463, 1.176), "Systemic Fatigue & Symptoms", "symptoms"),
)


def linear(hex_color):
    rgb = (int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def weave_image():
    """Tileable tangent-space normal texture, packed into both deliverables."""
    n = 256
    u, v = np.meshgrid(np.arange(n) * tau / n, np.arange(n) * tau / n)
    warp = np.cos(24 * u) * (0.64 + 0.36 * np.cos(12 * u + 12 * v))
    weft = np.cos(24 * v) * (0.64 - 0.36 * np.cos(12 * u + 12 * v))
    h = warp + weft + 0.17 * np.sin(51 * u + 17 * v) * np.cos(43 * v - 11 * u)
    x = (np.roll(h, 1, 1) - np.roll(h, -1, 1)) * 0.27
    y = (np.roll(h, 1, 0) - np.roll(h, -1, 0)) * 0.27
    length = np.sqrt(x * x + y * y + 1)
    rgba = np.stack((0.5 + 0.5 * x / length, 0.5 + 0.5 * y / length,
                     0.5 + 0.5 / length, np.ones_like(x)), axis=-1)
    img = bpy.data.images.new("Ortho-fabric woven normal", n, n, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.pack()
    return img


def material(name, color, roughness, metallic=0, *, coat=0, sheen=0, emission=0, weave=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear(color), 1)
    mat.roughness = roughness
    mat.metallic = metallic
    if mat.node_tree is None:
        mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    values = {"Base Color": mat.diffuse_color, "Roughness": roughness,
              "Metallic": metallic, "IOR": 1.5, "Specular IOR Level": 0.5,
              "Coat Weight": coat, "Sheen Weight": sheen,
              "Emission Color": mat.diffuse_color, "Emission Strength": emission}
    for socket, value in values.items():
        shader.inputs[socket].default_value = value
    if coat:
        shader.inputs["Coat Roughness"].default_value = .075
    if sheen:
        shader.inputs["Sheen Tint"].default_value = (sheen, sheen, sheen, 1)
    if weave:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = weave
        tex.location = (-580, 0)
        normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = 0.28
        normal.location = (-270, 0)
        mat.node_tree.links.new(tex.outputs["Color"], normal.inputs["Color"])
        mat.node_tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    return mat


def loft_uv(obj, sides, lengths, radius):
    uv = obj.data.uv_layers.new()
    tiles = max(1, round(tau * radius / .058))
    for face in obj.data.polygons:
        if face.loop_total == 4:
            i, j = divmod(face.index, sides)
            for loop, x, y in zip(face.loop_indices, (j, j+1, j+1, j), (i, i, i+1, i+1)):
                uv.data[loop].uv = (x / sides * tiles, lengths[y] / .058)
        else:
            face.use_smooth = False
            for loop in face.loop_indices:
                a = tau * (obj.data.loops[loop].vertex_index % sides) / sides
                uv.data[loop].uv = ((cos(a) + 1) * tiles / 2, (sin(a) + 1) * tiles / 2)


class Suit:
    def __init__(self, scene):
        self.collection = bpy.data.collections.new("EVA Suit")
        scene.collection.children.link(self.collection)
        self.root = bpy.data.objects.new("Astronaut_Sol_Check", None)
        self.collection.objects.link(self.root)
        self.root.empty_display_size = 0.1
        self.root["units"] = "meters"
        self.root["design"] = "xEMU / Apollo A7L inspired"
        weave = weave_image()
        self.fabric = material("Ortho-fabric · ivory", "ECEEEF", .75, sheen=.19, weave=weave)
        self.panel = material("Reinforced textile · pearl", "C4CCD1", .8, sheen=.13, weave=weave)
        self.shell = material("Composite · ceramic white", "E0E4E6", .34, coat=.18)
        self.tape = material("Commander tape · NASA red", "FC3D21", .61, sheen=.16, weave=weave)
        self.gold = material("Gold solar visor", "FFB800", .04, 1, coat=1)
        self.slate = material("Anodized hardware · slate", "1E293B", .25, .7)
        self.blue = material("Anodized hardware · NASA blue", "0B3D91", .25, .7)
        self.alloy = material("Brushed titanium", "8F9AA4", .29, .82)
        self.rubber = material("Vulcanized rubber", "18181B", .85)
        self.joint = material("Convolute cover · graphite", "57616A", .73, sheen=.11, weave=weave)
        self.glow = material("Cyan beacons", "4FD1FF", .24, emission=5)
        self.lcd = material("LCD phosphor", "8BD2C4", .44, emission=.65)
        self.dark = material("Optical glass · dark teal", "10292F", .18, coat=.4)

    def part(self, obj, name, mat):
        obj.name = name
        for coll in list(obj.users_collection):
            coll.objects.unlink(obj)
        self.collection.objects.link(obj)
        obj.parent = self.root
        obj.data.materials.append(mat)
        return obj

    def mesh(self, name, verts, faces, mat):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        mesh.polygons.foreach_set("use_smooth", [True] * len(faces))
        return self.part(bpy.data.objects.new(name, mesh), name, mat)

    def box(self, name, p, size, mat, bevel=.008, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=p)
        obj = bpy.context.object
        obj.data.transform(Matrix.Diagonal((*size, 1)))
        obj.rotation_euler = rot
        self.part(obj, name, mat)
        if bevel:
            if bpy.app.version < (4, 1, 0):
                obj.data.use_auto_smooth = True
            mod = obj.modifiers.new("Radiused edges", "BEVEL")
            mod.width, mod.segments = bevel, 2
            mod.harden_normals = True
            for face in obj.data.polygons:
                face.use_smooth = True
            obj.modifiers.new("Corner normals", "WEIGHTED_NORMAL").keep_sharp = True
        return obj

    def ellipsoid(self, name, p, size, mat, axis=UP, segments=32):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, location=p)
        obj = bpy.context.object
        obj.data.transform(Matrix.Diagonal((*size, 1)))
        obj.rotation_euler = Vector(axis).to_track_quat("Z", "Y").to_euler()
        uv = obj.data.uv_layers.active
        for loop in uv.data:
            loop.uv.x *= max(1, round(tau * size[0] / .058))
            loop.uv.y *= max(1, round(pi * size[2] / .058))
        for face in obj.data.polygons:
            face.use_smooth = True
        return self.part(obj, name, mat)

    def label(self, name, words, p, size, mat, back=False):
        data = bpy.data.curves.new(name, "FONT")
        data.body, data.size, data.align_x = words, size, "CENTER"
        data.align_y = "CENTER"
        data.resolution_u = 2
        obj = self.part(bpy.data.objects.new(name, data), name, mat)
        obj.location = p
        obj.rotation_euler = (pi / 2, 0, pi if back else 0)
        return obj

    def sweep(self, name, rings, mat, sides=32, *, closed=False, folds=0, phase=0, power=1):
        """Loft elliptical sections along a path with meter-based fabric UVs."""
        centers = [Vector(r[0]) for r in rings]
        lengths = [0.0]
        for a, b in zip(centers, centers[1:]):
            lengths.append(lengths[-1] + (b - a).length)
        vertices, faces = [], []
        last = len(rings) - 1
        reference = UP if abs((centers[-1] - centers[0]).normalized().dot(FRONT)) > .9 else FRONT
        for i, (p, rx, ry) in enumerate(rings):
            tangent = (centers[min(i + 1, last)] - centers[max(i - 1, 0)]).normalized()
            right = reference.cross(tangent).normalized()
            other = tangent.cross(right)
            for j in range(sides):
                a = tau * j / sides
                # Irregular diagonal folds, with restrained ends.
                amp = folds * sin(pi * i / last) ** .6
                wrinkle = 1 + amp * (.62 * sin(5*a + 57*lengths[i] + phase)
                                     + .38 * cos(9*a - 88*lengths[i] + phase))
                u, v = cos(a), sin(a)
                x = rx * u if power == 1 else rx * abs(u)**power * (1 if u >= 0 else -1)
                y = ry * v if power == 1 else ry * abs(v)**power * (1 if v >= 0 else -1)
                vertices.append(Vector(p) + wrinkle * (right * x + other * y))
        for i in range(last):
            for j in range(sides):
                k = (j + 1) % sides
                faces.append((i*sides+j, i*sides+k, (i+1)*sides+k, (i+1)*sides+j))
        if closed:
            faces.extend((tuple(reversed(range(sides))), tuple(range(last*sides, (last+1)*sides))))
        obj = self.mesh(name, vertices, faces, mat)
        loft_uv(obj, sides, lengths, sum(r[1] for r in rings) / len(rings))
        return obj

    def barrel(self, name, p, axis, radius, depth, mat, sides=24, aspect=1):
        p, axis = Vector(p), Vector(axis).normalized()
        profile = ((-.5, .87), (-.41, 1), (.41, 1), (.5, .87))
        return self.sweep(name, [(p + axis * depth * t, radius * r, radius * r * aspect)
                                 for t, r in profile], mat, sides, closed=True)

    def bellows(self, name, p, axis, length, radius, count, mat, aspect=1, depth=.14):
        p, axis = Vector(p), Vector(axis).normalized()
        rings = []
        steps = count * 6
        for i in range(steps + 1):
            t = i / steps
            r = radius * (1 - depth * (.5 + .5*cos(tau*count*t))) * (1 - .08*cos(tau*t))
            rings.append((p + axis * (t - .5) * length, r, r * aspect))
        return self.sweep(name, rings, mat, 28, closed=True)

    def hose(self, name, knots, radius, mat, corrugated=False):
        """Sample Catmull–Rom control points and add continuous molded ribs."""
        pts = [Vector(p) for p in (knots[0], *knots, knots[-1])]
        path = []
        samples = 11 if corrugated else 5
        for i in range(len(knots) - 1):
            a, b, c, d = pts[i:i+4]
            for j in range(samples):
                t = j / samples
                path.append(.5 * ((2*b) + (c-a)*t + (2*a-5*b+4*c-d)*t*t
                                  + (-a+3*b-3*c+d)*t*t*t))
        path.append(pts[-1])
        # Parallel transport avoids twisting when a shoulder hose turns forward.
        verts, faces = [], []
        lengths = [0]
        for a, b in zip(path, path[1:]):
            lengths.append(lengths[-1] + (b-a).length)
        n = 16 if corrugated else 8
        right = Vector((1, 0, 0))
        for i, p in enumerate(path):
            t = (path[min(i+1, len(path)-1)] - path[max(0, i-1)]).normalized()
            right = (right - t * right.dot(t)).normalized()
            if right.length < .5:
                right = t.cross(UP if abs(t.z) < .9 else FRONT).normalized()
            other = t.cross(right)
            rx = radius * (1 + .13*cos(tau*lengths[i]/.027)) if corrugated else radius
            verts.extend(p + rx * (right*cos(tau*j/n) + other*sin(tau*j/n)) for j in range(n))
            if i:
                for j in range(n):
                    k = (j+1) % n
                    faces.append(((i-1)*n+j, (i-1)*n+k, i*n+k, i*n+j))
        faces.extend((tuple(reversed(range(n))), tuple(range(len(verts)-n, len(verts)))))
        obj = self.mesh(name, verts, faces, mat)
        loft_uv(obj, n, lengths, radius)
        return obj


def helmet(s):
    center = Vector((0, -.015, 1.807))
    s.ellipsoid("Composite helmet pressure shell", center, (.195, .190, .213), s.shell, segments=56)
    for z, radius, height, mat in (
        (1.595, .178, .043, s.shell), (1.618, .173, .019, s.alloy),
        (1.636, .160, .029, s.slate), (1.653, .154, .012, s.rubber),
    ):
        s.barrel("Neck locking stack", (0, .006, z), UP, radius, height, mat, 48, .92)

    def visor_point(a, r, scale):
        # The optical shell is an ellipsoid patch, bulged toward the viewer.
        x = r * cos(a) * .910
        z = r * sin(a) * (.78 if sin(a) > 0 else .62) + .054
        y = -sqrt(max(.01, 1 - x*x - z*z))
        return center + Vector((.203*x, .222*y, .217*z)) * scale

    def visor_surface():
        n, steps = 48, 9
        verts = [visor_point(0, 0, 1.014)]
        for i in range(1, steps+1):
            r = sin((pi/2) * i / (steps+1)) / sin((pi/2) * steps / (steps+1))
            verts.extend(visor_point(tau*j/n, r, 1.014) for j in range(n))
        faces = [(0, 1+j, 1+(j+1)%n) for j in range(n)]
        for i in range(steps-1):
            a, b = 1+i*n, 1+(i+1)*n
            faces.extend((a+j, b+j, b+(j+1)%n, a+(j+1)%n) for j in range(n))
        obj = s.mesh("Convex gold solar visor", verts, faces, s.gold)
        solid = obj.modifiers.new("Optical shell thickness", "SOLIDIFY")
        solid.thickness = .002
        obj.modifiers.new("Optical surface refinement", "SUBSURF").levels = 1

    visor_surface()
    for name, scale, r, mat, thickness in (
        ("Visor edge gasket", 1.005, 1.007, s.rubber, .010),
        ("Visor retaining lip", .992, 1.036, s.alloy, .0045),
    ):
        pts = [visor_point(tau*j/64, r, scale) for j in range(64)]
        s.hose(name, [pts[-1], *pts, pts[0], pts[1]], thickness, mat)
    for k in (-1, 1):
        s.barrel("Visor pivot housing", (k*.192, .004, 1.821), (k, 0, 0), .045, .038, s.slate)
        s.barrel("Visor pivot cap", (k*.215, .004, 1.821), (k, 0, 0), .029, .014, s.alloy)
        s.box("Floodlight mounting pod", (k*.161, -.105, 1.891), (.066, .108, .064), s.shell, .014)
        s.box("Floodlight lens bezel", (k*.161, -.159, 1.893), (.048, .016, .037), s.slate, .005)
        for dx in (-.011, .011):
            s.barrel("EVA floodlight optic", (k*.161+dx, -.169, 1.893), FRONT, .0085, .008, s.glow, 16)
        s.box("Helmet communications pod", (k*.139, .105, 1.881), (.102, .064, .094), s.slate, .019)


def torso(s):
    hut = [(1.296, .209, .144), (1.325, .231, .164), (1.405, .260, .180),
           (1.505, .274, .181), (1.573, .247, .147), (1.610, .187, .115)]
    obj = s.sweep("Contoured hard upper torso", [((0, .015, z), a, b) for z,a,b in hut],
                  s.fabric, 40, closed=True, power=.8)
    mod = obj.modifiers.new("Composite panel curvature", "SUBSURF")
    mod.levels = 1
    mod.render_levels = 1
    s.sweep("Flexible abdomen", [((0, .008, z), a, b) for z,a,b in (
        (1.058, .178, .108), (1.084, .220, .144), (1.158, .216, .149),
        (1.217, .212, .154), (1.277, .219, .161), (1.345, .228, .157))],
        s.fabric, 40, closed=True, folds=.064, power=.76)
    s.ellipsoid("Pelvic pressure garment", (0, .013, 1.045), (.237, .145, .171), s.fabric)
    s.bellows("Waist mobility band", (0, .009, 1.166), UP, .110, .227, 4, s.joint, .77, .10)
    s.barrel("Waist bearing", (0, .009, 1.225), UP, .232, .018, s.alloy, 48, .80)
    s.barrel("Waist bearing gasket", (0, .009, 1.237), UP, .230, .011, s.rubber, 48, .80)
    for k in (-1, 1):
        s.ellipsoid("Shoulder yoke", (k*.251, .012, 1.497), (.116, .148, .133), s.shell)
        s.hose("Shoulder restraint webbing", [(k*.173, .146, 1.547),
            (k*.168, .039, 1.601), (k*.164, -.070, 1.590),
            (k*.158, -.139, 1.552), (k*.149, -.170, 1.477)], .013, s.panel)
        s.box("Front suit utility pocket", (k*.122, -.135, 1.116), (.126, .049, .091), s.panel, .014)
        s.box("Utility pocket flap", (k*.122, -.159, 1.142), (.127, .015, .031), s.fabric, .006)
        s.box("Harness clasp", (k*.122, -.168, 1.128), (.022, .010, .026), s.slate, .003)
    s.box("Commander chest tape", (-.137, -.155, 1.526), (.153, .014, .036), s.tape,
          .005, (radians(13), radians(9), radians(-9)))
    s.box("NASA identification patch", (.118, -.163, 1.536), (.100, .012, .035), s.blue, .006)
    s.label("NASA lettering", "N A S A", (.118, -.170, 1.536), .018, s.shell)

    s.box("DCM vibration mount", (0, -.159, 1.381), (.293, .087, .222), s.rubber, .021)
    s.box("DCM enclosure", (0, -.199, 1.383), (.268, .086, .192), s.shell, .019)
    s.box("DCM anodized faceplate", (0, -.245, 1.386), (.243, .019, .165), s.slate, .012)
    s.box("DCM screen surround", (-.027, -.257, 1.416), (.141, .012, .069), s.blue, .006)
    s.box("DCM display window", (-.027, -.264, 1.416), (.122, .008, .051), s.dark, .005)
    s.label("DCM display pressure", "O2    4.3 PSI", (-.027, -.269, 1.425), .012, s.lcd)
    s.label("DCM display status", "LOOP A  |  NOM", (-.027, -.269, 1.407), .008, s.lcd)
    s.label("DCM etched legend", "LIFE SUPPORT", (-.008, -.256, 1.457), .010, s.shell)
    for x, r in ((-.076,.018),(-.025,.014),(.026,.014),(.075,.018)):
        s.barrel("DCM rotary switch", (x, -.263, 1.352), FRONT, r, .027, s.alloy, 12)
        s.box("Rotary switch index", (x, -.279, 1.357), (.003, .003, .011), s.slate, 0)
    for i in range(3):
        s.barrel("DCM status diode", (.071, -.259, 1.435-i*.015), FRONT, .004, .006,
                 s.glow if i == 0 else s.lcd, 12)
    for x in (-.103, .103):
        for z in (1.320, 1.450):
            s.barrel("DCM captive fastener", (x, -.256, z), FRONT, .005, .004, s.alloy, 8)
    for x, mat in ((-.064, s.tape), (.064, s.blue)):
        s.barrel("Pressure relief fitting", (x, -.217, 1.270), FRONT, .027, .046, s.alloy, 16)
        s.barrel("Pressure relief knob", (x, -.244, 1.270), FRONT, .019, .018, mat, 12)


def life_support(s):
    s.box("PLSS structural backplate", (0, .169, 1.403), (.434, .112, .529), s.alloy, .031)
    s.box("PLSS rigid housing", (0, .280, 1.403), (.461, .245, .551), s.shell, .041)
    s.box("PLSS service panel gasket", (0, .402, 1.400), (.322, .025, .430), s.rubber, .017)
    s.box("PLSS central service panel", (0, .420, 1.400), (.308, .037, .413), s.slate, .019)
    s.box("OPS purge assembly", (0, .269, 1.692), (.325, .226, .127), s.shell, .022)
    s.box("OPS release surround", (0, .393, 1.694), (.163, .041, .074), s.blue, .012)
    s.box("OPS release handle", (0, .422, 1.694), (.088, .029, .020), s.tape, .005)
    s.label("OPS stencil", "OXYGEN PURGE", (0, .415, 1.716), .010, s.shell, back=True)
    s.label("PLSS stencil", "P L S S  /  0 1", (0, .441, 1.521), .020, s.shell, back=True)
    for i in range(8):
        s.box("Heat exchanger grille", (0, .442, 1.342+i*.018), (.237, .011, .008), s.alloy, .002)
    for k in (-1, 1):
        x = k * .212
        s.ellipsoid("High-pressure oxygen cylinder", (x, .411, 1.378), (.060, .062, .193), s.alloy)
        for z in (1.269, 1.456):
            s.barrel("Oxygen cylinder retention band", (x, .411, z), UP, .064, .028, s.slate, 24, 1.02)
        s.barrel("Oxygen manifold stem", (x, .411, 1.565), UP, .019, .049, s.alloy, 12)
        s.barrel("Oxygen isolation valve", (x, .411, 1.595), UP, .024, .021, s.blue, 12)
        s.hose("Stainless oxygen manifold", [(x,.414,1.604), (x*.99,.415,1.624),
            (x*.78,.433,1.632), (x*.51,.436,1.618), (x*.39,.417,1.608)], .008, s.alloy)
        knots = [(k*.170,.329,1.674), (k*.235,.272,1.679), (k*.261,.158,1.657),
                 (k*.262,.028,1.630), (k*.247,-.097,1.589), (k*.224,-.178,1.498),
                 (k*.197,-.212,1.408), (k*.143,-.224,1.393)]
        s.hose("Corrugated shoulder umbilical", knots, .020, s.slate, corrugated=True)
        for idx, neighbor in ((0, 1), (-1, -2)):
            axis = Vector(knots[idx]) - Vector(knots[neighbor])
            s.barrel("Umbilical quick disconnect", knots[idx], axis, .028, .052, s.alloy, 16)
            s.barrel("Umbilical coupling band", knots[idx], axis, .029, .014, s.blue, 16)
    s.barrel("High-gain antenna mount", (.154,.304,1.768), UP, .028,.040, s.slate)
    s.hose("High-gain antenna mast", [(.154,.304,1.775),(.159,.315,1.837),(.184,.331,1.893)],
           .009, s.alloy)
    antenna_axis = Vector((.24,.62,.74)).normalized()
    s.ellipsoid("High-gain antenna radome", (.188,.335,1.903), (.057,.057,.018),
                s.shell, antenna_axis)
    s.hose("Backup communications whip", [(-.148,.328,1.748),(-.161,.343,1.867),
           (-.182,.358,1.966)], .004, s.slate)


def limbs(s):
    for k in (-1, 1):
        def p(x, y, z):
            return (k*x, y, z)

        shoulder = p(.313, .004, 1.465)
        elbow = p(.425, -.024, 1.274 + .011*k)
        wrist = p(.476, -.072 - .017*k, 1.062 + .020*k)
        upper_axis = Vector(elbow) - Vector(shoulder)
        lower_axis = Vector(wrist) - Vector(elbow)
        s.bellows("Shoulder convolute", shoulder, upper_axis, .124, .122, 4, s.joint, 1.05)
        s.barrel("Shoulder bearing", p(.358, -.006, 1.398), upper_axis, .114, .029, s.alloy, 32)
        s.barrel("Commander upper-arm stripe", p(.371, -.008, 1.376), upper_axis, .113, .043, s.tape, 36)
        s.ellipsoid("Upper arm soft goods", p(.398, -.010, 1.329), (.111,.113,.127),
                    s.fabric, upper_axis)
        s.bellows("Elbow convolute", elbow, upper_axis + lower_axis, .131, .101, 5, s.joint)
        s.sweep("Tailored forearm sleeve", [(Vector(elbow).lerp(Vector(wrist), t), r, r*.96)
                  for t,r in ((.12,.074),(.26,.088),(.40,.090),(.56,.089),(.73,.080),(.87,.070),(1,.067))],
                  s.fabric, closed=True, folds=.074, phase=k)
        s.barrel("Wrist disconnect ring", wrist, lower_axis, .071,.039, s.slate)
        s.barrel("Wrist locking collar", Vector(wrist)+.014*lower_axis.normalized(),
                 lower_axis, .072,.017, s.alloy)
        hand(s, Vector(wrist), lower_axis.normalized(), k)

        hip = p(.144, .008, .975)
        knee = p(.170, -.016+.021*k, .605)
        ankle = p(.198, .025+.021*k, .202)
        thigh = Vector(knee) - Vector(hip)
        shin = Vector(ankle) - Vector(knee)
        s.bellows("Hip convolute", hip, thigh, .142, .143, 4, s.joint, 1.05)
        s.sweep("Tailored thigh pressure sleeve", [(Vector(hip).lerp(Vector(knee), t), r, r*1.02)
                for t,r in ((.12,.119),(.24,.144),(.35,.148),(.47,.144),(.58,.136),
                            (.70,.131),(.81,.120),(.93,.102))],
                s.fabric, 40, closed=True, folds=.067, phase=k+.7)
        s.box("Thigh equipment pocket", p(.169,-.132,.811), (.163,.067,.125), s.panel, .016)
        s.box("Equipment pocket flap", p(.169,-.169,.841), (.164,.018,.046), s.fabric, .008)
        s.box("Pocket pull tab", p(.171,-.178,.823), (.026,.009,.047), s.rubber, .004)
        s.bellows("Knee convolute", knee, thigh+shin, .169, .124, 6, s.joint, .99)
        s.ellipsoid("Padded knee abrasion guard", Vector(knee)+Vector((0,-.107,0)),
                    (.097,.031,.082), s.panel)
        s.sweep("Tailored lower leg", [(Vector(knee).lerp(Vector(ankle), t), r, r*.98)
                for t,r in ((.12,.100),(.25,.120),(.35,.125),(.44,.121),(.55,.121),
                            (.64,.111),(.75,.110),(.85,.101),(.98,.096))],
                s.fabric, 40, closed=True, folds=.082, phase=k+2.1)
        s.hose("Shin garment seam", [p(.229,-.090,.539+.008*k),p(.233,-.111,.469),
                 p(.244,-.095,.357),p(.250,-.067,.264)], .003, s.panel)
        boot(s, ankle, k)
    # Small embroidered-looking US patch on the front of the right upper arm.
    patch_center = Vector((.392,-.120,1.337))
    patch_rotation = Euler((0, radians(-17), 0))

    def flag_point(x, y, z):
        return patch_center + patch_rotation.to_matrix() @ Vector((x,y,z))

    s.box("Flag patch backing", patch_center, (.079,.012,.053), s.fabric, .003, patch_rotation)
    for i in range(7):
        s.box("Flag red stripe", flag_point(0,-.007,-.022+i*.007),
              (.071,.003,.0035), s.tape, 0, patch_rotation)
    s.box("Flag canton", flag_point(-.017,-.009,.010), (.038,.004,.025), s.blue, .001, patch_rotation)
    for i in range(3):
        for j in range(4):
            s.barrel("Flag star stitch", flag_point(-.031+j*.009,-.012,.003+i*.007), FRONT,
                     .0013,.0014, s.shell, 8)


def hand(s, wrist, axis, k):
    right = Vector((k, 0, 0))
    hand_center = wrist + axis*.061
    s.ellipsoid("Glove pressure shell", hand_center, (.058,.048,.078), s.fabric, axis)
    s.ellipsoid("Glove grip pad", hand_center + Vector((0,.033,0)), (.052,.019,.057), s.rubber, axis)
    for row in range(5):
        p = hand_center + Vector((0,.050,0)) + (row-2)*.015*axis
        s.box("Palm grip rib", p, (.074,.007,.005), s.joint, .002)
    for i, reach in enumerate((.076,.087,.082,.063)):
        start = wrist + axis*.103 + right*((i-1.5)*.024)
        tip = start + axis*reach + Vector((0,.018,0))
        mid = start.lerp(tip,.53) + Vector((0,-.006,0))
        s.ellipsoid("Glove finger pressure sleeve", start.lerp(mid,.50),
                    (.015,.017,.033), s.fabric, mid-start, 20)
        s.ellipsoid("Glove fingertip grip", mid.lerp(tip,.51), (.013,.015,.027), s.rubber, tip-mid, 20)
        s.ellipsoid("Knuckle guard segment", start + Vector((0,-.016,0)),
                    (.013,.010,.017), s.shell, axis, 16)
    thumb = wrist + axis*.061 - right*.045
    s.ellipsoid("Articulated thumb", thumb - right*.011, (.021,.024,.048),
                s.fabric, axis-right*.63, 24)
    s.ellipsoid("Thumb grip", thumb + axis*.037 - right*.021, (.019,.021,.027),
                s.rubber, axis+right*.18, 20)


def boot(s, ankle, k):
    x, y, _ = ankle
    center_y = y-.093
    yaw = k*radians(-7)

    def loc(dx, dy, z):
        return (x+cos(yaw)*dx-sin(yaw)*dy, center_y+sin(yaw)*dx+cos(yaw)*dy, z)

    rot = (0, 0, yaw)
    s.box("Boot reinforced outsole", loc(0,0,.046), (.244,.405,.064), s.rubber, .025, rot)
    s.box("Boot shock-absorbing midsole", loc(0,0,.082), (.235,.393,.040), s.slate, .015, rot)
    s.box("Boot molded foot shell", loc(0,.004,.127), (.222,.359,.088), s.panel, .035, rot)
    s.ellipsoid("Toe impact cap", loc(0,-.112,.124), (.105,.105,.058), s.shell)
    s.ellipsoid("Boot padded instep", loc(0,.014,.158), (.107,.143,.082), s.fabric)
    s.barrel("Ankle shell collar", (x,y,.221), UP, .109,.086, s.shell, 36, 1.03)
    s.bellows("Ankle collar rings", (x,y,.250), UP, .047,.111, 3, s.joint, 1.02)
    s.barrel("Ankle retaining ring", (x,y,.227), UP, .113,.013, s.alloy, 32, 1.03)
    s.box("Rear heel kicker", loc(0,.182,.086), (.170,.063,.084), s.rubber, .012, rot)
    s.box("Toe gaiter closure", loc(0,-.037,.205), (.115,.049,.017), s.slate, .004, rot)
    for i in range(7):
        for sign in (-1, 1):
            s.box("Deep outsole tread lug", loc(sign*.070,-.156+.051*i,.022),
                  (.111,.034,.044), s.rubber, .005, (0,0,yaw+sign*.18))


def studio(scene):
    collection = bpy.data.collections.new("Studio · render only")
    scene.collection.children.link(collection)
    world = bpy.data.worlds.new("Deep navy environment")
    if world.node_tree is None:
        world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (.064,.091,.153,1)
    bg.inputs["Strength"].default_value = .39
    scene.world = world

    def place(name, data, position, target):
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
        return obj

    sun = bpy.data.lights.new("45° solar key", "SUN")
    sun.energy, sun.angle, sun.color = 2.0, radians(1.3), (1,.88,.74)
    place(sun.name, sun, (-3,-4,6), (0,0,1))

    for name, p, watts, color, width, height, shape in (
        ("Warm visor bounce", (-2.8,-3.4,4.3), 465, (1,.88,.74), 2.9, 1.6, "ELLIPSE"),
        ("Navy fill", (2.6,-1.8,2.3), 95, (.32,.47,.86), 2.4, 2.2, "ELLIPSE"),
        ("Cyan rim", (1.4,2.3,2.9), 350, (.40,.79,1), 1.4, 2.3, "RECTANGLE"),
        ("Rear softbox", (-2,1.7,2.8), 110, (.80,.87,1), 1.6, 2.0, "RECTANGLE"),
    ):
        lamp = bpy.data.lights.new(name, "AREA")
        lamp.shape, lamp.energy, lamp.color = shape, watts, color
        lamp.size, lamp.size_y = width, height
        place(name, lamp, p, (0,0,1.12))

    floor = bpy.data.meshes.new("Studio cyclorama")
    profile = [(-22, 0)] + [(4+4*sin(pi*i/48), 4-4*cos(pi*i/48)) for i in range(25)] + [(8, 18)]
    vertices = [(x,y,z) for y,z in profile for x in (-28,28)]
    faces = [(i,i+1,i+3,i+2) for i in range(0, len(vertices)-2, 2)]
    floor.from_pydata(vertices, [], faces)
    for face in floor.polygons:
        face.use_smooth = True
    floor.materials.append(material("Studio charcoal", "192637", .70))
    collection.objects.link(bpy.data.objects.new("Studio ground", floor))
    camera = bpy.data.cameras.new("Portrait camera")
    camera.lens = 72
    scene.camera = place(camera.name, camera, (2.33,-5.04,2.21), (0,.020,1.035))
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    scene.render.resolution_x, scene.render.resolution_y = 1000, 1250
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    return collection


def add_hotspots(scene, suit):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    for name, (x, z), label, domain in HOTSPOTS:
        hit, point, *_ = scene.ray_cast(graph, Vector((x, -1, z)), -FRONT)
        if not hit:
            raise RuntimeError(f"No suit surface at {name}")
        anchor = bpy.data.objects.new(name, None)
        suit.collection.objects.link(anchor)
        anchor.parent = suit.root
        anchor.location = point + .009 * FRONT
        anchor.empty_display_type, anchor.empty_display_size = "SPHERE", .016
        anchor["label"], anchor["domain"] = label, domain


def export_glb(suit, path):
    """Bake transforms and batch by material while retaining editable source parts."""
    context = bpy.context
    collection = bpy.data.collections.new("GLB export")
    context.scene.collection.children.link(collection)
    staged = []
    baked_meshes = []
    active = context.view_layer.objects.active
    selection = list(context.selected_objects)
    try:
        context.view_layer.update()
        depsgraph = context.evaluated_depsgraph_get()
        groups = {}
        for part in list(suit.root.children):
            if part.type == "EMPTY":
                continue
            evaluated = part.evaluated_get(depsgraph)
            mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                                   depsgraph=depsgraph)
            baked_meshes.append(mesh)
            mesh.transform(part.matrix_local)
            mat = mesh.materials[0]
            if not any(n.type == "TEX_IMAGE" for n in mat.node_tree.nodes):
                for layer in list(mesh.uv_layers):
                    mesh.uv_layers.remove(layer)
            obj = bpy.data.objects.new(mat.name, mesh)
            collection.objects.link(obj)
            groups.setdefault(mat, []).append(obj)

        bpy.ops.object.select_all(action="DESELECT")
        for mat, batch in groups.items():
            for obj in batch:
                obj.select_set(True)
            merged = batch[0]
            context.view_layer.objects.active = merged
            if len(batch) > 1:
                bpy.ops.object.join()
            merged.name = f"EVA · {mat.name}"
            merged.data.name = merged.name
            if merged.data.uv_layers:
                triangulate = merged.modifiers.new("Tangent-compatible topology", "TRIANGULATE")
                triangulate.min_vertices = 5
                triangulate.keep_custom_normals = True
            merged.parent = suit.root
            merged.select_set(False)
            staged.append(merged)
        for obj in [suit.root, *staged, *(child for child in suit.root.children if child.type == "EMPTY")]:
            obj.select_set(True)
        options = dict(filepath=str(path), export_format="GLB", use_selection=True,
                       export_apply=True, export_materials="EXPORT", export_extras=True,
                       export_animations=False, export_cameras=False, export_lights=False,
                       export_yup=True, use_active_scene=True, export_tangents=True)
        props = bpy.ops.export_scene.gltf.get_rna_type().properties
        if "export_vertex_color" in props:
            options["export_vertex_color"] = "NONE"
            if "export_all_vertex_colors" in props:
                options["export_all_vertex_colors"] = False
        elif "export_colors" in props:
            options["export_colors"] = False
        if bpy.ops.export_scene.gltf(**options) != {"FINISHED"}:
            raise RuntimeError("glTF export failed")
    finally:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in baked_meshes:
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        bpy.data.collections.remove(collection)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in selection:
            obj.select_set(True)
        context.view_layer.objects.active = active


def main():
    if bpy.app.version < (4, 0, 0):
        raise RuntimeError("Blender 4.0 or later is required")
    default = Path.home()
    source = globals().get("__file__")
    if bpy.data.filepath:
        default = Path(bpy.data.filepath).parent
    elif source and Path(source).is_file():
        default = Path(source).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=default)
    parser.add_argument("--save-blend", action="store_true")
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    out = args.output_dir.expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    # Isolate generation from the scene that was open when the script was run.
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    previous = bpy.context.scene
    # A rerun replaces the prior generated scene and releases its canonical node names.
    prior = [scene for scene in bpy.data.scenes if scene.get(GENERATED)]
    scene = bpy.data.scenes.new(NAME)
    bpy.context.window.scene = scene
    for old in prior:
        for coll in list(old.collection.children):
            if not coll.get(GENERATED) or coll.users > 1:
                continue
            for obj in list(coll.objects):
                if len(obj.users_collection) == 1:
                    data = obj.data
                    bpy.data.objects.remove(obj, do_unlink=True)
                    if data and data.users == 0:
                        bpy.data.batch_remove(ids=[data])
            bpy.data.collections.remove(coll)
        bpy.data.scenes.remove(old)
    scene.name = NAME
    scene[GENERATED] = True
    scene.unit_settings.system = "METRIC"
    suit = Suit(scene)
    helmet(suit)
    torso(suit)
    life_support(suit)
    limbs(suit)
    add_hotspots(scene, suit)
    stage = studio(scene)
    suit.collection[GENERATED] = stage[GENERATED] = True
    export_glb(suit, out / f"{BASENAME}.glb")

    # Keep the opening viewport framed on the suit and the render rig out of the way.
    for obj in stage.objects:
        obj.hide_set(True)
    for obj in list(bpy.context.selected_objects):
        obj.select_set(False)
    bpy.context.view_layer.objects.active = None
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.overlay.show_overlays = False
                space.shading.color_type = "MATERIAL"
                space.shading.studiolight_rotate_z = radians(30)
                space.region_3d.view_distance = 3.40
                space.region_3d.view_location = (0, .010, 1.02)
                space.region_3d.view_rotation = Euler((radians(82), 0, radians(20)), "XYZ").to_quaternion()
                space.region_3d.view_perspective = "ORTHO"

    if args.save_blend:
        # Drop the unmodified factory-startup scene in the command-line build.
        if not prior and bpy.app.background and previous.name == "Scene" and sorted(previous.objects.keys()) == ["Camera","Cube","Light"]:
            bpy.data.scenes.remove(previous)
        if source and Path(source).is_file():
            script = bpy.data.texts.get(Path(source).name)
            if script is None:
                script = bpy.data.texts.load(source, internal=True)
            for screen in bpy.data.screens:
                for area in screen.areas:
                    if area.type == "TEXT_EDITOR":
                        area.spaces.active.text = script
        bpy.ops.wm.save_as_mainfile(filepath=str(out / f"{BASENAME}.blend"), compress=True)
    if args.render:
        scene.render.filepath = str(out / f"{BASENAME}.png")
        bpy.ops.render.render(write_still=True)
    print(f"Built {NAME} at {out}")


if __name__ == "__main__":
    main()
```
