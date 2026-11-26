# Changelog

All notable changes to UGClient (formerly Uclient) are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: SemVer.

## [Unreleased]

## [0.3.2] - 2026-11-26

### Added
- Narrow left primary navigation rail (`AppNavRail`) with **Live Control**, planned **Blockly / Python / GCode** placeholder entries (`FeaturePlaceholderView`), and a persistent bottom-left **Settings** entry.
- Dedicated full-window secondary **Settings** view (`SettingsView`) matching current UFACTORY Studio navigation (`← Settings`, search box, and 5 categories: **Motion**, **Externals**, **Safety**, **General**, **My Device**).
- Unified **Motion** settings page merging Studio's `Parameters`, `TCP`, and `Coordinates` views in UGClient's light neutral industrial style:
  - Separate **Joint Step** (`jointStepDeg`), **Position Step** (`stepMm`), and **Attitude Step** (`attitudeStepDeg`) click increments.
  - **Collision Detection** (`0–5` sensitivity scale) and per-model **Initial Position** configuration (`Home` motion target).
  - Unified **TCP Payload & Offset** card with `+ New` / preset management, plus **Coordinates** (World / Base Coordinate System offset & presets) and **Mounting** presets (`Floor`, `Ceiling`, `WallUp`, `WallDown`, `Customized` with `Tilt Angle` & `Rotate Angle`).
- One-way read-only hardware parameter synchronization (`real.read_settings`): reads `collision_sensitivity`, `world_offset`, `gravity_direction`, `mount_direction` (`get_mount_direction()` with inverse gravity fallback), and `initial_point` (`get_initial_point()`) from the connected physical controller to overwrite local state without blocking motion locks.
- Top-left collapsible frosted-glass real-robot overlay panel (`StageRealInfo.vue`) in `Viewport.vue`: displays separated controller State and Mode labels, stripped `vx.x.x` firmware version, collision sensitivity, TCP Payload, and TCP Offset read from the physical arm alongside the locked model selector, with a read-only refresh trigger (`real.refreshSettings()`).
- Dedicated gripper controls (`RobotPanel.vue`, `lib/gripper.ts`, and `real.gripper_enable` / `real.gripper_move` RPCs) for Robotiq `2F-85`, Robotiq `2F-140`, `Gripper G2`, and `BIO Gripper G2`: position slider/input + Open/Close actions drive speed-estimated 3D finger animations via URDF mimic joints in simulation and `xarm-python-sdk` commands in real mode, with Speed & Force parameters tucked into a collapsible tuning sub-panel.
- UFClient branding & geometric robot-arm vector logo (`AppLogo.vue`, `favicon.svg`).
- Bilingual SDK controller fault dictionary (`lib/realErrors.ts` matching `xarm-python-sdk` `ControllerErrorCodeMap`, incl. `C19` End Effector Communication Error) powering a redesigned frosted-white floating fault card (`StageNotices.vue`) and `MotionPanel.vue` guard banner with one-click **Clear error** actions.
- One-click backend + frontend dev launcher (`scripts/dev.py`) with automatic random WebSocket port/token handshake injection.

### Changed
- Reworked `real.clear_error` (`RealXArmController.clear_error(enable=True)`, `api/real.py`, `schema/api.v1.json`) to align with `xarm-python-sdk` recovery (`clean_warn` + `clean_error` + synchronous `get_err_warn_code` check + `motion_enable(True)` + `set_mode(0)` + `set_state(0)` when fault clears), while skipping motor enable when hardware faults remain latched; removed native `window.confirm` from `RealRobotControl.vue` and cleared `gripperError` on recovery.
- Centered `RealRobotControl` in `AppHeader.vue` with green connected indicators (`RealRobotControl.vue`, `StageRealInfo.vue`) and red fault states; removed redundant `Stopped (4)`, engine status pill, `真机只读` badge, `payload` / `mounting` footer rows in `StageTelemetry.vue`, and `eeHint` / mounting display rows in `RobotPanel.vue`.
- Normalized firmware version rendering strictly to `vx.x.x` (`formatFirmwareVersion` in `units.ts`), unified `MotionPanel` collapse state across Cartesian and Joint tabs, and added `scrollbar-gutter: stable` on the right control sidebar (`CheckView.vue`).
- Increased default 3D viewport robot scale by 50% (`VIEW_FIT` `1.35` -> `0.9`, fallback camera pose scaled accordingly) and switched the default startup robot model from `uf850` to xArm 6 (`xarm6_1305`).
- Moved the Settings entry from `AppHeader` to the bottom-left primary navigation rail and removed `TcpPanel` / `PayloadPanel` from the main workbench right sidebar (TCP & Payload configuration now lives in **Settings -> Motion**), while preserving the 3D WebGL viewport context across page switches via `v-show`.
- Strict read-only physical robot invariant: removed `real.set_tcp` and `real.set_payload` RPC methods and frontend write helpers so UGClient never writes configuration parameters back to physical hardware.
- Synced upstream `ufactory_genesis` pin from `v0.3.9` (`b33810e`) to `v0.3.10` (`c167f1e`):
  - Added Robotiq 2F-85 (`173.253 mm` default TCP) and Robotiq 2F-140 (`245.466 mm` default TCP) with the 11 mm `robotiq_mounting` flange adapter across UF850 and xArm 5/6/7.
  - Synced upstream aligned Lite 6 `link_base.glb`, unified xArm `link_base` inertials, `assembly.yaml` schema 5, and Robotiq / mounting-plate attributions in `NOTICE`.

