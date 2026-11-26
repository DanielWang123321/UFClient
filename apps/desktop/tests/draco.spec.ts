import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { buildDracoTaskConfig, createRobotDracoLoader, type DracoTaskConfig } from '../src/three/draco'

const DEFAULTS = {
  ids: { position: 'POSITION', normal: 'NORMAL', color: 'COLOR', uv: 'TEX_COORD' },
  types: { position: 'Float32Array', normal: 'Float32Array', color: 'Float32Array', uv: 'Float32Array' },
}

describe('semantic Draco attribute decoding', () => {
  it('switches standard glTF primitives from unique-ID lookup to semantic lookup', () => {
    const cfg = buildDracoTaskConfig(
      { position: 0, normal: 1 },
      { position: 'Float32Array', normal: 'Float32Array' },
      DEFAULTS.ids,
      DEFAULTS.types,
    )
    expect(cfg).toEqual({
      attributeIDs: { position: 'POSITION', normal: 'NORMAL' },
      attributeTypes: { position: 'Float32Array', normal: 'Float32Array' },
      useUniqueIDs: false,
      vertexColorSpace: THREE.LinearSRGBColorSpace,
    })
  })

  it('preserves unique-ID lookup when non-standard or unmapped attributes exist', () => {
    const cfg = buildDracoTaskConfig(
      { position: 0, uv1: 2 },
      { position: 'Float32Array', uv1: 'Float32Array' },
      DEFAULTS.ids,
      DEFAULTS.types,
      THREE.SRGBColorSpace,
    )
    expect(cfg.useUniqueIDs).toBe(true)
    expect(cfg.attributeIDs).toEqual({ position: 0, uv1: 2 })
    expect(cfg.vertexColorSpace).toBe(THREE.SRGBColorSpace)
  })

  it('routes GLTFLoader decodeDracoFile calls through semantic lookup in createRobotDracoLoader', async () => {
    const loader = createRobotDracoLoader('draco/')
    const internal = loader as unknown as {
      decodeGeometry: (buf: ArrayBuffer, cfg: DracoTaskConfig) => Promise<THREE.BufferGeometry>
      decodeDracoFile: (
        buf: ArrayBuffer,
        cb: (g: THREE.BufferGeometry) => void,
        ids: Record<string, number>,
        types: Record<string, string>,
        cs?: THREE.ColorSpace,
      ) => Promise<void>
    }
    const stubGeom = new THREE.BufferGeometry()
    const spy = vi.spyOn(internal, 'decodeGeometry').mockResolvedValue(stubGeom)
    const onDecoded = vi.fn()

    await internal.decodeDracoFile(
      new ArrayBuffer(8),
      onDecoded,
      { position: 0, normal: 1 },
      { position: 'Float32Array', normal: 'Float32Array' },
    )

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1].useUniqueIDs).toBe(false)
    expect(spy.mock.calls[0][1].attributeIDs).toEqual({ position: 'POSITION', normal: 'NORMAL' })
    expect(onDecoded).toHaveBeenCalledWith(stubGeom)
    loader.dispose()
  })

  it('decodes Robotiq 2F-85 finger geometry at millimeter scale via semantic POSITION rather than 1 m normal sphere', async () => {
    const decoderPath = resolve(__dirname, '../public/draco/draco_decoder.js')
    const glbPath = resolve(__dirname, '../public/robot-assets/urdf/robotiq_2f_85/meshes/visual/visual_glb/left_finger.glb')
    if (!existsSync(decoderPath) || !existsSync(glbPath)) return

    interface DracoMod {
      POSITION: number
      NORMAL: number
      Decoder: new () => {
        DecodeBufferToMesh(buf: unknown, mesh: unknown): { ok(): boolean }
        GetAttributeId(mesh: unknown, attrType: number): number
        GetAttribute(mesh: unknown, idx: number): unknown
        GetAttributeFloatForAllPoints(mesh: unknown, attr: unknown, out: unknown): void
      }
      DecoderBuffer: new () => { Init(data: Int8Array, len: number): void }
      Mesh: new () => { num_points(): number }
      DracoFloat32Array: new () => { size(): number; GetValue(i: number): number }
      destroy(obj: unknown): void
    }

    const ctx: Record<string, unknown> = {
      console,
      Math,
      Int8Array,
      Uint8Array,
      Int16Array,
      Uint16Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
      ArrayBuffer,
      DataView,
      WebAssembly,
      Promise,
      setTimeout,
      clearTimeout,
      __dirname: resolve(__dirname, '../public/draco'),
      __filename: decoderPath,
    }
    runInNewContext(readFileSync(decoderPath, 'utf8'), ctx)
    const mod = await (ctx.DracoDecoderModule as (opts: object) => Promise<DracoMod>)({})

    const b = readFileSync(glbPath)
    const clen = b.readUInt32LE(12)
    const gltf = JSON.parse(b.subarray(20, 20 + clen).toString('utf8')) as {
      meshes: { primitives: { extensions: { KHR_draco_mesh_compression: { bufferView: number } } }[] }[]
      bufferViews: { byteOffset?: number; byteLength: number }[]
    }
    const bv = gltf.bufferViews[gltf.meshes[0].primitives[0].extensions.KHR_draco_mesh_compression.bufferView]
    const bin = b.subarray(20 + clen + 8)
    const raw = new Int8Array(bin.buffer, bin.byteOffset + (bv.byteOffset ?? 0), bv.byteLength)

    const decoder = new mod.Decoder()
    const buf = new mod.DecoderBuffer()
    buf.Init(raw, raw.length)
    const mesh = new mod.Mesh()
    expect(decoder.DecodeBufferToMesh(buf, mesh).ok()).toBe(true)

    const posId = decoder.GetAttributeId(mesh, mod.POSITION)
    expect(posId).toBeGreaterThanOrEqual(0)
    const posAttr = decoder.GetAttribute(mesh, posId)
    const out = new mod.DracoFloat32Array()
    decoder.GetAttributeFloatForAllPoints(mesh, posAttr, out)

    let maxRadius = 0
    for (let i = 0; i < mesh.num_points(); i++) {
      const x = out.GetValue(i * 3)
      const y = out.GetValue(i * 3 + 1)
      const z = out.GetValue(i * 3 + 2)
      maxRadius = Math.max(maxRadius, Math.hypot(x, y, z))
    }
    expect(maxRadius).toBeLessThan(0.1)

    mod.destroy(out)
    mod.destroy(mesh)
    mod.destroy(buf)
    mod.destroy(decoder)
  })
})
