import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const SEMANTIC_DRACO_IDS: Readonly<Record<string, string>> = {
  position: 'POSITION',
  normal: 'NORMAL',
  color: 'COLOR',
  uv: 'TEX_COORD',
}

export interface DracoTaskConfig {
  attributeIDs: Record<string, string | number>
  attributeTypes: Record<string, string>
  useUniqueIDs: boolean
  vertexColorSpace: THREE.ColorSpace
}

interface InternalDracoLoader {
  defaultAttributeIDs: Record<string, string | number>
  defaultAttributeTypes: Record<string, string>
  decodeGeometry(buffer: ArrayBuffer, taskConfig: DracoTaskConfig): Promise<THREE.BufferGeometry>
  decodeDracoFile(
    buffer: ArrayBuffer,
    callback: (geometry: THREE.BufferGeometry) => void,
    attributeIDs?: Record<string, string | number> | null,
    attributeTypes?: Record<string, string> | null,
    vertexColorSpace?: THREE.ColorSpace,
    onError?: (err: unknown) => void,
  ): Promise<unknown>
}

/**
 * Prefer semantic Draco attribute lookup (`draco.POSITION`, `draco.NORMAL`, ...) when a glTF
 * primitive only uses standard single-instance attributes. Some upstream Draco-compressed GLBs
 * (e.g. Robotiq 2F-85/2F-140 finger meshes in ufactory_genesis v0.3.10) declare swapped glTF
 * unique IDs (`POSITION: 0, NORMAL: 1`) while the Draco payload stores normals at unique_id 0
 * and positions at unique_id 1, causing unique-ID lookup to render unit normals as a 1 m sphere.
 */
export function buildDracoTaskConfig(
  attributeIDs: Record<string, string | number> | null | undefined,
  attributeTypes: Record<string, string> | null | undefined,
  defaultAttributeIDs: Record<string, string | number>,
  defaultAttributeTypes: Record<string, string>,
  vertexColorSpace: THREE.ColorSpace = THREE.LinearSRGBColorSpace,
): DracoTaskConfig {
  const keys = attributeIDs ? Object.keys(attributeIDs) : []
  if (keys.length > 0 && keys.every((k) => Object.prototype.hasOwnProperty.call(SEMANTIC_DRACO_IDS, k))) {
    const semanticIDs: Record<string, string> = {}
    for (const k of keys) {
      semanticIDs[k] = SEMANTIC_DRACO_IDS[k]
    }
    return {
      attributeIDs: semanticIDs,
      attributeTypes: attributeTypes ?? defaultAttributeTypes,
      useUniqueIDs: false,
      vertexColorSpace,
    }
  }
  return {
    attributeIDs: attributeIDs || defaultAttributeIDs,
    attributeTypes: attributeTypes || defaultAttributeTypes,
    useUniqueIDs: Boolean(attributeIDs),
    vertexColorSpace,
  }
}

/** Create a Three.js `DRACOLoader` configured with semantic lookup for standard glTF primitives. */
export function createRobotDracoLoader(decoderPath = 'draco/'): DRACOLoader {
  const loader = new DRACOLoader()
  loader.setDecoderPath(decoderPath)

  const internal = loader as unknown as InternalDracoLoader
  internal.decodeDracoFile = function decodeDracoFileSemantic(
    buffer: ArrayBuffer,
    callback: (geometry: THREE.BufferGeometry) => void,
    attributeIDs?: Record<string, string | number> | null,
    attributeTypes?: Record<string, string> | null,
    vertexColorSpace: THREE.ColorSpace = THREE.LinearSRGBColorSpace,
    onError: (err: unknown) => void = () => {},
  ) {
    const taskConfig = buildDracoTaskConfig(
      attributeIDs,
      attributeTypes,
      this.defaultAttributeIDs,
      this.defaultAttributeTypes,
      vertexColorSpace,
    )
    return this.decodeGeometry(buffer, taskConfig).then(callback).catch(onError)
  }

  return loader
}