### Fixed
- Preserved compatible end effectors across `real.connect()` and reloads via per-model `endEffectorFor` persistence in `settings.ts`, and preserved the selected robot model when disconnecting from a physical arm (`Viewport.vue` `<select>` `v-model` fix).
- Worked around swapped `KHR_draco_mesh_compression.attributes` unique IDs in upstream `ufactory_genesis v0.3.10` Robotiq 2F-85 / 2F-140 finger and knuckle GLBs (`draco.ts`, `SceneController`) by decoding standard glTF attributes via semantic Draco IDs instead of glTF unique IDs (preventing unit normals from rendering as a 1 m sphere).
- Fixed 3D arm zoom/scale jumping when switching end effectors: `SceneController.computeArmReach` now sums only the arm's primary joints (excluding end-effector mimic, TCP, and adapter mounting-hole frames), and `Viewport` preserves the current camera framing when changing end effectors on the same robot model.

## [0.3.1] - 2026-11-25

### Added
- Real robot control for physical UFACTORY arms (xArm 6, default IP `192.168.1.60`) via `xarm-python-sdk`:
  - Sidecar `real.*` JSON-RPC API (`real.connect`, `real.disconnect`, `real.status`, `real.enable`, `real.clear_error`, `real.stop`, `real.step_joint`, `real.step_tcp`, `real.move_joints`, `real.jog_joint_vel`, `real.jog_tcp_vel`, `real.set_tcp`, `real.set_payload`) and 15 Hz `real.state` WebSocket push notifications.
  - Safety guards: default simulation mode on startup, controller `(axis, device_type)` model verification, live hardware `motor_enable_states`/`motor_brake_states` detection on connect (no duplicate enable prompt when motors are already enabled), no automatic `clean_error()`, conservative 20% initial speed on entering real mode, smooth single-send continuous velocity (`duration=0`) backed by a `0.4 s` sidecar heartbeat watchdog, decelerated stop (`set_state(6)`) on button release, non-blocking fast-path `real.stop` (`set_state(4)`), per-model safety boundary checks, and automatic stop/disconnect on WebSocket close or shutdown.
  - Simplified header real-robot connection/status pill & dialog (`RealRobotControl`), model selector lock while connected, `MotionPanel` enable/fault guard banner, and confirmed stationary TCP/Payload write-back.
- Collapse/expand toggle button on the 3D stage top-right TCP pose & joint angles telemetry card (`StageTelemetry.vue`), shrinking to a compact header pill when collapsed while keeping 3D orbit drag pass-through on the expanded readout.
- Support for upstream `vacuum_gripper` end effector on UF850 and xArm 5/6/7, plus `STLLoader` fallback in `SceneController` for end-effector links with STL visuals (e.g. Lite 6 gripper fingers).
- Windows 10+ NSIS installer (`*-setup.exe`) packaging in CI and multi-platform GitHub Release workflow (`build-linux` + `build-windows` -> `publish` with combined `SHA256SUMS.txt`), using `conda-forge` (`core/environment-win.yml`) via `mamba-org/setup-micromamba`.

