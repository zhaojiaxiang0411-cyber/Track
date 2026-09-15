import type { Team } from "./types";

// Team 配色：cisco 蓝、homison 橙、esxi 紫。
// esxi 不用绿色，避免与「已完成」状态的 emerald 撞色。
// 类名必须以字面量出现在源码中，Tailwind 才能扫描到，勿改为拼接生成。
export interface TeamStyle {
  /** 步骤按钮：已完成 */
  buttonDone: string;
  /** 步骤按钮：当前且可点击 */
  buttonActionable: string;
  /** 步骤按钮：当前但无权操作 */
  buttonLocked: string;
  /** 进度点：已完成 */
  dotDone: string;
  /** 进度点：进行中 */
  dotCurrent: string;
  /** 悬浮卡片内的小色点 */
  tooltipDot: string;
  /** 状态胶囊（浅底深字） */
  badge: string;
  /** 呼叫确认横幅：浅底深字 + 同色描边，比 badge 更醒目 */
  banner: string;
  /** 纯文字色 */
  text: string;
  /** 实心小圆点 */
  dot: string;
}

export const TEAM_STYLES: Record<Team, TeamStyle> = {
  A: {
    buttonDone: "border-blue-700 bg-blue-600 text-white",
    buttonActionable:
      "animate-pulse border-2 border-blue-500 bg-blue-100 text-blue-900 shadow-md cursor-pointer",
    buttonLocked:
      "border-2 border-dashed border-blue-300 bg-blue-50 text-blue-400 cursor-not-allowed",
    dotDone: "bg-blue-600",
    dotCurrent:
      "bg-blue-500 ring-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.35)]",
    tooltipDot: "bg-blue-400",
    badge: "bg-blue-100 text-blue-800",
    banner: "bg-blue-50 text-blue-900 ring-2 ring-blue-400",
    text: "text-blue-600",
    dot: "bg-blue-600",
  },
  B: {
    buttonDone: "border-orange-700 bg-orange-600 text-white",
    buttonActionable:
      "animate-pulse border-2 border-orange-500 bg-orange-100 text-orange-900 shadow-md cursor-pointer",
    buttonLocked:
      "border-2 border-dashed border-orange-300 bg-orange-50 text-orange-400 cursor-not-allowed",
    dotDone: "bg-orange-600",
    dotCurrent:
      "bg-orange-500 ring-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.35)]",
    tooltipDot: "bg-orange-400",
    badge: "bg-orange-100 text-orange-800",
    banner: "bg-orange-50 text-orange-900 ring-2 ring-orange-400",
    text: "text-orange-600",
    dot: "bg-orange-600",
  },
  C: {
    buttonDone: "border-violet-700 bg-violet-600 text-white",
    buttonActionable:
      "animate-pulse border-2 border-violet-500 bg-violet-100 text-violet-900 shadow-md cursor-pointer",
    buttonLocked:
      "border-2 border-dashed border-violet-300 bg-violet-50 text-violet-400 cursor-not-allowed",
    dotDone: "bg-violet-600",
    dotCurrent:
      "bg-violet-500 ring-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,0.35)]",
    tooltipDot: "bg-violet-400",
    badge: "bg-violet-100 text-violet-800",
    banner: "bg-violet-50 text-violet-900 ring-2 ring-violet-400",
    text: "text-violet-600",
    dot: "bg-violet-600",
  },
};

export function teamStyle(team: Team): TeamStyle {
  return TEAM_STYLES[team];
}
