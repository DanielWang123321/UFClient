# Changelog

All notable changes to UGClient (formerly Uclient) are documented here. Format: [Keep a Changelog](https://keepachangelog.com/), versioning: SemVer.

## [Unreleased]

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