### Changed
- Replaced `docs/images/main-view.png` and `docs/images/settings.png` with 0.3.1 two-column English UI screenshots, and synced `README.md` / `README.zh.md` with the new workbench layout, motion speeds (`220 ms` hold, `2.3–230 mm/s`, `1–40 °/s` TCP, `1–45 °/s` joints), real-robot control, `ufactory_genesis` `v0.3.9` (`b33810e`), and Windows 10+ build instructions.
- Removed the 3D stage bottom-right `COM` toggle/overlay (payload mass & COM remain configurable in `TCP Payload`) and the header/about personal-project badge from the app UI.
- Synced upstream `ufactory_genesis` pin from `be49519` to `v0.3.9` (`b33810e`):
  - Adapted `UfgCatalog` and `scripts/sync_assets.py` to upstream runtime URDF assembly (`assembly.yaml`) by pre-composing `(robot, end_effector)` visual URDFs into `urdf/composed/` and parsing default TCP frames in memory via `pin.buildModelFromXML`.
  - Default TCP offsets for all end effectors are now read directly from upstream composed URDFs (Gripper G2 `173.5 mm`, BIO Gripper G2 `[157.639, -0.035, 57.516, 0, 0, -0.36]`, Vacuum Gripper `126.0 mm`, Lite 6 Gripper `83.6 mm`, Lite 6 Vacuum Gripper `61.0 mm`).
  - Updated PyInstaller `core/ugclient-core.spec` to bundle `assembly.yaml`, `xarm-python-sdk`, and Windows `conda-forge` Pinocchio/EigenPy/Coal DLLs while keeping `torch`/`genesis` excluded and lazily importing `xarm` to protect stdout handshake.

### Fixed
- Real-robot continuous jogging no longer stutters in segments (replaced repeated finite-duration velocity commands with single-send continuous velocity + 100 ms heartbeat watchdog), and fixed first-press self-abort from initial ready state in `usePressHold.ts` plus Pinocchio `Data` thread locking in `rpc.py`.
- Windows sidecar launch/termination console window flash (`CREATE_NO_WINDOW` in `sidecar.rs`) and URDF loading under non-ASCII Windows installation paths (`pin.buildModelFromXML` via UTF-8 read in `factory.py`).

## [0.3.0] - 2026-10-12

### Changed
- Compact motion bar (mockup v9): 240 px total height, 46 px header, 140 px XYZ/RPY pads, smaller buttons, value boxes and joint rows.
- STOP moved out of the bar into a floating red button at the top right of the 3D view, level with the view toolbar. Behavior unchanged (state 4).
- Base and TCP coordinate axes drawn as solid X red / Y green / Z blue (always visible over the robot); the view toolbar shows a matching X/Y/Z legend.
- Camera framing tuned for the larger free scene area.
- Home and Align follow the jog click/hold model: a click moves one joint-space step toward the target (at most 1 deg per joint) and ends in state 4; holding moves continuously at joint speed until release (state 4) or arrival. Align's unreachable error is shown before any motion.
- The 中/EN language switch moved to a dark floating pill at the top right, next to STOP.
- Settings button (⚙) at the bottom of the left panel opens the Settings dialog.

### Added
- Settings dialog (dark style, persisted in localStorage `ugclient.settings`):
  - Jog: click step for linear axes (mm, default 1) and angular axes / joints (deg, default 1), validated (0.01-100 mm, 0.01-45 deg). Replaces the hardcoded steps; hold threshold and speed scale stay fixed.
  - Safety boundary, stored per robot model: TCP X/Y/Z min/max in the base frame (default unbounded) and per-joint min/max (default and clamped to the model limits). Jog, Home and Align stop at the boundary and a dialog names the axis (e.g. "TCP Z reached the safety boundary (max 240.0 mm)"). Moves back into the boundary are allowed.
  - General: language (synced with the top-right switch), default robot model, restore the last session (robot, end effector, TCP offset, payload, joints) on startup.
  - About: app, core, ufactory_genesis and Pinocchio versions, MIT license, personal-project note.

## [0.2.0] - 2026-10-10

