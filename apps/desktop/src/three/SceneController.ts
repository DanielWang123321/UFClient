import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import URDFLoader, { type URDFRobot } from 'urdf-loader'

export /** Camera distance factor for the robot framing (smaller = closer). */
const VIEW_FIT = 1.35
/** Solid coordinate axes, X red, Y green, Z blue (unlit, arrow-headed, drawn over the robot meshes). */
export const AXIS_COLORS = { x: 0xe53935, y: 0x2ea043, z: 0x2574e8 } as const

function makeAxes(len: number, r: number): THREE.Group {
  const g = new THREE.Group()
  const headLength = len * 0.22
  const headRadius = r * 2.4
  const shaftLength = len - headLength
  const shaftGeo = new THREE.CylinderGeometry(r, r, shaftLength, 16)
  const headGeo = new THREE.ConeGeometry(headRadius, headLength, 20)
  const dirs: [keyof typeof AXIS_COLORS, THREE.Euler][] = [
    ['x', new THREE.Euler(0, 0, -Math.PI / 2)],
    ['y', new THREE.Euler(0, 0, 0)],
    ['z', new THREE.Euler(Math.PI / 2, 0, 0)],
  ]
  for (const [k, rot] of dirs) {
    const mat = new THREE.MeshBasicMaterial({
      color: AXIS_COLORS[k],
      depthTest: false,
      transparent: true,
      opacity: 0.94,
      toneMapped: false,
    })
    const axis = new THREE.Group()
    const shaft = new THREE.Mesh(shaftGeo, mat)
    shaft.position.y = shaftLength / 2
    shaft.renderOrder = 999
    const head = new THREE.Mesh(headGeo, mat)
    head.position.y = shaftLength + headLength / 2
    head.renderOrder = 999
    axis.add(shaft, head)
    axis.rotation.copy(rot)
    g.add(axis)
  }
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.6, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x1e293b, depthTest: false, toneMapped: false }),
  )
  origin.renderOrder = 1000
  g.add(origin)
  return g
}

const ASSET_BASE = 'robot-assets/'

function eulerXYZ(rpyDeg: number[]): THREE.Euler {
  // Fixed-axis X-Y-Z RPY (R = Rz·Ry·Rx) equals three.js intrinsic 'ZYX' order.
  const [r, p, y] = rpyDeg.map((d) => THREE.MathUtils.degToRad(d))
  return new THREE.Euler(r, p, y, 'ZYX')
}

/**
 * Imperative three.js scene. Kept out of Vue reactivity (design doc §4/§8).
 * Z-up world (camera.up = +Z), metres/radians internally.
 */
