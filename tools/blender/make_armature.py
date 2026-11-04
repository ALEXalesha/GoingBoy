# Арматура GoingBoy в Blender: кости с теми же именами и в той же позе покоя, что скелет
# демки (docs/skeleton.json). На неё моделируется и привязывается тело; экспорт в .glb даёт
# модель, которую body/retarget.js оживляет без правок ядра.
#
# Запуск в Blender (Scripting -> Open -> Run Script), рядом должен лежать docs/skeleton.json:
#   blender --python tools/blender/make_armature.py
#
# Оси: в демке Y вверх и лицом к +Z, в Blender Z вверх и лицом к -Y. Перевод:
# (x, y, z) демки -> (x, -z, y) Blender. Экспорт glTF с «+Y Up» вернёт оси демки.
# Внимание: скрипт написан без Blender под рукой (в облаке его нет) - проверить на ПК.
import json
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SKELETON = os.path.join(HERE, '..', '..', 'docs', 'skeleton.json')


def to_blender(v):
    x, y, z = v
    return (x, -z, y)


def main():
    with open(SKELETON, encoding='utf-8') as f:
        data = json.load(f)
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = 'GoingBoy'
    arm.data.name = 'GoingBoy'
    bones = arm.data.edit_bones
    for b in list(bones):
        bones.remove(b)
    made = {}
    for b in data['bones']:
        eb = bones.new(b['name'])
        eb.head = to_blender(b['head'])
        eb.tail = to_blender(b['tail'])
        if b['parent']:
            eb.parent = made[b['parent']]
            # кость начинается в начале родителя или в конце - соединяем, только если совпало
            eb.use_connect = all(abs(p - q) < 1e-4 for p, q in zip(made[b['parent']].tail, eb.head))
        made[b['name']] = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    print('GoingBoy: костей', len(made))


main()