### Added
- Bottom motion control bar on the Check page (simulation only, no real robot): speed slider (default 50 %), Home (all joints to 0), Align and STOP; J1-J6 colored sliders with limits, value box and -/+ buttons; Z-/Z+ and Yaw-/Yaw+ buttons with round XYZ and RPY jog pads. Collapsible.
- Click moves one step (1 mm / 1 deg); press and hold (> 300 ms) moves continuously until release. Release or STOP sets the simulated state to 4. 100 % speed = 230 mm/s linear, 40 deg/s joints and rotation. Constants live in `apps/desktop/src/lib/motion.ts` until a settings page exists.
- Sidecar methods `motion.jog_tcp` (base-frame TCP increment via IK, with joint-jump and joint-limit guards) and `motion.align` (only the last three joints move so the tool z-axis points straight down, roll 180 / pitch 0 / current heading; TCP position may change; error if unreachable).
- Joint limit hits and unreachable targets stop the motion and show a dialog.

### Changed
- New window shell matching the v8 mockup: a light 3D scene (background #f7f8f9, light grid, fog) fills the window; dark rounded floating panels sit on top (left: robot / TCP offset / payload with connection status and language switch; right: read-only state; bottom: motion bar; top centre: view toolbar with reset view and Base/TCP/COM toggles). The camera frames the robot's reach in the free area between the panels.
- The light top bar, status footer and the Check/Trajectory/Workspace tabs are removed for now (Trajectory and Workspace were placeholders).
- Check page now follows the approved v8 mockup: the right panel is a read-only state view (state, mode, payload, mounting, TCP pose, joint angles); joint sliders live in the motion bar.

### Removed
- Check page "Target TCP pose / Solve IK" section, the joint torque table (incl. CSV export button) and the left-panel Status (TCP/Flange) block. The sidecar methods (`check.pose`, `kin.ik`, `dyn.gravity`) and store functions remain.

## [0.1.1] - 2026-10-10

### Changed
- Renamed the product to **UGClient** (UFACTORY Genesis Client, formerly Uclient): repository `DanielWang123321/ugclient`, deb package and binary `ugclient`, Python package `uclient_core` -> `ugclient_core` (sidecar `ugclient-core`), app identifier `io.github.danielwang123321.ugclient`, env vars `UGCLIENT_*`. Project files are now `*.ugclient.json`; legacy `*.uclient.json` files still load.
- Pinned ufactory_genesis to `be49519` (official UFACTORY joint torque limits, PR #3). Utilization percentages change (UF850 U1: J2 37.5% -> 19.6%, J3 34.0% -> 12.6%); absolute torques are unchanged.
- "Rated" torque renamed to "max torque" everywhere (these are UFACTORY maximum joint torques, see https://docs.supportarticle.ufactory.cc/zhHans/support_articles/hardware/ufactory-joint-parameters.html): UI column "% of max torque" / "占最大扭矩 %", CSV column `rated_nm` -> `max_torque_nm`. The API field `effort_limits_nm` is unchanged.

### Fixed
- End effectors (Gripper G2, BIO Gripper G2, Lite6 gripper / vacuum gripper) could not be added: their GLB meshes were not bundled.
- Mounting an end effector now sets its default TCP from the ufactory_genesis URDF tcp joint (G2 z 172 mm, Lite6 gripper z 83.6 mm, BIO G2 [159.5, 0, 59.5, 0, 0, 0] official UFACTORY value, Lite6 vacuum [0, 0, 61.1, 0, 0, 0] official UFACTORY value). The v0.1.0 "Gripper G2" preset of 101.1 mm was a grasp-planning offset, not the TCP, and is removed from projects on load.

## [0.1.0] - 2026-10-10

First development release. Uclient is a personal project, not an official UFACTORY product.

### Added
- `uclient-core` Python sidecar: JSON-RPC 2.0 over WebSocket on 127.0.0.1 with one-time token auth and API version negotiation.
- Pinocchio backends behind an adapter layer: FK, Jacobian, multi-solution damped-least-squares IK, payload-aware gravity torque (arm/payload split), RNEA and mass matrix.
- `check.pose`: TCP pose (Studio conventions, mm/°) to all IK solutions with joint torques and rated-torque utilisation.
- Supported models: UF850, xArm5/6/7 (`_1305` only), Lite6. Rated torques read at runtime from ufactory_genesis.
- Tauri v2 desktop app (Vue 3 + Element Plus, Chinese/English): Studio-like check page, joint sliders, IK solution picker, torque table, CSV export, three.js URDF viewport with TCP axes and payload COM marker.
- Linux deb packaging; CI for Linux and Windows unit tests; U1 golden test (UF850, 3 kg payload).
