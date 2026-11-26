// Controller fault code catalog aligned with xarm-python-sdk ControllerErrorCodeMap.
export interface ControllerErrorEntry {
  zh: { title: string; desc: string }
  en: { title: string; desc: string }
}

export interface ControllerErrorDetail {
  codeLabel: string
  title: string
  desc: string
}

const CONTROLLER_ERRORS: Record<number, ControllerErrorEntry> = {
  1: {
    zh: {
      title: '控制器上的紧急停止按钮被按下',
      desc: '请释放紧急停止按钮，然后点击清除错误或重新使能机械臂。',
    },
    en: {
      title: 'Controller Emergency Stop Pressed',
      desc: 'Release the emergency stop button on the controller, then clear error and re-enable.',
    },
  },
  2: {
    zh: {
      title: '控制器紧急停止 IO 被触发',
      desc: '请检查控制器安全急停 IO 回路后再清除错误并重新使能。',
    },
    en: {
      title: 'Control Box Emergency IO Triggered',
      desc: 'Check the controller safety E-stop IO circuit before clearing error and re-enabling.',
    },
  },
  3: {
    zh: {
      title: '三态开关紧急停止按钮被按下',
      desc: '请释放三态开关上的紧急停止按钮，然后清除错误并重新使能。',
    },
    en: {
      title: 'Three-State Switch Emergency Stop Pressed',
      desc: 'Release the three-state switch emergency stop button, then clear error and re-enable.',
    },
  },
  10: {
    zh: { title: '关节电机错误', desc: '请检查关节驱动状态并尝试清除错误；如反复报错请重启控制器。' },
    en: { title: 'Servo Motor Error', desc: 'Inspect joint drive status and clear error; reboot controller if persistent.' },
  },
  11: {
    zh: { title: '关节 1 错误', desc: '请检查关节 1 状态并确认无碰撞遮挡后清除错误。' },
    en: { title: 'Servo Motor 1 Error', desc: 'Check joint 1 and workspace clearance before clearing the error.' },
  },
  12: {
    zh: { title: '关节 2 错误', desc: '请检查关节 2 状态并确认无碰撞遮挡后清除错误。' },
    en: { title: 'Servo Motor 2 Error', desc: 'Check joint 2 and workspace clearance before clearing the error.' },
  },
  13: {
    zh: { title: '关节 3 错误', desc: '请检查关节 3 状态并确认无碰撞遮挡后清除错误。' },
    en: { title: 'Servo Motor 3 Error', desc: 'Check joint 3 and workspace clearance before clearing the error.' },
  },
  14: {
    zh: { title: '关节 4 错误', desc: '请检查关节 4 状态并确认无碰撞遮挡后清除错误。' },
    en: { title: 'Servo Motor 4 Error', desc: 'Check joint 4 and workspace clearance before clearing the error.' },
  },
  15: {
    zh: { title: '关节 5 错误', desc: '请检查关节 5 状态并确认无碰撞遮挡后清除错误。' },
    en: { title: 'Servo Motor 5 Error', desc: 'Check joint 5 and workspace clearance before clearing the error.' },
  },
  16: {
    zh: { title: '关节 6 错误', desc: '请检查关节 6 状态并确认无碰撞遮挡后清除错误。' },
    en: { title: 'Servo Motor 6 Error', desc: 'Check joint 6 and workspace clearance before clearing the error.' },
  },
  17: {
    zh: { title: '关节 7 错误', desc: '请检查关节 7 状态并确认无碰撞遮挡后清除错误。' },
    en: { title: 'Servo Motor 7 Error', desc: 'Check joint 7 and workspace clearance before clearing the error.' },
  },
  18: {
    zh: { title: '力矩传感器通信失败', desc: '请检查六维力矩传感器是否正确安装并连接线缆。' },
    en: { title: 'Force Torque Sensor Communication Error', desc: 'Please check whether the force torque sensor is installed.' },
  },
  19: {
    zh: {
      title: '末端工具通信失败',
      desc: '请检查末端工具是否安装，波特率设置是否正确。',
    },
    en: {
      title: 'End Effector Communication Error',
      desc: 'Please check whether the end effector is installed and the baud rate setting is correct.',
    },
  },
  21: {
    zh: { title: '运动学错误', desc: '目标路径或姿态不可求解，请重新规划路径后清除错误。' },
    en: { title: 'Kinematic Error', desc: 'Please re-plan the path before clearing the error.' },
  },
  22: {
    zh: {
      title: '自碰撞错误',
      desc: '机械臂即将发生自碰撞，请重新规划路径；如持续报错，请手动拖动机械臂回到安全区域。',
    },
    en: {
      title: 'Self-Collision Error',
      desc: 'Robot is close to self-collision. Re-plan the path or move the arm back to a safe pose.',
    },
  },
  23: {
    zh: {
      title: '关节角度超出限制',
      desc: '关节位置超出软/硬限位，请在确认安全后清除错误并移回允许范围。',
    },
    en: {
      title: 'Joints Angle Exceed Limit',
      desc: 'Joint angle exceeded limits. Clear the error and move the robot back into range.',
    },
  },
  24: {
    zh: {
      title: '速度超出限制',
      desc: '请检查运动指令速度或加速度设置是否过大，适当调低后再试。',
    },
    en: {
      title: 'Speed Exceeds Limit',
      desc: 'Check if the arm is out of range or reduce motion speed and acceleration.',
    },
  },
  25: {
    zh: { title: '规划错误', desc: '请重新规划路径或降低运动速度后重试。' },
    en: { title: 'Planning Error', desc: 'Please re-plan the path or reduce motion speed.' },
  },
  26: {
    zh: { title: 'Linux RT 错误', desc: '控制器实时系统异常，如清除无效请联系技术支持。' },
    en: { title: 'Linux RT Error', desc: 'Controller real-time error; contact technical support if it persists.' },
  },
  27: {
    zh: { title: '回复指令错误', desc: '请尝试清除错误后重试，或通过控制器急停按钮重启机械臂。' },
    en: { title: 'Command Reply Error', desc: 'Clear the error and retry, or reboot the controller if needed.' },
  },
  28: {
    zh: { title: '末端通信失败', desc: '请检查末端模块供电与通信线缆，如持续失败请重启控制器。' },
    en: { title: 'End Module Communication Error', desc: 'Check end module wiring or restart the controller if it persists.' },
  },
  30: {
    zh: { title: '反馈速度超出限制', desc: '实际反馈速度异常超限，请检查负载与周边障碍后联系技术支持。' },
    en: { title: 'Feedback Speed Exceeds Limit', desc: 'Inspect payload and obstructions; contact support if persistent.' },
  },
  31: {
    zh: {
      title: '碰撞导致电流异常',
      desc: '请检查机械臂是否发生碰撞、TCP 负载及碰撞灵敏度设置是否匹配。',
    },
    en: {
      title: 'Collision Caused Abnormal Current',
      desc: 'Check for collisions and verify payload and collision sensitivity settings.',
    },
  },
  32: {
    zh: { title: '三点圆弧指令计算出错', desc: '三点圆弧点位无法构成有效圆弧，请重新调整点位。' },
    en: { title: 'Three-Point Circle Calculation Error', desc: 'Reset the arc waypoints to form a valid arc.' },
  },
  33: {
    zh: { title: '控制器 GPIO 模块报错', desc: '请检查控制器 GPIO 模块连接，必要时重新上下电。' },
    en: { title: 'Controller GPIO Error', desc: 'Inspect controller GPIO module connection and power-cycle if needed.' },
  },
  34: {
    zh: { title: '轨迹录制超时', desc: '轨迹录制时长超过 5 分钟上限，请分段重新录制。' },
    en: { title: 'Recording Timeout', desc: 'Trajectory recording exceeded the 5-minute limit.' },
  },
  35: {
    zh: { title: '机械臂到达安全边界', desc: '已触发安全边界限制，请清除错误并向安全边界内移动。' },
    en: { title: 'Safety Boundary Limit', desc: 'Safety boundary reached. Clear the error and move inside the boundary.' },
  },
  36: {
    zh: { title: '延时指令数量超限', desc: '待执行的延时指令或位置检测指令超过 36 个上限。' },
    en: { title: 'Too Many Delay Commands', desc: 'Pending delay or position detection commands exceeded the 36-item limit.' },
  },
  37: {
    zh: { title: '手动模式运动异常', desc: '请检查机械臂 TCP 负载设置与安装方式是否与实际匹配。' },
    en: { title: 'Abnormal Movement in Manual Mode', desc: 'Verify TCP payload and mounting settings match physical setup.' },
  },
  38: {
    zh: { title: '关节角度异常', desc: '请通过控制器紧急停止按钮停止机械臂并联系技术支持。' },
    en: { title: 'Abnormal Joint Angle', desc: 'Stop the robot via controller E-stop and contact technical support.' },
  },
  39: {
    zh: { title: '电源板主从 IC 通信异常', desc: '电源板通信异常，如清除后复现请联系技术支持。' },
    en: { title: 'Power Board IC Communication Error', desc: 'Power board communication abnormal; contact technical support if it recurs.' },
  },
  40: {
    zh: { title: '无报错的关节轨迹求解失败', desc: '请微调目标点位姿态或关节角度后重试。' },
    en: { title: 'Error-Free Joint Trajectory Solution Failure', desc: 'Adjust the target waypoint slightly and retry.' },
  },
  41: {
    zh: { title: '摩擦力文件内容无效', desc: '请重启控制器，若多次重启无效请联系技术支持。' },
    en: { title: 'Invalid Friction File Content', desc: 'Reboot the controller; contact support if the error persists.' },
  },
  42: {
    zh: { title: '校准文件内容无效', desc: '请重启控制器，若多次重启无效请联系技术支持。' },
    en: { title: 'Invalid Calibration File Content', desc: 'Reboot the controller; contact support if the error persists.' },
  },
  50: {
    zh: { title: '六维力矩传感器读取数据错误', desc: '请检查力矩传感器通信连接并清除错误后重试。' },
    en: { title: 'Six-Axis Force Torque Sensor Read Error', desc: 'Check sensor connection and clear error before retrying.' },
  },
  51: {
    zh: { title: '六维力矩传感器设置模式错误', desc: '请确认传感器状态正常后重新设置模式。' },
    en: { title: 'Six-Axis Force Torque Sensor Set Mode Error', desc: 'Verify sensor status before setting its mode.' },
  },
  52: {
    zh: { title: '六维力矩传感器设置零点错误', desc: '请确保传感器处于无外部受力状态后再设置零点。' },
    en: { title: 'Six-Axis Force Torque Sensor Set Zero Error', desc: 'Ensure no external load is applied before zeroing the sensor.' },
  },
  53: {
    zh: { title: '六维力矩传感器过载或读数超限', desc: '请移除超额负载，避免碰撞冲击后清除错误。' },
    en: { title: 'Six-Axis Force Torque Sensor Overloaded', desc: 'Remove excess load before clearing the fault.' },
  },
  60: {
    zh: { title: '关节伺服模式线速度超过限制', desc: '线速度超过关节伺服模式允许上限，请降低伺服点位步进速度。' },
    en: { title: 'Linear Speed Exceeded Limit in Servo Mode', desc: 'Linear speed exceeded the servo_j safety limit; slow down target updates.' },
  },
  110: {
    zh: { title: '机械臂底座板通信异常', desc: '请检查底座供电与通信线缆，如持续失败请联系技术支持。' },
    en: { title: 'Robot Arm Base Board Communication Error', desc: 'Check base board communication or contact technical support.' },
  },
  111: {
    zh: { title: '控制器外接 485 设备通信异常', desc: '请检查控制器外接 RS-485 设备接线、供电及波特率配置。' },
    en: { title: 'External RS-485 Device Communication Error', desc: 'Check external RS-485 wiring, power, and baud rate configuration.' },
  },
}

export function formatControllerErrorCode(code: number): string {
  return `C${code}`
}

export function getControllerErrorInfo(code: number, locale: string): ControllerErrorDetail {
  const isZh = locale.toLowerCase().startsWith('zh')
  const lang = isZh ? 'zh' : 'en'
  const entry = CONTROLLER_ERRORS[code]
  if (entry) {
    return {
      codeLabel: formatControllerErrorCode(code),
      title: entry[lang].title,
      desc: entry[lang].desc,
    }
  }
  return {
    codeLabel: formatControllerErrorCode(code),
    title: isZh ? '控制器故障' : 'Controller Error',
    desc: isZh
      ? '请先排查机械臂状态与周边环境，再点击「清除错误」恢复控制。'
      : 'Inspect the robot state and workspace, then click Clear error to recover.',
  }
}