export class SceneController {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  private robot: URDFRobot | null = null
  private eeLink = 'link6'
  private tcpAxes = makeAxes(0.1, 0.0022)
  private baseAxes = makeAxes(0.14, 0.0026)
  private renderRequested = false
  private resizeObs: ResizeObserver | null = null
  private draco: DRACOLoader
  private loadSeq = 0
  onLoaded: (ok: boolean, err?: unknown) => void = () => {}

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    host.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50)
    this.camera.up.set(0, 0, 1)
    this.resetView()
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0.15, 0, 0.35)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.35
    this.controls.addEventListener('change', () => this.requestRender())
    this.controls.update()

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8794, 2.2))
    const key = new THREE.DirectionalLight(0xffffff, 2.6)
    key.position.set(2, -3, 5)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.left = key.shadow.camera.bottom = -2.2
    key.shadow.camera.right = key.shadow.camera.top = 2.2
    key.shadow.bias = -0.0001
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xd8e8ff, 1.2)
    fill.position.set(-3, 1, 3)
    this.scene.add(fill)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ color: 0x1e293b, opacity: 0.14, depthWrite: false }),
    )
    floor.position.z = -0.002
    floor.receiveShadow = true
    this.scene.add(floor)

    const grid = new THREE.GridHelper(6, 60, 0xcbd5e1, 0xdce3ec)
    grid.rotation.x = Math.PI / 2
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.45
    this.scene.add(grid)

    this.scene.add(this.baseAxes)

    this.draco = new DRACOLoader()
    this.draco.setDecoderPath('draco/')

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(host)
    this.resize()
  }

  /** Default view; once a robot is loaded it is framed to fill the free stage area. */
  resetView() {
    let target = new THREE.Vector3(0.15, 0, 0.35)
    let pos = new THREE.Vector3(1.5, -1.5, 1.2)
    if (this.robot && this.reach > 0) {
      const sphere = new THREE.Sphere(new THREE.Vector3(0.08 * this.reach, 0, 0.44 * this.reach), 0.6 * this.reach)
      target = sphere.center.clone()
      const dir = new THREE.Vector3(0.55, -0.95, 0.46).normalize()
      const fov = THREE.MathUtils.degToRad(this.camera.fov)
      pos = target.clone().addScaledVector(dir, (sphere.radius / Math.sin(fov / 2)) * VIEW_FIT)
    }
    if (this.controls) {
      this.controls.enableDamping = false
      this.camera.position.copy(pos)
      this.controls.target.copy(target)
      this.controls.update()
      this.controls.enableDamping = true
    } else {
      this.camera.position.copy(pos)
      this.camera.lookAt(target)
    }
    this.requestRender()
  }

  loadUrdf(relpath: string, eeLink: string) {
    this.eeLink = eeLink
    const seq = ++this.loadSeq
    if (this.robot) {
      this.tcpAxes.removeFromParent()
      this.scene.remove(this.robot)
      this.disposeObject(this.robot)
      this.robot = null
    }
    let failed: string | null = null
    const manager = new THREE.LoadingManager()
    const loader = new URDFLoader(manager)
    const gltf = new GLTFLoader(manager)
    gltf.setDRACOLoader(this.draco)
    const stl = new STLLoader(manager)
    loader.loadMeshCb = (path, _m, material, done) => {
      if (path.toLowerCase().endsWith('.stl')) {
        stl.load(
          path,
          (geom) => {
            const mat =
              material && !Array.isArray(material)
                ? material
                : new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.2 })
            const mesh = new THREE.Mesh(geom, mat)
            mesh.castShadow = true
            mesh.receiveShadow = true
            done(mesh)
          },
          undefined,
          (err) => {
            failed = path
            done(null as unknown as THREE.Object3D, err as Error)
          },
        )
        return
      }
      gltf.load(
        path,
        (g) => {
          g.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.castShadow = true
              obj.receiveShadow = true
            }
          })
          done(g.scene)
        },
        undefined,
        (err) => {
          failed = path
          done(null as unknown as THREE.Object3D, err as Error)
        },
      )
    }
    let robot: URDFRobot | null = null
    manager.onLoad = () => {
      if (!robot || seq !== this.loadSeq) return
      this.robot = robot
      this.scene.add(robot)
      this.reach = Object.values(robot.joints).reduce((a, j) => a + j.position.length(), 0)
      this.resetView()
      const ee = robot.links[this.eeLink]
      if (ee) {
        ee.add(this.tcpAxes)
      }
      this.requestRender()
      if (failed) this.onLoaded(false, new Error(`failed to load ${failed}`))
      else this.onLoaded(true)
    }
    manager.onError = (url) => {
      failed = url
    }
    loader.load(ASSET_BASE + relpath, (r) => {
      robot = r
    })
  }

  setJoints(names: string[], qDeg: number[]) {
    if (!this.robot) return
    names.forEach((n, i) => this.robot!.setJointValue(n, THREE.MathUtils.degToRad(qDeg[i] ?? 0)))
    this.requestRender()
  }

  setTcp(offset: number[]) {
    this.tcpAxes.position.set(offset[0] / 1000, offset[1] / 1000, offset[2] / 1000)
    this.tcpAxes.rotation.copy(eulerXYZ(offset.slice(3, 6)))
    this.requestRender()
  }

  setVisible(what: 'base' | 'tcp', on: boolean) {
    if (what === 'base') {
      this.baseAxes.visible = on
    } else {
      this.tcpAxes.visible = on
    }
    this.requestRender()
  }

  requestRender() {
    if (this.renderRequested) return
    this.renderRequested = true
    requestAnimationFrame(() => {
      this.renderRequested = false
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    })
  }

  /** Sum of joint offsets = an upper bound of the arm's reach (m). */
  private reach = 0
  private insets = { left: 0, right: 0, top: 0, bottom: 0 }
  setInsets(i: { left: number; right: number; top: number; bottom: number }) {
    this.insets = { ...i }
    this.resize()
  }

  private resize() {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    const { left, right, top, bottom } = this.insets
    const dx = (right - left) / 2
    const dy = (bottom - top) / 2
    if (dx || dy) this.camera.setViewOffset(w, h, dx, dy, w, h)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    this.requestRender()
  }

  private disposeObject(root: THREE.Object3D) {
    root.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      mats.forEach((mat) => {
        Object.values(mat).forEach((v) => (v instanceof THREE.Texture ? v.dispose() : undefined))
        mat.dispose()
      })
    })
  }

  dispose() {
    this.resizeObs?.disconnect()
    this.controls.dispose()
    if (this.robot) this.disposeObject(this.robot)
    this.draco.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
